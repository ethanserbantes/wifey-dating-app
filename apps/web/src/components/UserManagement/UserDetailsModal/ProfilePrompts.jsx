export function ProfilePrompts({ prompts }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-900 mb-2">
        Prompts ({prompts.length})
      </div>
      {prompts.length === 0 ? (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          No prompts saved.
        </div>
      ) : (
        <div className="space-y-3">
          {prompts.map((p, idx) => {
            const q = String(p?.question || "").trim();
            const a = String(p?.answer || "").trim();

            return (
              <div
                key={`prompt-${idx}`}
                className="bg-gray-50 border border-gray-200 rounded-lg p-3"
              >
                <div className="text-xs font-medium text-gray-500">
                  {q || "(no question)"}
                </div>
                <div className="text-sm text-gray-900 mt-1">
                  {a || "(no answer)"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
