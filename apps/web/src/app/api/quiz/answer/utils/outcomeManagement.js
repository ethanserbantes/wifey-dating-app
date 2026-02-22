// Store a "pending" outcome so a user can finish the current phase,
// but will be stopped from proceeding to the next phase.
const PENDING_OUTCOME_PRIORITY = {
  FAILED: 1,
  COOLDOWN: 2,
  LIFETIME_INELIGIBLE: 3,
};

export function setPendingOutcome(state, type, meta = {}) {
  if (!state || !type) {
    return;
  }

  const currentType = state?.pendingOutcome?.type;
  const nextPriority = PENDING_OUTCOME_PRIORITY[type] || 0;
  const currentPriority = PENDING_OUTCOME_PRIORITY[currentType] || 0;

  if (nextPriority <= currentPriority) {
    return;
  }

  state.pendingOutcome = {
    type,
    phase: state.currentPhase,
    ...meta,
  };
}
