"use client";

import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import adminFetch from "@/utils/adminFetch";

function labelForAudience(audienceGender) {
  if (audienceGender === "MALE") return "Male";
  if (audienceGender === "FEMALE") return "Female";
  return "All";
}

export default function QuizConfigPage() {
  const [admin, setAdmin] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [audienceGender, setAudienceGender] = useState("FEMALE");

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        // Prefer the real cookie / token based admin session (works in production)
        const meResp = await adminFetch("/api/admin/me");
        if (!meResp.ok) {
          window.location.href = "/admin";
          return;
        }

        const meData = await meResp.json().catch(() => ({}));
        const nextAdmin = meData?.admin || null;
        if (!nextAdmin) {
          window.location.href = "/admin";
          return;
        }

        if (!cancelled) {
          setAdmin(nextAdmin);
        }

        await loadConfigs();
      } catch (error) {
        console.error("Error booting quiz config page:", error);
        window.location.href = "/admin";
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadConfigs = async () => {
    try {
      const response = await adminFetch("/api/admin/quiz-configs");
      if (response.ok) {
        const data = await response.json();
        setConfigs(data.configs);
      }
    } catch (error) {
      console.error("Error loading configs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (configId) => {
    if (
      !confirm(
        "Activate this quiz configuration? This will deactivate the current one.",
      )
    ) {
      return;
    }

    try {
      const response = await adminFetch(
        `/api/admin/quiz-configs/${configId}/activate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminId: admin.id }),
        },
      );

      if (response.ok) {
        await loadConfigs();
        alert("Configuration activated successfully");
      }
    } catch (error) {
      console.error("Error activating config:", error);
      alert("Failed to activate configuration");
    }
  };

  const handleCreateFromJson = async () => {
    setJsonError("");

    try {
      const parsed = JSON.parse(jsonText);

      const response = await adminFetch("/api/admin/quiz-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configJson: parsed,
          adminId: admin.id,
          audienceGender,
        }),
      });

      if (response.ok) {
        await loadConfigs();
        setShowJsonEditor(false);
        setJsonText("");
        alert("Configuration created successfully");
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create configuration");
      }
    } catch (error) {
      setJsonError(error.message);
    }
  };

  return (
    <AdminLayout currentPage="quiz-config">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Quiz Configurations
          </h1>
          <button
            onClick={() => setShowJsonEditor(!showJsonEditor)}
            className="bg-[#FF1744] text-white px-4 py-2 rounded-lg hover:bg-[#E01535] transition-colors"
          >
            {showJsonEditor ? "Cancel" : "Create New Version"}
          </button>
        </div>

        {showJsonEditor && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Create New Configuration
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Paste your quiz configuration JSON below. This will create a new
              version.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Audience
              </label>
              <select
                value={audienceGender}
                onChange={(e) => setAudienceGender(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="ALL">All (legacy)</option>
              </select>
            </div>

            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full h-64 font-mono text-sm border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
              placeholder='{"version": 1, "phases": [...], "lifetimeRules": [...]}'
            />

            {jsonError && (
              <div className="mt-2 text-sm text-red-600">{jsonError}</div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleCreateFromJson}
                className="bg-[#FF1744] text-white px-4 py-2 rounded-lg hover:bg-[#E01535] transition-colors"
              >
                Create Configuration
              </button>
              <button
                onClick={() => {
                  setShowJsonEditor(false);
                  setJsonText("");
                  setJsonError("");
                }}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <div
                key={config.id}
                className={`bg-white rounded-lg shadow p-6 ${config.is_active ? "ring-2 ring-[#FF1744]" : ""}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Version {config.version}
                      </h3>
                      <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                        {labelForAudience(config.audience_gender)}
                      </span>
                      {config.is_active && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Created:{" "}
                      {new Date(config.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {!config.is_active && (
                    <button
                      onClick={() => handleActivate(config.id)}
                      className="bg-[#FF1744] text-white px-4 py-2 rounded-lg hover:bg-[#E01535] transition-colors text-sm"
                    >
                      Activate
                    </button>
                  )}
                </div>

                <div className="text-sm text-gray-600">
                  <p>Phases: {config.config_json.phases?.length || 0}</p>
                  <p>
                    Lifetime Rules:{" "}
                    {config.config_json.lifetimeRules?.length || 0}
                  </p>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-[#FF1744] hover:text-[#E01535]">
                    View JSON
                  </summary>
                  <pre className="mt-2 bg-gray-50 p-4 rounded-lg overflow-auto text-xs">
                    {JSON.stringify(config.config_json, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
