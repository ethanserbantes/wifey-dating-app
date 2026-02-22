import sql from "@/app/api/utils/sql";
import { hydrateConfigWithDbQuestions } from "@/app/api/quiz/utils/hydrateConfigQuestions.js";

const AUTO_APPROVE_AFTER_MS = 3500;

function toAudienceGender(profileGender) {
  const raw = (profileGender ?? "").toString().trim();
  const upper = raw.toUpperCase();

  if (upper === "MALE" || upper === "M" || upper === "MAN") return "MALE";
  if (upper === "FEMALE" || upper === "F" || upper === "WOMAN") return "FEMALE";

  // Backward compat for stored title-case values
  if (raw === "Male") return "MALE";
  if (raw === "Female") return "FEMALE";

  return "ALL";
}

function canonicalProfileGenderFromAudience(audienceGender) {
  const g = (audienceGender || "").toString().trim().toUpperCase();
  if (g === "MALE") return "Male";
  if (g === "FEMALE") return "Female";
  return null;
}

function normalizeAudienceGenderInput(input) {
  const raw = (input ?? "").toString().trim();
  const upper = raw.toUpperCase();

  if (upper === "MALE" || upper === "M" || upper === "MAN") return "MALE";
  if (upper === "FEMALE" || upper === "F" || upper === "WOMAN") return "FEMALE";
  if (upper === "ALL") return "ALL";

  // Also accept title-case values from mobile/web UIs
  if (raw === "Male") return "MALE";
  if (raw === "Female") return "FEMALE";

  return null;
}

function toNumberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numericIdFromRuntimeId(runtimeId, prefix) {
  if (runtimeId == null) {
    return null;
  }

  const s = String(runtimeId);
  const expectedPrefix = `${prefix}_`;

  if (!s.startsWith(expectedPrefix)) {
    const asNum = Number(s);
    return Number.isFinite(asNum) ? asNum : null;
  }

  const raw = s.slice(expectedPrefix.length);
  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum : null;
}

async function fetchActiveQuizConfigRow({ audienceGender }) {
  const rows = await sql`
    SELECT id, version, audience_gender, config_json
    FROM quiz_configs
    WHERE is_active = true
      AND audience_gender = ${audienceGender}
    LIMIT 1
  `;
  return rows?.[0] || null;
}

async function fetchLatestQuizConfigRow({ audienceGender }) {
  const rows = await sql`
    SELECT id, version, audience_gender, config_json, is_active
    FROM quiz_configs
    WHERE audience_gender = ${audienceGender}
    ORDER BY version DESC, id DESC
    LIMIT 1
  `;
  return rows?.[0] || null;
}

async function bestEffortActivateConfigRow({ configId, audienceGender }) {
  if (!configId || !audienceGender) {
    return;
  }

  try {
    // Ensure we satisfy the unique partial index (one active per audience).
    await sql.transaction((txn) => [
      txn`
        UPDATE quiz_configs
        SET is_active = false
        WHERE audience_gender = ${audienceGender}
          AND is_active = true
      `,
      txn`
        UPDATE quiz_configs
        SET is_active = true
        WHERE id = ${configId}
      `,
    ]);
  } catch (e) {
    // Non-fatal; we can still serve the config row even if activation fails.
    console.error("[QUIZ] best-effort activate config failed", e);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, audienceGender } = body;

    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    // Check user status
    const users = await sql`
      SELECT id, status, cooldown_until, screening_phase, screening_state_json
      FROM users 
      WHERE id = ${userId}
    `;

    if (users.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const user = users[0];

    // Check if user is lifetime ineligible
    if (user.status === "LIFETIME_INELIGIBLE") {
      return Response.json({
        outcome: "LIFETIME_INELIGIBLE",
        message:
          "We're sorry, but you're not eligible to use Wifey at this time.",
      });
    }

    // Check if user is on cooldown
    if (user.status === "COOLDOWN") {
      const now = new Date();
      const cooldownUntil = user.cooldown_until
        ? new Date(user.cooldown_until)
        : null;

      if (cooldownUntil && now < cooldownUntil) {
        return Response.json({
          outcome: "COOLDOWN",
          message: "Please try again later.",
          cooldownUntil: cooldownUntil.toISOString(),
        });
      }

      // Cooldown expired, reset user
      await sql`
        UPDATE users 
        SET status = 'PENDING_SCREENING', 
            screening_phase = 1, 
            screening_state_json = '{}'::jsonb,
            cooldown_until = NULL
        WHERE id = ${userId}
      `;
    }

    // Check if user is already approved
    if (user.status === "APPROVED") {
      return Response.json({
        outcome: "APPROVED",
        message: "You're already approved!",
      });
    }

    // If an older attempt is marked FAILED, treat it like a 30-day cooldown.
    // Policy: there are only two "fail" outcomes:
    // - LIFETIME_INELIGIBLE (permanent)
    // - COOLDOWN (30 days)
    const lastAttemptRows = await sql`
      SELECT outcome, completed_at
      FROM screening_attempts
      WHERE user_id = ${userId}
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    `;

    const lastAttempt = lastAttemptRows?.[0] || null;
    const lastOutcome = lastAttempt?.outcome
      ? String(lastAttempt.outcome)
      : null;
    const hasCompleted = !!lastAttempt?.completed_at;

    if (hasCompleted && lastOutcome === "FAILED") {
      const completedAt = new Date(lastAttempt.completed_at);
      const base = Number.isNaN(completedAt.getTime())
        ? new Date()
        : completedAt;
      const cooldownUntil = new Date(base);
      cooldownUntil.setDate(cooldownUntil.getDate() + 30);

      // Persist onto the user row so the cooldown is enforced across devices/app restarts.
      await sql`
        UPDATE users
        SET status = 'COOLDOWN',
            cooldown_until = ${cooldownUntil.toISOString()},
            screening_phase = 1,
            screening_state_json = '{}'::jsonb
        WHERE id = ${userId}
      `;

      return Response.json({
        outcome: "COOLDOWN",
        message: "Please try again later.",
        cooldownUntil: cooldownUntil.toISOString(),
      });
    }

    // Auto-approve (hybrid flow): if their selfie has been pending for a couple seconds
    // and no admin reviewed it yet, let them proceed.
    try {
      await sql`
        UPDATE user_profiles
        SET is_verified = true,
            verification_status = 'approved',
            updated_at = NOW()
        WHERE user_id = ${userId}
          AND is_verified = false
          AND verification_status = 'pending'
          AND verification_reviewed_at IS NULL
          AND verification_submitted_at IS NOT NULL
          AND verification_submitted_at <= NOW() - (${AUTO_APPROVE_AFTER_MS}::int * INTERVAL '1 millisecond')
      `;
    } catch (e) {
      console.error("[VERIFY] auto-approve update failed (quiz/start)", e);
    }

    const profileRows = await sql`
      SELECT gender, verified_gender, is_verified, verification_status
      FROM user_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const profile = profileRows?.[0] || null;

    // IMPORTANT: Always gate screening behind photo verification.
    // If the profile row doesn't exist yet (new signup), treat it as unverified.
    if (!profile || profile.is_verified !== true) {
      return Response.json(
        {
          error: "Photo verification required",
          verificationRequired: true,
          verificationStatus: String(profile?.verification_status || "none"),
        },
        { status: 403 },
      );
    }

    // Some clients may have an up-to-date local gender even if the profile row is stale.
    // Prefer a valid hint when provided, and (best-effort) sync it back to the profile.
    // NOTE: we prefer verified_gender when available to avoid preference filters overwriting the screening gender.
    const hintedAudienceGender = normalizeAudienceGenderInput(audienceGender);
    const profileGenderForAudience =
      profile?.verified_gender ?? profile?.gender;

    const desiredAudienceGender =
      hintedAudienceGender || toAudienceGender(profileGenderForAudience);

    // Best-effort sync (prevents serving the wrong quiz repeatedly).
    // We sync BOTH `gender` and `verified_gender` when we get a concrete MALE/FEMALE hint.
    if (
      profile &&
      (hintedAudienceGender === "MALE" || hintedAudienceGender === "FEMALE")
    ) {
      const currentAudience = toAudienceGender(profileGenderForAudience);
      if (currentAudience !== hintedAudienceGender) {
        const canonical =
          canonicalProfileGenderFromAudience(hintedAudienceGender);
        if (canonical) {
          try {
            await sql`
              UPDATE user_profiles
              SET gender = ${canonical},
                  verified_gender = ${canonical},
                  updated_at = NOW()
              WHERE user_id = ${userId}
            `;
          } catch (e) {
            console.error("[QUIZ] failed to sync profile gender", e);
          }
        }
      }
    }

    // (Intentionally no automatic backfill from gender -> verified_gender here.
    // We only set verified_gender at registration or when the client sends a trusted hint.
    // This avoids locking in the wrong value if some other flow mistakenly overwrote `gender`.)

    // Get quiz config.
    // Preferred order:
    // 1) active config for desired audience
    // 2) active config for ALL (legacy)
    // 3) latest config for desired audience (best-effort activate)
    // 4) latest config for ALL (best-effort activate)
    let configRow = await fetchActiveQuizConfigRow({
      audienceGender: desiredAudienceGender,
    });

    if (!configRow && desiredAudienceGender !== "ALL") {
      configRow = await fetchActiveQuizConfigRow({ audienceGender: "ALL" });
    }

    if (!configRow) {
      const latestDesired = await fetchLatestQuizConfigRow({
        audienceGender: desiredAudienceGender,
      });

      if (latestDesired) {
        await bestEffortActivateConfigRow({
          configId: latestDesired.id,
          audienceGender: latestDesired.audience_gender,
        });
        configRow = latestDesired;
      }
    }

    if (!configRow && desiredAudienceGender !== "ALL") {
      const latestAll = await fetchLatestQuizConfigRow({
        audienceGender: "ALL",
      });
      if (latestAll) {
        await bestEffortActivateConfigRow({
          configId: latestAll.id,
          audienceGender: latestAll.audience_gender,
        });
        configRow = latestAll;
      }
    }

    if (!configRow) {
      // This is a setup/state problem, not a crash-worthy server error.
      return Response.json(
        {
          error: "No quiz config found",
          detail:
            "No active quiz config is available. Please publish/activate a quiz config in the admin quiz builder.",
        },
        { status: 503 },
      );
    }

    // IMPORTANT: Always hydrate questions from the quiz builder tables.
    const config = await hydrateConfigWithDbQuestions({
      configVersion: configRow.version,
      config: configRow.config_json,
    });

    // Load the latest phase rules from the quiz builder tables (so edits to the active version take effect)
    const phaseRuleRows = await sql`
      SELECT pc.phase_name,
             pc.serve_count_min,
             pc.serve_count_max,
             pc.fail_if_sum_gte,
             pc.escalate_if_sum_gte,
             pc.escalate_if_any_weight_gte,
             pc.approve_if_sum_lte,
             pc.cooldown_if_sum_gte
      FROM quiz_versions v
      JOIN version_phase_configs pc ON pc.version_id = v.id
      WHERE v.version_number = ${configRow.version}
    `;

    const latestPhaseRules = {};
    for (const row of phaseRuleRows) {
      latestPhaseRules[row.phase_name] = {
        serve_count_min: row.serve_count_min,
        serve_count_max: row.serve_count_max,
        fail_if_sum_gte: row.fail_if_sum_gte,
        escalate_if_sum_gte: row.escalate_if_sum_gte,
        escalate_if_any_weight_gte: row.escalate_if_any_weight_gte,
        approve_if_sum_lte: row.approve_if_sum_lte,
        cooldown_if_sum_gte: row.cooldown_if_sum_gte,
      };
    }

    // Create screening attempt
    await sql`
      INSERT INTO screening_attempts (user_id, quiz_config_version, outcome)
      VALUES (${userId}, ${configRow.version}, 'IN_PROGRESS')
    `;

    // Initialize screening state - use the new phase structure
    const phase1 = config.phases.find((p) => p.id === "phase_1");
    const phaseRules =
      latestPhaseRules.phase_1 || config.scoring.phase_rules.phase_1;

    if (
      !phase1 ||
      !Array.isArray(phase1.questions) ||
      phase1.questions.length === 0
    ) {
      return Response.json(
        { error: "Phase 1 has no questions" },
        { status: 500 },
      );
    }

    const available = phase1.questions.length;
    const rawMin = Number.isFinite(phaseRules?.serve_count_min)
      ? phaseRules.serve_count_min
      : available;
    const rawMax = Number.isFinite(phaseRules?.serve_count_max)
      ? phaseRules.serve_count_max
      : available;

    const minQuestions = Math.max(1, Math.min(available, rawMin));
    const maxQuestions = Math.max(minQuestions, Math.min(available, rawMax));

    const questionCount =
      Math.floor(Math.random() * (maxQuestions - minQuestions + 1)) +
      minQuestions;

    // Randomly select questions from phase 1
    const shuffled = [...phase1.questions].sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, questionCount);

    const initialState = {
      currentPhase: "phase_1",
      currentQuestionIndex: 0,
      servedQuestionIds: selectedQuestions.map((q) => q.id),
      answers: [],
      phaseScores: {},
      configVersion: configRow.version,
      // NEW: lock the quiz audience for this attempt so /api/quiz/answer doesn't re-derive it.
      audienceGenderUsed: configRow.audience_gender || desiredAudienceGender,
      pendingOutcome: null,
    };

    await sql`
      UPDATE users 
      SET screening_phase = 1,
          screening_state_json = ${JSON.stringify(initialState)}::jsonb
      WHERE id = ${userId}
    `;

    // Return first question (sanitized)
    const firstQuestion = selectedQuestions[0];
    const allowMultiple =
      !!firstQuestion?.allowMultiple || !!firstQuestion?.allow_multiple;

    let minSelectionsRequired = allowMultiple
      ? toNumberOrNull(
          firstQuestion?.minSelectionsRequired ??
            firstQuestion?.min_selections_required,
        )
      : null;

    let minSelectionsPenalty = allowMultiple
      ? toNumberOrNull(
          firstQuestion?.minSelectionsPenalty ??
            firstQuestion?.min_selections_penalty,
        )
      : null;

    // Prefer the latest values from the question bank if possible (no republish needed)
    if (allowMultiple) {
      const qbId = numericIdFromRuntimeId(firstQuestion?.id, "q");
      if (qbId != null) {
        const qbRows = await sql`
          SELECT min_selections_required, min_selections_penalty
          FROM question_bank
          WHERE id = ${qbId}
          LIMIT 1
        `;

        if (qbRows.length > 0) {
          const dbMinReq = toNumberOrNull(qbRows[0].min_selections_required);
          const dbMinPenalty = toNumberOrNull(qbRows[0].min_selections_penalty);

          if (dbMinReq != null) {
            minSelectionsRequired = dbMinReq;
          }
          if (dbMinPenalty != null) {
            minSelectionsPenalty = dbMinPenalty;
          }
        }
      }
    }

    return Response.json({
      question: {
        id: firstQuestion.id,
        text: firstQuestion.text,
        allowMultiple,
        minSelectionsRequired,
        minSelectionsPenalty,
        answers: firstQuestion.answers.map((a) => ({
          id: a.id,
          text: a.text,
        })),
      },
      progress: {
        step: 1,
        totalSteps: selectedQuestions.length,
        currentPhase: "phase_1",
      },
      // Non-sensitive but super helpful for debugging (and lets the client confirm it's getting the right quiz).
      audienceGenderUsed: configRow.audience_gender,
      configVersion: configRow.version,
    });
  } catch (error) {
    console.error("Error starting quiz:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
