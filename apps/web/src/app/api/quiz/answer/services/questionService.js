import sql from "@/app/api/utils/sql";
import { numericIdFromRuntimeId } from "../utils/idMatching.js";
import { toNumberOrNull } from "../utils/helpers.js";

export async function getQuestionMetadata(question) {
  const allowMultiple = !!question?.allowMultiple || !!question?.allow_multiple;

  let minSelectionsRequired = allowMultiple
    ? toNumberOrNull(
        question?.minSelectionsRequired ?? question?.min_selections_required,
      )
    : null;

  let minSelectionsPenalty = allowMultiple
    ? toNumberOrNull(
        question?.minSelectionsPenalty ?? question?.min_selections_penalty,
      )
    : null;

  // Prefer the latest values from the question bank if possible (no republish needed)
  if (allowMultiple) {
    const qbId = numericIdFromRuntimeId(question?.id, "q");
    if (qbId != null) {
      const qbRows = await sql`
        SELECT min_selections_required, min_selections_penalty
        FROM question_bank
        WHERE id = ${qbId}
        LIMIT 1
      `;

      if (qbRows.length > 0) {
        const dbMinReq = toNumberOrNull(qbRows[0].min_selections_required);
        const dbMinPenalty = toNumberOrNull(qbRows[0].min_selections_penalty);

        if (dbMinReq != null) {
          minSelectionsRequired = dbMinReq;
        }
        if (dbMinPenalty != null) {
          minSelectionsPenalty = dbMinPenalty;
        }
      }
    }
  }

  return {
    allowMultiple,
    minSelectionsRequired,
    minSelectionsPenalty,
  };
}

export async function getAnswerWeight(questionId, answerId, configWeight) {
  let weight = 0;
  const rawWeight = Number(configWeight);
  weight = Number.isFinite(rawWeight) ? rawWeight : 0;

  try {
    const qbId = numericIdFromRuntimeId(questionId, "q");
    const qaId = numericIdFromRuntimeId(answerId, "a");

    // Stronger mapping than answer_text matching (which can drift with edits/whitespace).
    // In our runtime config, answer ids are like "a_123" where 123 is question_answers.id.
    if (qbId != null && qaId != null) {
      const dbWeights = await sql`
        SELECT qa.weight
        FROM question_answers qa
        WHERE qa.id = ${qaId}
          AND qa.question_id = ${qbId}
        LIMIT 1
      `;

      if (dbWeights.length > 0) {
        const dbWeightNum = Number(dbWeights[0].weight);
        if (Number.isFinite(dbWeightNum)) {
          weight = dbWeightNum;
        }
      }
    }
  } catch (e) {
    console.error(
      "Could not map runtime answer to DB weight; falling back to config weight",
      e,
    );
  }

  return weight;
}
