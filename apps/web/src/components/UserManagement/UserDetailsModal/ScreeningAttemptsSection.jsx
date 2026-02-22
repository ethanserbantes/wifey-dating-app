import { useMemo, useState } from "react";

export function ScreeningAttemptsSection({
  attempts,
  attemptsDetailed,
  latestAttemptDebug,
}) {
  const [showDebug, setShowDebug] = useState(false);
  const [expandedAttemptId, setExpandedAttemptId] = useState(null);
  const [onlyNonZero, setOnlyNonZero] = useState(true);

  const attemptsSafe = Array.isArray(attempts) ? attempts : [];
  const attemptsDetailedSafe = Array.isArray(attemptsDetailed)
    ? attemptsDetailed
    : [];

  const detailedById = useMemo(() => {
    const map = {};
    for (const a of attemptsDetailedSafe) {
      if (a?.id != null) {
        map[a.id] = a;
      }
    }
    return map;
  }, [attemptsDetailedSafe]);

  const phase1ScoreLabel = useMemo(() => {
    const sum = latestAttemptDebug?.phase1Score?.sum;
    const maxWeight = latestAttemptDebug?.phase1Score?.maxWeight;
    const sumNum = Number(sum);
    const maxNum = Number(maxWeight);

    const hasSum = Number.isFinite(sumNum);
    const hasMax = Number.isFinite(maxNum);

    if (!hasSum && !hasMax) {
      return null;
    }

    const parts = [];
    if (hasSum) parts.push(`sum=${sumNum}`);
    if (hasMax) parts.push(`max=${maxNum}`);
    return parts.join(" • ");
  }, [latestAttemptDebug]);

  const phase1ThresholdLabel = useMemo(() => {
    // In product terms, `fail_if_sum_gte` is our per-phase COOLDOWN threshold.
    // `cooldown_if_sum_gte` is deprecated but may exist on older configs.
    const cooldown = latestAttemptDebug?.phase1Rules?.fail_if_sum_gte;
    const legacyCooldown = latestAttemptDebug?.phase1Rules?.cooldown_if_sum_gte;

    const cooldownNum = Number(cooldown);
    const legacyNum = Number(legacyCooldown);

    const parts = [];
    if (Number.isFinite(cooldownNum)) parts.push(`cooldown ≥ ${cooldownNum}`);

    // Only show legacy if it's set and different (helps debug mixed configs)
    if (
      Number.isFinite(legacyNum) &&
      (!Number.isFinite(cooldownNum) || legacyNum !== cooldownNum)
    ) {
      parts.push(`legacy cooldown ≥ ${legacyNum}`);
    }

    return parts.length ? parts.join(" • ") : null;
  }, [latestAttemptDebug]);

  const hasDebug = !!latestAttemptDebug;
  const nonZero = Array.isArray(latestAttemptDebug?.phase1NonZero)
    ? latestAttemptDebug.phase1NonZero
    : [];

  const renderAttemptAnswers = (attemptId) => {
    const detailedAttempt = detailedById[attemptId] || null;
    const answers = Array.isArray(detailedAttempt?.answersDetailed)
      ? detailedAttempt.answersDetailed
      : [];

    const filtered = onlyNonZero
      ? answers.filter((a) => Number(a?.weight) > 0)
      : answers;

    const byPhase = {};
    for (const a of filtered) {
      const phaseKey = a?.phase || "unknown";
      if (!byPhase[phaseKey]) byPhase[phaseKey] = [];
      byPhase[phaseKey].push(a);
    }

    const phaseKeys = Object.keys(byPhase);
    if (answers.length === 0) {
      return (
        <div className="mt-3 text-sm text-gray-600">
          No answers stored on this attempt.
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="mt-3 text-sm text-gray-600">No non-zero answers.</div>
      );
    }

    return (
      <div className="mt-3 space-y-3">
        {phaseKeys.map((phase) => {
          const rows = byPhase[phase] || [];
          const phaseLabel = phase.replaceAll?.("_", " ") || phase;

          return (
            <div
              key={phase}
              className="bg-white border border-gray-200 rounded-lg"
            >
              <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-700 uppercase">
                {phaseLabel} • {rows.length} picks
              </div>
              <div className="p-3 space-y-2">
                {rows.map((row, idx) => {
                  const qText =
                    row?.questionText ||
                    row?.questionId ||
                    "(unknown question)";
                  const aText =
                    row?.answerText || row?.answerId || "(unknown answer)";
                  const weight = Number(row?.weight);
                  const dbWeight = row?.dbWeight;
                  const hasWeight = Number.isFinite(weight);
                  const hasDbWeight = typeof dbWeight === "number";
                  const weightLabelParts = [];
                  if (hasWeight) weightLabelParts.push(`scored=${weight}`);
                  if (hasDbWeight) weightLabelParts.push(`db=${dbWeight}`);
                  const weightLabel = weightLabelParts.join(" • ");

                  return (
                    <div
                      key={`${row?.answerId || "a"}-${idx}`}
                      className="rounded-md border border-gray-100 bg-gray-50 p-2"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {qText}
                      </div>
                      <div className="text-sm text-gray-700 mt-1">
                        Picked: <span className="font-medium">{aText}</span>
                      </div>
                      {weightLabel ? (
                        <div className="text-xs text-gray-500 mt-1">
                          {weightLabel}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const attemptCountLabel = attemptsSafe.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">
          Screening Attempts ({attemptCountLabel})
        </h3>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-600 flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={onlyNonZero}
              onChange={(e) => setOnlyNonZero(e.target.checked)}
            />
            only non-zero
          </label>

          {hasDebug ? (
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="text-sm text-[#FF1744] font-medium hover:underline"
            >
              {showDebug
                ? "Hide last attempt details"
                : "Show last attempt details"}
            </button>
          ) : null}
        </div>
      </div>

      {hasDebug && showDebug ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm mb-3">
          <div className="font-medium text-yellow-900">
            Last attempt (ID {latestAttemptDebug.attemptId})
          </div>
          <div className="text-yellow-900 mt-1">
            Outcome:{" "}
            <span className="font-medium">{latestAttemptDebug.outcome}</span>
          </div>
          {phase1ScoreLabel ? (
            <div className="text-yellow-900 mt-1">
              Phase 1 score: {phase1ScoreLabel}
            </div>
          ) : null}
          {phase1ThresholdLabel ? (
            <div className="text-yellow-900 mt-1">
              Phase 1 thresholds: {phase1ThresholdLabel}
            </div>
          ) : null}

          <div className="text-yellow-900 mt-2 font-medium">
            Non-zero answers in Phase 1
          </div>
          {nonZero.length > 0 ? (
            <div className="mt-2 space-y-2">
              {nonZero.map((row, idx) => {
                const qText = row.questionText || row.questionId;
                const aText = row.answerText || row.answerId;
                return (
                  <div
                    key={`${row.answerId}-${idx}`}
                    className="bg-white rounded p-2 border border-yellow-100"
                  >
                    <div className="text-gray-900 font-medium">{qText}</div>
                    <div className="text-gray-700 mt-1">
                      Picked: <span className="font-medium">{aText}</span>
                    </div>
                    <div className="text-gray-600 text-xs mt-1">
                      scored weight={row.weight}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-gray-700 mt-1">
              None. If you still failed, it usually means your Phase 1
              thresholds are set too strict (or zero).
            </div>
          )}
        </div>
      ) : null}

      {attemptsSafe.length > 0 ? (
        <div className="space-y-2">
          {attemptsSafe.map((attempt) => {
            const attemptId = attempt?.id;
            const isExpanded = expandedAttemptId === attemptId;
            const startedLabel = attempt?.started_at
              ? new Date(attempt.started_at).toLocaleString()
              : "";
            const outcomeLabel = attempt?.outcome || "(unknown)";
            const hasDetails = !!detailedById[attemptId];

            const toggleLabel = isExpanded ? "Hide answers" : "View answers";

            const onToggle = () => {
              if (!attemptId) return;
              setExpandedAttemptId((prev) =>
                prev === attemptId ? null : attemptId,
              );
            };

            return (
              <div
                key={attemptId}
                className="bg-gray-50 p-3 rounded-lg text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">
                      {outcomeLabel}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {startedLabel}
                      {attempt?.quiz_config_version != null ? (
                        <span className="ml-2">
                          • v{attempt.quiz_config_version}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {hasDetails ? (
                    <button
                      type="button"
                      onClick={onToggle}
                      className="shrink-0 text-xs px-2.5 py-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-100"
                    >
                      {toggleLabel}
                    </button>
                  ) : (
                    <div className="shrink-0 text-xs text-gray-500">
                      No details
                    </div>
                  )}
                </div>

                {isExpanded ? renderAttemptAnswers(attemptId) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">No attempts yet</p>
      )}
    </div>
  );
}
