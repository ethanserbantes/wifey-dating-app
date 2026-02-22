export function PhaseTabs({
  activePhase,
  onPhaseChange,
  lifetimeRulesCount,
  onShowLifetimeRules,
}) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex gap-4 px-6">
        {["phase_1", "phase_2", "phase_3", "phase_4"].map((phase) => (
          <button
            key={phase}
            onClick={() => onPhaseChange(phase)}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activePhase === phase
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Phase {phase.split("_")[1]}
          </button>
        ))}
        <button
          onClick={onShowLifetimeRules}
          className="ml-auto px-4 py-3 text-sm text-red-600 hover:text-red-700"
        >
          Lifetime Rules ({lifetimeRulesCount})
        </button>
      </div>
    </div>
  );
}
