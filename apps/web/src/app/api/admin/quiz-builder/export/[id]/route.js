import sql from "@/app/api/utils/sql";

// GET - Export version as JSON
export async function GET(request, { params }) {
  try {
    const versionId = params.id;

    // Compile version
    const compiled = await compileVersion(versionId);

    return Response.json(compiled);
  } catch (error) {
    console.error("Error exporting quiz:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function compileVersion(versionId) {
  const phaseConfigs = await sql`
    SELECT * FROM version_phase_configs WHERE version_id = ${versionId}
  `;

  // IMPORTANT: Pull answers via LEFT JOIN + json_agg so we never lose answers/weights
  // due to array parameter / ANY() issues.
  const phaseQuestions = await sql`
    SELECT
      vpq.phase_name,
      vpq.question_id,
      vpq.display_order,
      qb.question_text,
      qb.is_mandatory,
      qb.allow_multiple,
      qb.min_selections_required,
      qb.min_selections_penalty,
      COALESCE(
        json_agg(
          json_build_object(
            'id', ('a_' || qa.id::text),
            'text', qa.answer_text,
            'weight', qa.weight
          )
          ORDER BY qa.display_order
        ) FILTER (WHERE qa.id IS NOT NULL),
        '[]'::json
      ) AS answers
    FROM version_phase_questions vpq
    JOIN question_bank qb ON vpq.question_id = qb.id
    LEFT JOIN question_answers qa ON qa.question_id = qb.id
    WHERE vpq.version_id = ${versionId}
    GROUP BY
      vpq.phase_name,
      vpq.question_id,
      vpq.display_order,
      qb.question_text,
      qb.is_mandatory,
      qb.allow_multiple,
      qb.min_selections_required,
      qb.min_selections_penalty
    ORDER BY vpq.phase_name, vpq.display_order
  `;

  const lifetimeRules = await sql`
    SELECT * FROM version_lifetime_rules
    WHERE version_id = ${versionId}
    ORDER BY display_order
  `;

  const phases = {};
  const phaseRules = {};

  // Some versions may have questions but missing phase config rows (especially after migrations).
  // Export should still include the questions.
  const phaseNameSet = new Set([
    ...phaseConfigs.map((c) => c.phase_name),
    ...phaseQuestions.map((q) => q.phase_name),
  ]);
  const allPhaseNames = Array.from(phaseNameSet).sort();

  for (const phaseName of allPhaseNames) {
    const config = phaseConfigs.find((c) => c.phase_name === phaseName);

    const questions = phaseQuestions
      .filter((q) => q.phase_name === phaseName)
      .map((q) => {
        const allowMultiple = !!q.allow_multiple;

        // Some pg clients return json columns as strings; be defensive.
        let answersValue = q.answers;
        if (typeof answersValue === "string") {
          try {
            answersValue = JSON.parse(answersValue);
          } catch {
            answersValue = [];
          }
        }

        const safeAnswers = Array.isArray(answersValue) ? answersValue : [];

        return {
          id: `q_${q.question_id}`,
          text: q.question_text,
          mandatory: q.is_mandatory,
          allowMultiple,
          minSelectionsRequired: allowMultiple
            ? q.min_selections_required
            : null,
          minSelectionsPenalty: allowMultiple ? q.min_selections_penalty : null,
          answers: safeAnswers,
        };
      });

    phases[phaseName] = { id: phaseName, questions };

    phaseRules[phaseName] = {
      serve_count_min: config?.serve_count_min ?? 3,
      serve_count_max: config?.serve_count_max ?? 5,
      fail_if_sum_gte: config?.fail_if_sum_gte ?? null,
      escalate_if_sum_gte: config?.escalate_if_sum_gte ?? null,
      escalate_if_any_weight_gte: config?.escalate_if_any_weight_gte ?? null,
      approve_if_sum_lte: config?.approve_if_sum_lte ?? null,
      cooldown_if_sum_gte: config?.cooldown_if_sum_gte ?? null,
    };
  }

  return {
    phases: Object.values(phases),
    scoring: { phase_rules: phaseRules },
    lifetimeRules: lifetimeRules.map((r) => r.rule_json),
  };
}
