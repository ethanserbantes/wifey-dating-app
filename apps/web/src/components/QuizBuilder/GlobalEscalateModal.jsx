import { useState, useEffect } from "react";
import adminFetch from "@/utils/adminFetch";

export function GlobalEscalateModal({ versionId, onClose, onSave }) {
  const [escalateThreshold, setEscalateThreshold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load global escalate threshold when modal opens
  useEffect(() => {
    const loadThreshold = async () => {
      try {
        setLoading(true);
        const res = await adminFetch(
          `/api/admin/quiz-builder/versions/${versionId}/escalate-threshold`
        );
        if (res.ok) {
          const data = await res.json();
          setEscalateThreshold(data.escalate_if_sum_gte || "");
        }
      } catch (err) {
        console.warn("Failed to load escalate threshold:", err);
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    };

    if (versionId) {
      loadThreshold();
    }
  }, [versionId]);

  const handleSave = async () => {
    try {
      const res = await adminFetch(
        `/api/admin/quiz-builder/versions/${versionId}/escalate-threshold`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            escalate_if_sum_gte:
              escalateThreshold !== "" ? parseInt(escalateThreshold) : null,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(
          `Failed to save escalate threshold: [${res.status}] ${res.statusText}`
        );
      }

      onSave?.();
      onClose();
    } catch (error) {
      console.error(error);
      setError("Failed to save settings. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Global Escalate Threshold
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>Global Setting:</strong> This threshold applies to all
              phases in this quiz. When a user's score sum reaches this value or
              higher, they will be escalated/marked for review.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Escalate if sum ≥
              </label>
              <input
                type="number"
                value={escalateThreshold ?? ""}
                onChange={(e) =>
                  setEscalateThreshold(
                    e.target.value ? parseInt(e.target.value) : ""
                  )
                }
                placeholder="e.g., 100"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-2">
                Leave empty to disable this global threshold.
              </p>
            </div>
          )}
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
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
