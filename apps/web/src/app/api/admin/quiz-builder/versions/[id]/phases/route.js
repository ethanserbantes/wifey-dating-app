import sql from "@/app/api/utils/sql";

// GET - Get all phase configurations for a version
export async function GET(request, { params }) {
  try {
    const versionId = params.id;

    const phaseConfigs = await sql`
      SELECT * FROM version_phase_configs
      WHERE version_id = ${versionId}
      ORDER BY phase_name
    `;

    const phaseQuestions = await sql`
      SELECT vpq.*, qb.question_text, qb.is_mandatory
      FROM version_phase_questions vpq
      JOIN question_bank qb ON vpq.question_id = qb.id
      WHERE vpq.version_id = ${versionId}
      ORDER BY vpq.phase_name, vpq.display_order
    `;

    const phases = phaseConfigs.map((config) => ({
      ...config,
      questions: phaseQuestions.filter(
        (q) => q.phase_name === config.phase_name,
      ),
    }));

    return Response.json({ phases });
  } catch (error) {
    console.error("Error fetching phases:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update phase configuration
export async function PUT(request, { params }) {
  try {
    const versionId = params.id;
    const body = await request.json();
    const { phaseName, config } = body;

    const cooldownThreshold =
      config?.fail_if_sum_gte != null
        ? config.fail_if_sum_gte
        : config?.cooldown_if_sum_gte != null
          ? config.cooldown_if_sum_gte
          : null;

    await sql`
      UPDATE version_phase_configs
      SET serve_count_min = ${config.serve_count_min},
          serve_count_max = ${config.serve_count_max},
          fail_if_sum_gte = ${cooldownThreshold},
          escalate_if_sum_gte = ${config.escalate_if_sum_gte || null},
          escalate_if_any_weight_gte = ${config.escalate_if_any_weight_gte || null},
          approve_if_sum_lte = ${config.approve_if_sum_lte || null},
          cooldown_if_sum_gte = NULL
      WHERE version_id = ${versionId} AND phase_name = ${phaseName}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating phase:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
