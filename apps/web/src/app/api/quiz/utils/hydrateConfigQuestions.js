import sql from "@/app/api/utils/sql";

function toRuntimeQuestionId(questionId) {
  return `q_${questionId}`;
}

function toRuntimeAnswerId(answerId) {
  return `a_${answerId}`;
}

function toNumberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The quiz system historically served questions from quiz_configs.config_json.
 * But the admin "quiz builder" now owns the source of truth for which questions
 * belong to each phase (version_phase_questions) and their answer weights
 * (question_answers).
 *
 * This helper hydrates/overrides config.phases[].questions from the DB for a
 * given quiz version number.
 */
export async function hydrateConfigWithDbQuestions({ configVersion, config }) {
  const versionNum = Number(configVersion);
  if (!Number.isFinite(versionNum) || !config || typeof config !== "object") {
    return config;
  }

  // Pull the per-phase question list for this version from the quiz builder tables
  const phaseQuestionRows = await sql`
    SELECT vpq.phase_name,
           vpq.question_id,
           vpq.display_order,
           qb.question_text,
           qb.allow_multiple,
           qb.min_selections_required,
           qb.min_selections_penalty
    FROM quiz_versions v
    JOIN version_phase_questions vpq ON vpq.version_id = v.id
    JOIN question_bank qb ON qb.id = vpq.question_id
    WHERE v.version_number = ${versionNum}
    ORDER BY vpq.phase_name ASC, vpq.display_order ASC, vpq.question_id ASC
  `;

  // If there are no builder rows for this version, fall back to config_json
  if (!Array.isArray(phaseQuestionRows) || phaseQuestionRows.length === 0) {
    return config;
  }

  const questionIds = Array.from(
    new Set(
      phaseQuestionRows.map((r) => Number(r.question_id)).filter(Boolean),
    ),
  );

  const answerRows =
    questionIds.length > 0
      ? await sql(
          "SELECT id, question_id, answer_text, weight, display_order FROM question_answers WHERE question_id = ANY($1) ORDER BY question_id ASC, display_order ASC, id ASC",
          [questionIds],
        )
      : [];

  const answersByQuestionId = new Map();
  for (const row of answerRows) {
    const qid = Number(row.question_id);
    if (!answersByQuestionId.has(qid)) {
      answersByQuestionId.set(qid, []);
    }
    answersByQuestionId.get(qid).push({
      id: toRuntimeAnswerId(row.id),
      text: row.answer_text,
      weight: Number.isFinite(Number(row.weight)) ? Number(row.weight) : 0,
    });
  }

  const questionsByPhase = new Map();
  for (const row of phaseQuestionRows) {
    const phaseId = String(row.phase_name);
    const qid = Number(row.question_id);

    if (!questionsByPhase.has(phaseId)) {
      questionsByPhase.set(phaseId, []);
    }

    const allowMultiple = !!row.allow_multiple;

    questionsByPhase.get(phaseId).push({
      id: toRuntimeQuestionId(qid),
      text: row.question_text,
      allowMultiple,
      minSelectionsRequired: allowMultiple
        ? toNumberOrNull(row.min_selections_required)
        : null,
      minSelectionsPenalty: allowMultiple
        ? toNumberOrNull(row.min_selections_penalty)
        : null,
      answers: answersByQuestionId.get(qid) || [],
    });
  }

  // Clone the config shallowly and replace question lists for phases we have.
  const nextConfig = { ...config };
  const phases = Array.isArray(config.phases) ? config.phases : [];
  nextConfig.phases = phases.map((p) => {
    const phaseId = String(p?.id || "");
    const replacementQuestions = questionsByPhase.get(phaseId);

    if (!replacementQuestions) {
      return p;
    }

    return {
      ...p,
      questions: replacementQuestions,
    };
  });

  return nextConfig;
}
