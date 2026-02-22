import sql from "@/app/api/utils/sql";
import { getQuestionMetadata } from "../services/questionService.js";
import { handleApproved } from "./outcomeHandlers.js";

export async function transitionToNextPhase(
  userId,
  state,
  config,
  latestPhaseRules,
  shouldEscalate,
) {
  const nextPhaseId = shouldEscalate
    ? "phase_4"
    : state.currentPhase === "phase_1"
      ? "phase_2"
      : state.currentPhase === "phase_2"
        ? "phase_3"
        : "phase_4";

  const nextPhase = config.phases.find((p) => p.id === nextPhaseId);
  const nextPhaseRules =
    latestPhaseRules[nextPhaseId] || config.scoring.phase_rules[nextPhaseId];

  if (!nextPhase) {
    // No more phases, approve by default
    return await handleApproved(userId, state);
  }

  // Select questions for next phase
  const available = Array.isArray(nextPhase.questions)
    ? nextPhase.questions.length
    : 0;

  if (available === 0) {
    return Response.json(
      { error: `No questions available for ${nextPhaseId}` },
      { status: 500 },
    );
  }

  const rawMin = Number.isFinite(nextPhaseRules?.serve_count_min)
    ? nextPhaseRules.serve_count_min
    : available;
  const rawMax = Number.isFinite(nextPhaseRules?.serve_count_max)
    ? nextPhaseRules.serve_count_max
    : available;

  const minQuestions = Math.max(1, Math.min(available, rawMin));
  const maxQuestions = Math.max(minQuestions, Math.min(available, rawMax));

  const questionCount =
    Math.floor(Math.random() * (maxQuestions - minQuestions + 1)) +
    minQuestions;

  const shuffled = [...nextPhase.questions].sort(() => Math.random() - 0.5);
  const selectedQuestions = shuffled.slice(0, questionCount);

  state.currentPhase = nextPhaseId;
  state.currentQuestionIndex = 0;
  state.servedQuestionIds = selectedQuestions.map((q) => q.id);

  const phaseNum = parseInt(nextPhaseId.split("_")[1]);
  await sql`
    UPDATE users 
    SET screening_phase = ${phaseNum},
        screening_state_json = ${JSON.stringify(state)}::jsonb
    WHERE id = ${userId}
  `;

  const firstQuestion = selectedQuestions[0];
  const {
    allowMultiple: firstAllowMultiple,
    minSelectionsRequired: firstMinSelectionsRequired,
    minSelectionsPenalty: firstMinSelectionsPenalty,
  } = await getQuestionMetadata(firstQuestion);

  return Response.json({
    question: {
      id: firstQuestion.id,
      text: firstQuestion.text,
      allowMultiple: firstAllowMultiple,
      minSelectionsRequired: firstMinSelectionsRequired,
      minSelectionsPenalty: firstMinSelectionsPenalty,
      answers: firstQuestion.answers.map((a) => ({
        id: a.id,
        text: a.text,
      })),
    },
    progress: {
      step: 1,
      totalSteps: selectedQuestions.length,
      currentPhase: nextPhaseId,
    },
  });
}
