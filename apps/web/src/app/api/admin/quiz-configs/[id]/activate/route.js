import sql from "@/app/api/utils/sql";

export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { adminId } = body;

    const rows = await sql`
      SELECT id, version, audience_gender
      FROM quiz_configs
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ error: "Config not found" }, { status: 404 });
    }

    const target = rows[0];

    // Deactivate configs for THIS audience only
    await sql`
      UPDATE quiz_configs
      SET is_active = false
      WHERE is_active = true
        AND audience_gender = ${target.audience_gender}
    `;

    // Activate the selected config
    const result = await sql`
      UPDATE quiz_configs 
      SET is_active = true, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, version, is_active, audience_gender
    `;

    // Log audit
    if (adminId) {
      await sql`
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
        VALUES (${adminId}, 'ACTIVATE_QUIZ_CONFIG', 'quiz_config', ${id}, ${JSON.stringify({ version: result[0].version, audienceGender: result[0].audience_gender })}::jsonb)
      `;
    }

    return Response.json({ config: result[0] });
  } catch (error) {
    console.error("Error activating quiz config:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
