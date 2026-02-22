import { idsMatch } from "./idMatching.js";

// Make lifetime rule parsing more forgiving, since the rule JSON is edited as raw JSON
// in the admin panel and may use different key names.
export function extractRuleValue(obj, keys) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  for (const key of keys) {
    const val = obj[key];
    if (val == null) {
      continue;
    }

    // Allow { question: { id: 123 } } or { answer: { id: 456 } }
    if (typeof val === "object" && val !== null && "id" in val) {
      return val.id;
    }

    return val;
  }

  return null;
}

// Recursively evaluate conditions
export function evaluateCondition(condition, answers) {
  // Handle "any" conditions
  if (condition.any) {
    return condition.any.some((subCondition) => {
      // If it's a nested condition (has "any" or "all"), recurse
      if (subCondition.any || subCondition.all) {
        return evaluateCondition(subCondition, answers);
      }

      const ruleQuestionId = extractRuleValue(subCondition, [
        "question_id",
        "questionId",
        "questionID",
        "qid",
        "qId",
        "question",
        "q",
      ]);
      const ruleAnswerId = extractRuleValue(subCondition, [
        "answer_id",
        "answerId",
        "answerID",
        "aid",
        "aId",
        "answer",
        "a",
      ]);

      if (ruleQuestionId == null || ruleAnswerId == null) {
        return false;
      }

      // IMPORTANT: multi-select questions may create multiple answer entries per question.
      // So for a rule match, we must check if ANY answer for that question matches.
      return answers.some(
        (a) =>
          idsMatch(a.questionId, ruleQuestionId, "q") &&
          idsMatch(a.answerId, ruleAnswerId, "a"),
      );
    });
  }

  // Handle "all" conditions
  if (condition.all) {
    return condition.all.every((subCondition) => {
      // If it's a nested condition (has "any" or "all"), recurse
      if (subCondition.any || subCondition.all) {
        return evaluateCondition(subCondition, answers);
      }

      const ruleQuestionId = extractRuleValue(subCondition, [
        "question_id",
        "questionId",
        "questionID",
        "qid",
        "qId",
        "question",
        "q",
      ]);
      const ruleAnswerId = extractRuleValue(subCondition, [
        "answer_id",
        "answerId",
        "answerID",
        "aid",
        "aId",
        "answer",
        "a",
      ]);

      if (ruleQuestionId == null || ruleAnswerId == null) {
        return false;
      }

      return answers.some(
        (a) =>
          idsMatch(a.questionId, ruleQuestionId, "q") &&
          idsMatch(a.answerId, ruleAnswerId, "a"),
      );
    });
  }

  return false;
}

// Helper to check lifetime rules with nested any/all logic
export function checkLifetimeRules(answers, lifetimeRules) {
  if (!Array.isArray(lifetimeRules) || lifetimeRules.length === 0) {
    return false;
  }

  for (const rule of lifetimeRules) {
    // The quiz builder stores objects like { if: { any: [...] } }
    // but we also support rules that are just the condition object.
    const condition =
      rule && typeof rule === "object" && rule.if ? rule.if : rule;

    if (condition && evaluateCondition(condition, answers)) {
      return true;
    }
  }

  return false;
}
