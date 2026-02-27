import { Plus } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

export function QuestionBankModal({
  questionBank,
  phase,
  versionId,
  onClose,
  onAdd,
  onEdit,
  onCreate,
}) {
  const addToPhase = async (questionId) => {
    try {
      const res = await adminFetch(
        `/api/admin/quiz-builder/versions/${versionId}/phases/${phase}/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId }),
        },
      );

      if (!res.ok) {
        throw new Error(
          `Failed to add question to phase: [${res.status}] ${res.statusText}`
        );
      }

      onAdd();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to add question to phase. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Question Bank</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* NEW: create-from-scratch entry point */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Pick an existing question, or create a new one.
          </div>
          <button
            onClick={() => onCreate?.()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Create new question
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-3">
            {questionBank.map((q) => {
              const isMulti = !!q?.allow_multiple;
              const answersCount = q.answers?.length || 0;

              const minReq =
                q?.min_selections_required != null
                  ? Number(q.min_selections_required)
                  : null;
              const minPenalty =
                q?.min_selections_penalty != null
                  ? Number(q.min_selections_penalty)
                  : null;

              const showMinReq =
                isMulti && Number.isFinite(minReq) && minReq > 0;
              const showPenalty =
                showMinReq && Number.isFinite(minPenalty) && minPenalty > 0;

              const minBadgeText = showPenalty
                ? `Min ${minReq} (+${minPenalty})`
                : showMinReq
                  ? `Min ${minReq}`
                  : null;

              return (
                <div
                  key={q.id}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 mb-2">
                        {q.question_text}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm text-gray-500">
                          {answersCount} answers
                        </div>
                        {isMulti && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                            Multi-select
                          </span>
                        )}
                        {minBadgeText && (
                          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                            {minBadgeText}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEdit(q)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => addToPhase(q.id)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Add to Phase
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
