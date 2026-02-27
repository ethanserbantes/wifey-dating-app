import { useState, useEffect } from "react";
import adminFetch from "@/utils/adminFetch";

export function PhaseConfigModal({ phase, versionId, onClose, onSave }) {
  const initialCooldownThreshold =
    phase?.fail_if_sum_gte != null
      ? phase.fail_if_sum_gte
      : phase?.cooldown_if_sum_gte != null
        ? phase.cooldown_if_sum_gte
        : null;

  const [config, setConfig] = useState({
    serve_count_min: phase?.serve_count_min || 3,
    serve_count_max: phase?.serve_count_max || 5,
    // NOTE: Historically this was called `fail_if_sum_gte`, but product-wise this
    // is our per-phase COOLDOWN threshold.
    fail_if_sum_gte: initialCooldownThreshold,
    escalate_if_sum_gte: phase?.escalate_if_sum_gte || null,
    escalate_if_any_weight_gte: phase?.escalate_if_any_weight_gte || null,
    approve_if_sum_lte: phase?.approve_if_sum_lte || null,
    // Deprecated in UI; kept out of the editor to avoid confusion.
    cooldown_if_sum_gte: null,
  });

  // Load saved config from backend when modal opens
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await adminFetch(
          `/api/admin/quiz-builder/versions/${versionId}/phases/${phase.phase_name}/config`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            setConfig((prev) => ({
              ...prev,
              ...data.config,
            }));
          }
        }
      } catch (err) {
        console.warn("Failed to load saved phase config:", err);
      }
    };

    if (phase?.phase_name && versionId) {
      loadConfig();
    }
  }, [phase?.phase_name, versionId]);

  const handleSave = async () => {
    try {
      const res = await adminFetch(`/api/admin/quiz-builder/versions/${versionId}/phases`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseName: phase.phase_name, config }),
      });

      if (!res.ok) {
        throw new Error(
          `Failed to save phase config: [${res.status}] ${res.statusText}`
        );
      }

      onSave();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to save phase settings. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Phase Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Questions
              </label>
              <input
                type="number"
                value={config.serve_count_min}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    serve_count_min: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Questions
              </label>
              <input
                type="number"
                value={config.serve_count_max}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    serve_count_max: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cooldown if sum ≥
            </label>
            <input
              type="number"
              value={config.fail_if_sum_gte || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  fail_if_sum_gte: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Escalate if sum ≥
            </label>
            <input
              type="number"
              value={config.escalate_if_sum_gte || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  escalate_if_sum_gte: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Escalate if any weight ≥
            </label>
            <input
              type="number"
              value={config.escalate_if_any_weight_gte || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  escalate_if_any_weight_gte: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Approve if sum ≤
            </label>
            <input
              type="number"
              value={config.approve_if_sum_lte || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  approve_if_sum_lte: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
