import sql from "@/app/api/utils/sql";

// POST - Publish a draft version (makes it active)
export async function POST(request, { params }) {
  try {
    const versionId = params.id;

    // Check if version exists and is draft
    const version = await sql`
      SELECT * FROM quiz_versions WHERE id = ${versionId}
    `;

    if (version.length === 0) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    if (version[0].status !== "draft") {
      return Response.json(
        { error: "Can only publish draft versions" },
        { status: 400 },
      );
    }

    const audienceGender = version[0].audience_gender || "ALL";

    // Deactivate current active version for THIS audience only
    await sql`
      UPDATE quiz_versions
      SET status = 'archived'
      WHERE status = 'active'
        AND audience_gender = ${audienceGender}
    `;

    // Also deactivate old quiz_configs for THIS audience only
    await sql`
      UPDATE quiz_configs
      SET is_active = false
      WHERE is_active = true
        AND audience_gender = ${audienceGender}
    `;

    // Activate this version
    await sql`
      UPDATE quiz_versions
      SET status = 'active', published_at = NOW()
      WHERE id = ${versionId}
    `;

    // Compile to runtime format and insert into quiz_configs
    const compiled = await compileVersion(versionId);

    await sql`
      INSERT INTO quiz_configs (version, is_active, config_json, created_by_admin_id, audience_gender)
      VALUES (
        ${version[0].version_number},
        true,
        ${JSON.stringify(compiled)}::jsonb,
        ${version[0].created_by_admin_id},
        ${audienceGender}
      )
    `;

    return Response.json({ success: true, compiled });
  } catch (error) {
    console.error("Error publishing version:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Helper: Compile normalized data into runtime JSON format
async function compileVersion(versionId) {
  // Get phase configs
  const phaseConfigs = await sql`
    SELECT * FROM version_phase_configs WHERE version_id = ${versionId}
  `;

  // Get all questions for this version
  const phaseQuestions = await sql`
    SELECT vpq.phase_name, vpq.question_id, vpq.display_order,
           qb.question_text, qb.is_mandatory, qb.allow_multiple,
           qb.min_selections_required, qb.min_selections_penalty
    FROM version_phase_questions vpq
    JOIN question_bank qb ON vpq.question_id = qb.id
    WHERE vpq.version_id = ${versionId}
    ORDER BY vpq.phase_name, vpq.display_order
  `;

  // Get all answers for questions in this version
  const questionIds = [...new Set(phaseQuestions.map((q) => q.question_id))];
  const answers = await sql`
    SELECT * FROM question_answers
    WHERE question_id = ANY(${questionIds})
    ORDER BY question_id, display_order
  `;

  // Get lifetime rules
  const lifetimeRules = await sql`
    SELECT * FROM version_lifetime_rules
    WHERE version_id = ${versionId}
    ORDER BY display_order
  `;

  // Build phases structure
  const phases = {};
  const phaseRules = {};

  for (const config of phaseConfigs) {
    const phaseName = config.phase_name;

    // Build questions for this phase
    const questions = phaseQuestions
      .filter((q) => q.phase_name === phaseName)
      .map((q) => {
        const allowMultiple = !!q.allow_multiple;

        return {
          id: `q_${q.question_id}`,
          text: q.question_text,
          mandatory: q.is_mandatory,
          allowMultiple,
          minSelectionsRequired: allowMultiple
            ? q.min_selections_required
            : null,
          minSelectionsPenalty: allowMultiple ? q.min_selections_penalty : null,
          answers: answers
            .filter((a) => a.question_id === q.question_id)
            .map((a) => ({
              id: `a_${a.id}`,
              text: a.answer_text,
              weight: a.weight,
            })),
        };
      });

    phases[phaseName] = { id: phaseName, questions };

    // Build phase rules
    phaseRules[phaseName] = {
      serve_count_min: config.serve_count_min,
      serve_count_max: config.serve_count_max,
      fail_if_sum_gte: config.fail_if_sum_gte,
      escalate_if_sum_gte: config.escalate_if_sum_gte,
      escalate_if_any_weight_gte: config.escalate_if_any_weight_gte,
      approve_if_sum_lte: config.approve_if_sum_lte,
      cooldown_if_sum_gte: config.cooldown_if_sum_gte,
    };
  }

  return {
    phases: Object.values(phases),
    scoring: { phase_rules: phaseRules },
    lifetimeRules: lifetimeRules.map((r) => r.rule_json),
  };
}
