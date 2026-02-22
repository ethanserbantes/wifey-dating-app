import { Plus, Trash2 } from "lucide-react";

export function PromptsSection({ prompts, onAdd, onUpdate, onRemove }) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Prompts</h2>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Plus size={18} />
          Add prompt
        </button>
      </div>

      {prompts.length === 0 ? (
        <div className="text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg p-4">
          Add 1–3 prompts (question + answer).
        </div>
      ) : (
        <div className="space-y-4">
          {prompts.map((p, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-gray-900">
                  Prompt {idx + 1}
                </div>
                <button
                  onClick={() => onRemove(idx)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Trash2 size={16} />
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Question
                  </label>
                  <input
                    value={p?.question || ""}
                    onChange={(e) =>
                      onUpdate(idx, { question: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g. The way to win me over is..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Answer
                  </label>
                  <input
                    value={p?.answer || ""}
                    onChange={(e) => onUpdate(idx, { answer: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Write an answer"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
