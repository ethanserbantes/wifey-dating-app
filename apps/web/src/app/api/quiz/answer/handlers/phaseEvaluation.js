import { checkLifetimeRules } from "../utils/ruleEvaluation.js";
import { setPendingOutcome } from "../utils/outcomeManagement.js";

export function evaluatePhaseThresholds(
  state,
  livePhaseRules,
  livePhaseScore,
  lifetimeRulesToUse,
  maxSelectedWeight,
) {
  // Lifetime ban checks (but do NOT end the quiz mid-phase)
  const hardBanWeight = 999999;
  const triggeredHardBan = maxSelectedWeight >= hardBanWeight;

  const triggeredRuleBan = checkLifetimeRules(
    state.answers,
    lifetimeRulesToUse,
  );

  if (triggeredHardBan || triggeredRuleBan) {
    setPendingOutcome(state, "LIFETIME_INELIGIBLE", {
      triggeredBy: triggeredHardBan ? "hard_weight" : "lifetime_rule",
    });
  }

  // IMPORTANT POLICY:
  // - Lifetime ban answers/rules -> LIFETIME_INELIGIBLE (permanent)
  // - "Too many points" / phase thresholds -> COOLDOWN (time-based, 30 days)
  // - CRITICAL: Only check cooldown thresholds at FINAL phase (phase_7)
  //   because thresholds span all 7 phases, not individual phases.
  // We keep the phase rule key name `fail_if_sum_gte` for backward compat with
  // existing quiz builder configs, but it should behave like a cooldown.
  const isFinalPhase = state.currentPhase === "phase_7";

  if (
    isFinalPhase &&
    livePhaseRules?.fail_if_sum_gte != null &&
    livePhaseScore.sum >= livePhaseRules.fail_if_sum_gte
  ) {
    setPendingOutcome(state, "COOLDOWN", { triggeredBy: "phase_threshold" });
  }

  if (
    isFinalPhase &&
    livePhaseRules?.cooldown_if_sum_gte != null &&
    livePhaseScore.sum >= livePhaseRules.cooldown_if_sum_gte
  ) {
    setPendingOutcome(state, "COOLDOWN", {
      triggeredBy: "phase_threshold",
    });
  }
}

export function determinePhaseOutcome(state, phaseRules, phaseScore) {
  let shouldEscalate = false;
  let shouldFail = false;
  let shouldApprove = false;
  let shouldCooldown = false;

  // IMPORTANT: Only check cooldown thresholds at the FINAL phase (phase_7)
  // because thresholds are designed across ALL 7 phases, not per-phase.
  // Checking at phase_1, phase_2, etc. incorrectly fails users mid-screening.
  const isFinalPhase = state.currentPhase === "phase_7";

  // Keep fail/cooldown checks at phase end too (in case weights/rules changed mid-phase)
  // NOTE: `fail_if_sum_gte` is treated as COOLDOWN (see policy above).
  // Only applies at final phase.
  if (
    isFinalPhase &&
    phaseRules?.fail_if_sum_gte != null &&
    phaseScore.sum >= phaseRules.fail_if_sum_gte
  ) {
    shouldCooldown = true;
  }

  if (
    !shouldCooldown &&
    isFinalPhase &&
    phaseRules?.cooldown_if_sum_gte != null &&
    phaseScore.sum >= phaseRules.cooldown_if_sum_gte
  ) {
    shouldCooldown = true;
  }

  // Keep escalation logic
  if (!shouldFail && !shouldCooldown) {
    if (
      (phaseRules?.escalate_if_any_weight_gte != null &&
        phaseScore.maxWeight >= phaseRules.escalate_if_any_weight_gte) ||
      (phaseRules?.escalate_if_sum_gte != null &&
        phaseScore.sum >= phaseRules.escalate_if_sum_gte)
    ) {
      shouldEscalate = true;
    }
  }

  // Approvals: keep existing behavior (phase_4 approves by default; phase_3 can approve via approve_if_sum_lte)
  if (!shouldFail && !shouldCooldown) {
    if (
      state.currentPhase === "phase_3" &&
      phaseRules?.approve_if_sum_lte != null &&
      phaseScore.sum <= phaseRules.approve_if_sum_lte
    ) {
      shouldApprove = true;
    }

    if (state.currentPhase === "phase_4") {
      // If not cooled down, phase_4 means approve.
      shouldApprove = true;
    }
  }

  return { shouldEscalate, shouldFail, shouldApprove, shouldCooldown };
}
