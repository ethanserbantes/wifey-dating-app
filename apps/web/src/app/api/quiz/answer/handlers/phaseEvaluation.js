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
  // - Check cooldown thresholds at END of EACH phase (1, 2, 3, 4)
  // - Default: 7+ points triggers cooldown (per-phase scoring)

  if (
    livePhaseRules?.fail_if_sum_gte != null &&
    livePhaseScore.sum >= livePhaseRules.fail_if_sum_gte
  ) {
    setPendingOutcome(state, "COOLDOWN", { triggeredBy: "phase_threshold" });
  }

  if (
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

  // Check cooldown thresholds at END of EACH phase (1, 2, 3, 4)
  // 7+ points per phase triggers cooldown
  if (
    phaseRules?.fail_if_sum_gte != null &&
    phaseScore.sum >= phaseRules.fail_if_sum_gte
  ) {
    shouldCooldown = true;
  }

  if (
    !shouldCooldown &&
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
