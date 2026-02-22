import sql from "@/app/api/utils/sql";

// GET - List all versions
export async function GET() {
  try {
    const versions = await sql`
      SELECT v.*, a.email as created_by_email
      FROM quiz_versions v
      LEFT JOIN admin_users a ON v.created_by_admin_id = a.id
      ORDER BY v.version_number DESC
    `;

    return Response.json({ versions: versions || [] });
  } catch (error) {
    console.error("Error fetching versions:", error);
    return Response.json(
      { versions: [], error: error.message },
      { status: 500 },
    );
  }
}

// POST - Create new draft version
export async function POST(request) {
  try {
    const body = await request.json();
    const { notes, audienceGender } = body;

    const audienceNorm =
      audienceGender === "MALE" ||
      audienceGender === "FEMALE" ||
      audienceGender === "ALL"
        ? audienceGender
        : "ALL";

    // Get next version number
    const maxVersion = await sql`
      SELECT COALESCE(MAX(version_number), 0) as max_version
      FROM quiz_versions
    `;
    const nextVersion = maxVersion[0].max_version + 1;

    const result = await sql`
      INSERT INTO quiz_versions (version_number, status, created_by_admin_id, notes, audience_gender)
      VALUES (${nextVersion}, 'draft', NULL, ${notes || ""}, ${audienceNorm})
      RETURNING *
    `;

    // Initialize default phase configs
    const phases = ["phase_1", "phase_2", "phase_3", "phase_4"];
    for (const phase of phases) {
      await sql`
        INSERT INTO version_phase_configs (
          version_id, phase_name, serve_count_min, serve_count_max,
          fail_if_sum_gte, escalate_if_sum_gte, escalate_if_any_weight_gte,
          approve_if_sum_lte, cooldown_if_sum_gte
        ) VALUES (
          ${result[0].id}, ${phase}, 3, 5,
          ${phase === "phase_1" ? 10 : null},
          ${phase === "phase_2" || phase === "phase_3" ? 8 : null},
          ${phase === "phase_2" || phase === "phase_3" ? 5 : null},
          ${phase === "phase_3" ? 3 : null},
          ${null}
        )
      `;
    }

    return Response.json({ version: result[0] });
  } catch (error) {
    console.error("Error creating version:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
