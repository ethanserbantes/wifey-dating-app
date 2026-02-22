import { Plus, Edit, Trash2 } from "lucide-react";

export function PhaseEditor({
  phase,
  questionBank,
  versionId,
  onUpdate,
  onEditQuestion,
  onShowQuestionBank,
  onEditPhaseConfig,
}) {
  if (!phase) return <div className="p-6 text-gray-500">Loading phase...</div>;

  const removeQuestionFromPhase = async (questionId) => {
    await fetch(
      `/api/admin/quiz-builder/versions/${versionId}/phases/${phase.phase_name}/questions?questionId=${questionId}`,
      {
        method: "DELETE",
      },
    );
    onUpdate();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {phase.questions?.length || 0} Questions
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onEditPhaseConfig}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Phase Settings
          </button>
          <button
            onClick={onShowQuestionBank}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Add Question
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {phase.questions?.map((q) => {
          const fullQuestion = questionBank.find(
            (qb) => qb.id === q.question_id,
          );
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
                  <div className="text-sm text-gray-500">
                    {fullQuestion?.answers?.length || 0} answers
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEditQuestion(fullQuestion)}
                    className="p-2 text-gray-600 hover:text-blue-600"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => removeQuestionFromPhase(q.question_id)}
                    className="p-2 text-gray-600 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
