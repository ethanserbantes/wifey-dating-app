import sql from "@/app/api/utils/sql";

const AUTO_APPROVE_AFTER_MS = 3500;

export async function getUser(userId) {
  const users = await sql`
    SELECT id, status, screening_state_json 
    FROM users 
    WHERE id = ${userId}
  `;

  if (users.length === 0) {
    return null;
  }

  return users[0];
}

export async function getUserProfile(userId) {
  // Hybrid auto-approval: if pending selfie has aged a couple seconds and no admin
  // has reviewed it, mark verified.
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
    console.error("[VERIFY] auto-approve update failed (quiz/userService)", e);
  }

  const profileRows = await sql`
    SELECT gender, verified_gender, is_verified, verification_status
    FROM user_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  return profileRows?.[0] || null;
}

export async function updateUserScreeningState(userId, state) {
  await sql`
    UPDATE users 
    SET screening_state_json = ${JSON.stringify(state)}::jsonb
    WHERE id = ${userId}
  `;
}

export async function updateUserStatus(
  userId,
  status,
  screeningPhase,
  cooldownUntil,
  state,
) {
  await sql`
    UPDATE users 
    SET status = ${status},
        screening_phase = ${screeningPhase},
        cooldown_until = ${cooldownUntil},
        screening_state_json = ${JSON.stringify(state)}::jsonb
    WHERE id = ${userId}
  `;
}

export async function updateScreeningAttempt(userId, answers, phaseScores) {
  await sql`
    UPDATE screening_attempts 
    SET answers_json = ${JSON.stringify(answers)}::jsonb,
        phase_scores_json = ${JSON.stringify(phaseScores)}::jsonb
    WHERE user_id = ${userId} AND outcome = 'IN_PROGRESS'
  `;
}

export async function completeScreeningAttempt(
  userId,
  outcome,
  answers,
  phaseScores,
) {
  await sql`
    UPDATE screening_attempts 
    SET outcome = ${outcome},
        completed_at = NOW(),
        answers_json = ${JSON.stringify(answers)}::jsonb,
        phase_scores_json = ${JSON.stringify(phaseScores)}::jsonb
    WHERE user_id = ${userId} AND outcome = 'IN_PROGRESS'
  `;
}
