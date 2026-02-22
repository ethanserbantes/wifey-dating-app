import { useState } from "react";
import { RuleEditorModal } from "./RuleEditorModal";

export function LifetimeRulesModal({
  rules,
  versionId,
  questionBank,
  onClose,
  onUpdate,
}) {
  const [editingRule, setEditingRule] = useState(null);

  const createNewRule = () => {
    setEditingRule({
      rule_name: "",
      rule_json: { if: { any: [] } },
    });
  };

  const saveRule = async (rule) => {
    const url = rule.id
      ? `/api/admin/quiz-builder/versions/${versionId}/lifetime-rules/${rule.id}`
      : `/api/admin/quiz-builder/versions/${versionId}/lifetime-rules`;

    await fetch(url, {
      method: rule.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruleName: rule.rule_name,
        ruleJson: rule.rule_json,
      }),
    });

    onUpdate();
    setEditingRule(null);
  };

  const deleteRule = async (ruleId) => {
    if (!confirm("Delete this rule?")) return;

    await fetch(
      `/api/admin/quiz-builder/versions/${versionId}/lifetime-rules/${ruleId}`,
      {
        method: "DELETE",
      },
    );

    onUpdate();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Lifetime Ban Rules
          </h2>
          <div className="flex gap-2">
            <button
              onClick={createNewRule}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + New Rule
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {rule.rule_name || "Unnamed Rule"}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {JSON.stringify(rule.rule_json)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {rules.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No lifetime ban rules yet. Click "New Rule" to create one.
              </div>
            )}
          </div>
        </div>
      </div>

      {editingRule && (
        <RuleEditorModal
          rule={editingRule}
          questionBank={questionBank}
          onClose={() => setEditingRule(null)}
          onSave={(rule) => saveRule(rule)}
        />
      )}
    </div>
  );
}
