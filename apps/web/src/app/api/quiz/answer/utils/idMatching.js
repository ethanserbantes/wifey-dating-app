// Normalize ids because the runtime quiz uses ids like "q_123" / "a_456",
// but the rule builder stores numeric ids like 123 / 456.
export function idsMatch(runtimeId, ruleId, prefix) {
  if (runtimeId == null || ruleId == null) {
    return false;
  }

  const a = String(runtimeId);
  const b = String(ruleId);

  if (a === b) {
    return true;
  }

  // If ruleId is numeric ("123") and runtimeId is "q_123"
  if (a === `${prefix}_${b}`) {
    return true;
  }

  // If ruleId is stored with prefix and runtimeId is plain (rare, but safe)
  if (b === `${prefix}_${a}`) {
    return true;
  }

  return false;
}

// Helper to extract numeric id from runtime ids like "q_10" / "a_36"
export function numericIdFromRuntimeId(runtimeId, prefix) {
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
