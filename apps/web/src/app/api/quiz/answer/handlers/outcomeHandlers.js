import {
  updateUserStatus,
  completeScreeningAttempt,
} from "../services/userService.js";

export async function handleLifetimeIneligible(userId, state) {
  await updateUserStatus(userId, "LIFETIME_INELIGIBLE", 1, null, {});

  await completeScreeningAttempt(
    userId,
    "LIFETIME_INELIGIBLE",
    state.answers,
    state.phaseScores,
  );

  return Response.json({
    outcome: "LIFETIME_INELIGIBLE",
    message: "We're sorry, but you're not eligible to use Wifey at this time.",
  });
}

export async function handleCooldown(userId, state) {
  const cooldownUntil = new Date();
  cooldownUntil.setDate(cooldownUntil.getDate() + 30);

  await updateUserStatus(
    userId,
    "COOLDOWN",
    1,
    cooldownUntil.toISOString(),
    {},
  );

  await completeScreeningAttempt(
    userId,
    "COOLDOWN",
    state.answers,
    state.phaseScores,
  );

  return Response.json({
    outcome: "COOLDOWN",
    message: "Please try again later.",
    cooldownUntil: cooldownUntil.toISOString(),
  });
}

export async function handleFailed(userId, state) {
  // FAILED is distinct from COOLDOWN and should NOT silently become a time-based cooldown.
  // We persist the failure via screening_attempts, and /api/quiz/start will block re-entry.
  await updateUserStatus(userId, "PENDING_SCREENING", 1, null, {});

  await completeScreeningAttempt(
    userId,
    "FAILED",
    state.answers,
    state.phaseScores,
  );

  return Response.json({
    outcome: "FAILED",
    message: "Unfortunately, we can't move forward at this time.",
  });
}

export async function handleApproved(userId, state) {
  await updateUserStatus(userId, "APPROVED", null, null, state);

  await completeScreeningAttempt(
    userId,
    "APPROVED",
    state.answers,
    state.phaseScores,
  );

  return Response.json({
    outcome: "APPROVED",
    message: "Welcome to Wifey! You're all set.",
  });
}
