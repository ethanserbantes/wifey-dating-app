import {
  getQuestionMetadata,
  getAnswerWeight,
} from "../services/questionService.js";

export async function validateAndProcessAnswers(
  question,
  selectedIds,
  questionId,
) {
  const { allowMultiple, minSelectionsRequired, minSelectionsPenalty } =
    await getQuestionMetadata(question);

  if (!allowMultiple && selectedIds.length > 1) {
    throw new Error("This question only allows one answer");
  }

  // Validate answers + compute weights (sum/max)
  const weightsByAnswerId = [];
  let maxSelectedWeight = 0;
  let totalWeight = 0;

  for (const selectedAnswerId of selectedIds) {
    const answer = question.answers.find(
      (a) => String(a.id) === selectedAnswerId,
    );
    if (!answer) {
      throw new Error("Answer not found");
    }

    const weight = await getAnswerWeight(
      questionId,
      selectedAnswerId,
      answer.weight,
    );

    weightsByAnswerId.push({ answerId: selectedAnswerId, weight });
    totalWeight += weight;
    maxSelectedWeight = Math.max(maxSelectedWeight, weight);
  }

  // Multi-select scoring should not "stack" weights by default.
  // Otherwise a user can be unfairly failed just for selecting multiple correct choices.
  // For multi-select questions we treat the question score as the WORST selected weight.
  let questionScoreToAdd = allowMultiple ? maxSelectedWeight : totalWeight;

  return {
    weightsByAnswerId,
    maxSelectedWeight,
    questionScoreToAdd,
    allowMultiple,
    minSelectionsRequired,
    minSelectionsPenalty,
  };
}

export function applySelectionPenalty(
  state,
  selectedIds,
  allowMultiple,
  minSelectionsRequired,
  minSelectionsPenalty,
  questionId,
  questionScoreToAdd,
) {
  if (
    allowMultiple &&
    Number.isFinite(minSelectionsRequired) &&
    minSelectionsRequired > 0 &&
    selectedIds.length < minSelectionsRequired
  ) {
    const penalty =
      Number.isFinite(minSelectionsPenalty) && minSelectionsPenalty >= 0
        ? minSelectionsPenalty
        : 1;

    questionScoreToAdd += penalty;

    // Store debug info (doesn't affect scoring/lifetime rules)
    if (!Array.isArray(state.selectionPenalties)) {
      state.selectionPenalties = [];
    }

    state.selectionPenalties.push({
      phase: state.currentPhase,
      questionId,
      minSelectionsRequired,
      selectedCount: selectedIds.length,
      penalty,
      createdAt: new Date().toISOString(),
    });
  }

  return questionScoreToAdd;
}
