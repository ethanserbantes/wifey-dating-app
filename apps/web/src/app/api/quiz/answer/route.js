import sql from "@/app/api/utils/sql";
import {
  toAudienceGender,
  normalizeAudienceGender,
} from "./utils/genderNormalization.js";
import {
  getQuizConfig,
  getPhaseRules,
  getLifetimeRules,
} from "./services/configService.js";
import {
  getUser,
  getUserProfile,
  updateUserScreeningState,
  updateScreeningAttempt,
} from "./services/userService.js";
import {
  validateAndProcessAnswers,
  applySelectionPenalty,
} from "./handlers/answerValidation.js";
import {
  evaluatePhaseThresholds,
  determinePhaseOutcome,
} from "./handlers/phaseEvaluation.js";
import {
  handleLifetimeIneligible,
  handleCooldown,
  handleFailed,
  handleApproved,
} from "./handlers/outcomeHandlers.js";
import { transitionToNextPhase } from "./handlers/phaseTransition.js";
import { getQuestionMetadata } from "./services/questionService.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, questionId, answerId, answerIds } = body;

    const selectedIdsRaw = Array.isArray(answerIds)
      ? answerIds
      : answerId
        ? [answerId]
        : [];

    const selectedIds = selectedIdsRaw
      .filter((x) => x != null)
      .map((x) => String(x));

    if (!userId || !questionId || selectedIds.length === 0) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get user and config
    const user = await getUser(userId);

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Photo verification gate: enforce here too (not just on /api/quiz/start)
    // so users can't continue a screening attempt if they become unverified.
    const userProfile = await getUserProfile(userId);
    if (userProfile && userProfile.is_verified !== true) {
      return Response.json(
        {
          error: "Photo verification required",
          verificationRequired: true,
          verificationStatus: String(
            userProfile?.verification_status || "none",
          ),
        },
        { status: 403 },
      );
    }

    const state = user.screening_state_json;

    // Guard: user must be mid-screening
    if (!state || typeof state !== "object" || !state.currentPhase) {
      return Response.json(
        { error: "Screening not in progress" },
        { status: 400 },
      );
    }

    // Defensive: older screening_state_json values might not have these arrays/objects
    if (!Array.isArray(state.answers)) {
      state.answers = [];
    }
    if (!state.phaseScores || typeof state.phaseScores !== "object") {
      state.phaseScores = {};
    }

    // IMPORTANT: use the same quiz audience that was chosen at /api/quiz/start.
    // This prevents "male user" lookups from failing when the app temporarily falls back to FEMALE.
    let audienceGender = normalizeAudienceGender(
      state?.audienceGenderUsed || state?.audienceGender,
    );

    // Backward compatible fallback: if old state doesn't have an audience, derive it from profile.
    // NOTE: prefer verified_gender so preference filters can't accidentally override screening gender.
    if (!audienceGender) {
      audienceGender = toAudienceGender(
        userProfile?.verified_gender ?? userProfile?.gender,
      );
    }

    // Get quiz config
    const configResult = await getQuizConfig(
      state?.configVersion,
      audienceGender,
    );

    if (!configResult) {
      return Response.json({ error: "No active quiz config" }, { status: 500 });
    }

    const { version: configVersionToUse, config } = configResult;

    // Load the latest phase rules from the quiz builder tables (so edits to the active version take effect)
    const latestPhaseRules = await getPhaseRules(configVersionToUse);

    // Load lifetime rules from the quiz builder tables too (so you don't have to republish)
    const latestLifetimeRules = await getLifetimeRules(configVersionToUse);

    const currentPhase = config.phases.find((p) => p.id === state.currentPhase);
    if (!currentPhase) {
      return Response.json({ error: "Invalid phase" }, { status: 400 });
    }

    // Find the question
    const question = currentPhase.questions.find((q) => q.id === questionId);
    if (!question) {
      return Response.json({ error: "Question not found" }, { status: 400 });
    }

    // Validate and process answers
    const {
      weightsByAnswerId,
      maxSelectedWeight,
      questionScoreToAdd: initialQuestionScore,
      allowMultiple,
      minSelectionsRequired,
      minSelectionsPenalty,
    } = await validateAndProcessAnswers(question, selectedIds, questionId);

    // Apply selection penalty if needed
    let questionScoreToAdd = applySelectionPenalty(
      state,
      selectedIds,
      allowMultiple,
      minSelectionsRequired,
      minSelectionsPenalty,
      questionId,
      initialQuestionScore,
    );

    // Record answer(s)
    for (const entry of weightsByAnswerId) {
      state.answers.push({
        questionId,
        answerId: entry.answerId,
        weight: entry.weight,
        phase: state.currentPhase,
      });
    }

    // Update phase scores
    if (!state.phaseScores[state.currentPhase]) {
      state.phaseScores[state.currentPhase] = { sum: 0, maxWeight: 0 };
    }
    state.phaseScores[state.currentPhase].sum += questionScoreToAdd;
    state.phaseScores[state.currentPhase].maxWeight = Math.max(
      state.phaseScores[state.currentPhase].maxWeight,
      maxSelectedWeight,
    );

    // Use the latest phase rules for early-stop checks
    const livePhaseRules =
      latestPhaseRules[state.currentPhase] ||
      config.scoring.phase_rules[state.currentPhase];
    const livePhaseScore = state.phaseScores[state.currentPhase];

    const lifetimeRulesToUse =
      latestLifetimeRules.length > 0
        ? latestLifetimeRules
        : Array.isArray(config.lifetimeRules)
          ? config.lifetimeRules
          : [];

    // Evaluate phase thresholds
    evaluatePhaseThresholds(
      state,
      livePhaseRules,
      livePhaseScore,
      lifetimeRulesToUse,
      maxSelectedWeight,
    );

    // Move to next question or evaluate phase
    state.currentQuestionIndex++;

    // Check if phase is complete
    if (state.currentQuestionIndex >= state.servedQuestionIds.length) {
      // If we have a pending outcome, apply it ONLY after the phase is finished.
      if (state?.pendingOutcome?.type === "LIFETIME_INELIGIBLE") {
        return await handleLifetimeIneligible(userId, state);
      }

      if (state?.pendingOutcome?.type === "COOLDOWN") {
        return await handleCooldown(userId, state);
      }

      // Backward compat: older state may still mark phase threshold failures as FAILED.
      // Policy: phase-threshold failures should be a time-based cooldown.
      if (state?.pendingOutcome?.type === "FAILED") {
        return await handleCooldown(userId, state);
      }

      // Get phase rules (prefer live DB rules, fall back to compiled config)
      const phaseRules = livePhaseRules;
      const phaseScore = livePhaseScore;

      const { shouldEscalate, shouldFail, shouldApprove, shouldCooldown } =
        determinePhaseOutcome(state, phaseRules, phaseScore);

      // Policy: shouldFail (from legacy fail_if_sum_gte) behaves like cooldown.
      if (shouldFail) {
        return await handleCooldown(userId, state);
      }

      if (shouldCooldown) {
        return await handleCooldown(userId, state);
      }

      if (shouldApprove) {
        return await handleApproved(userId, state);
      }

      // Move forward (sequential) or escalate to phase_4
      if (
        shouldEscalate ||
        state.currentPhase === "phase_1" ||
        state.currentPhase === "phase_2" ||
        state.currentPhase === "phase_3"
      ) {
        return await transitionToNextPhase(
          userId,
          state,
          config,
          latestPhaseRules,
          shouldEscalate,
        );
      }
    }

    // Serve next question in current phase
    const nextQuestionId = state.servedQuestionIds[state.currentQuestionIndex];
    const nextQuestion = currentPhase.questions.find(
      (q) => q.id === nextQuestionId,
    );

    await updateUserScreeningState(userId, state);

    await updateScreeningAttempt(userId, state.answers, state.phaseScores);

    const {
      allowMultiple: nextAllowMultiple,
      minSelectionsRequired: nextMinSelectionsRequired,
      minSelectionsPenalty: nextMinSelectionsPenalty,
    } = await getQuestionMetadata(nextQuestion);

    return Response.json({
      question: {
        id: nextQuestion.id,
        text: nextQuestion.text,
        allowMultiple: nextAllowMultiple,
        minSelectionsRequired: nextMinSelectionsRequired,
        minSelectionsPenalty: nextMinSelectionsPenalty,
        answers: nextQuestion.answers.map((a) => ({
          id: a.id,
          text: a.text,
        })),
      },
      progress: {
        step: state.currentQuestionIndex + 1,
        totalSteps: state.servedQuestionIds.length,
        currentPhase: state.currentPhase,
      },
    });
  } catch (error) {
    console.error("Error processing answer:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
