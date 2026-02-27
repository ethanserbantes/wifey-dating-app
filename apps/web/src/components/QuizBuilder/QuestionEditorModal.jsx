import { useState } from "react";
import { Trash2 } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

export function QuestionEditorModal({
  question,
  onClose,
  onSave,
  afterCreateAddToPhase,
  audienceGender,
}) {
  const [questionText, setQuestionText] = useState(
    question?.text || question?.question_text || "",
  );
  const [isMandatory, setIsMandatory] = useState(
    question?.is_mandatory || false,
  );
  const [allowMultiple, setAllowMultiple] = useState(
    question?.allow_multiple || question?.allowmultiple || false,
  );

  // NEW: for multi-select questions, enforce a minimum number of selections
  const [minSelectionsRequired, setMinSelectionsRequired] = useState(
    question?.min_selections_required != null
      ? String(question.min_selections_required)
      : "",
  );
  const [minSelectionsPenalty, setMinSelectionsPenalty] = useState(
    question?.min_selections_penalty != null
      ? String(question.min_selections_penalty)
      : "",
  );

  const [answers, setAnswers] = useState(
    (question?.answers?.map((a) => ({
      text: a.text || a.answer_text || "",
      weight: a.weight ?? 0,
    })) || [{ text: "", weight: 0 }]),
  );

  const handleSave = async () => {
    // Validate
    if (!questionText.trim()) {
      alert("Question text is required");
      return;
    }

    const validAnswers = answers.filter((a) => (a.text || a.answer_text)?.trim());
    if (validAnswers.length < 2) {
      alert("At least 2 answers are required");
      return;
    }

    const url = question
      ? `/api/admin/quiz-builder/questions/${question.id}`
      : "/api/admin/quiz-builder/questions";

    const method = question ? "PUT" : "POST";

    try {
      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: questionText,
          type: allowMultiple ? "multiple_select" : "single_select",
          options: validAnswers.map((a) => ({
            text: a.text || a.answer_text,
            weight: a.weight,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error(
          `When saving question, the response was [${res.status}] ${res.statusText}`,
        );
      }

      const data = await res.json().catch(() => ({}));

      // NEW: if we created a brand new question from inside a phase flow, auto-add it to that phase.
      const createdId = !question ? data?.question?.id : null;
      if (
        createdId &&
        afterCreateAddToPhase?.versionId &&
        afterCreateAddToPhase?.phase
      ) {
        const addRes = await adminFetch(
          `/api/admin/quiz-builder/versions/${afterCreateAddToPhase.versionId}/phases/${afterCreateAddToPhase.phase}/questions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionId: createdId }),
          },
        );

        if (!addRes.ok) {
          throw new Error(
            `Question was created but failed to add to phase: [${addRes.status}] ${addRes.statusText}`,
          );
        }
      }

      onSave?.(data);
    } catch (error) {
      console.error(error);
      alert("Failed to save question. Please try again.");
    }
  };

  const minRequiredLabel =
    allowMultiple && minSelectionsRequired
      ? `Minimum selections required: ${minSelectionsRequired}`
      : "Minimum selections required";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {question ? "Edit Question" : "Create Question"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Question Text
              </label>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">
                  Mandatory Question
                </span>
              </label>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={allowMultiple}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAllowMultiple(next);

                    // If the user turns off multi-select, clear the min rule to avoid confusion.
                    if (!next) {
                      setMinSelectionsRequired("");
                      setMinSelectionsPenalty("");
                    }
                  }}
                  className="w-4 h-4 mt-1"
                />
                <div>
                  <div className="text-sm text-gray-700">
                    Allow multiple selections
                  </div>
                  <div className="text-xs text-gray-500">
                    Users can select more than one answer (good for "check all
                    that apply" questions).
                  </div>
                </div>
              </div>

              {allowMultiple && (
                <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {minRequiredLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={minSelectionsRequired}
                      onChange={(e) => setMinSelectionsRequired(e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      If they pick fewer than this, they’ll get the penalty.
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Penalty weight (if under minimum)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={minSelectionsPenalty}
                      onChange={(e) => setMinSelectionsPenalty(e.target.value)}
                      placeholder="e.g. 1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      Leave blank to default to 1.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Answers
              </label>
              <div className="space-y-2">
                {answers.map((answer, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={answer.text ?? ""}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[idx] = { ...answer, text: e.target.value };
                        setAnswers(newAnswers);
                      }}
                      placeholder="Answer text"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <select
                      value={answer.weight ?? 0}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[idx] = {
                          ...answer,
                          weight: parseInt(e.target.value),
                        };
                        setAnswers(newAnswers);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value={0}>Weight: 0 (Safe)</option>
                      <option value={1}>Weight: 1</option>
                      <option value={2}>Weight: 2</option>
                      <option value={3}>Weight: 3</option>
                      <option value={5}>Weight: 5 (High Risk)</option>
                      <option value={999999}>Lifetime Ban</option>
                    </select>
                    <button
                      onClick={() =>
                        setAnswers(answers.filter((_, i) => i !== idx))
                      }
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() =>
                  setAnswers([...answers, { text: "", weight: 0 }])
                }
                className="mt-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                + Add Answer
              </button>
            </div>
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
            Save Question
          </button>
        </div>
      </div>
    </div>
  );
}
