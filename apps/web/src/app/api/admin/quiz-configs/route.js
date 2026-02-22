import sql from "@/app/api/utils/sql";

export async function GET() {
  try {
    const configs = await sql`
      SELECT id, version, is_active, audience_gender, config_json, created_at, updated_at, created_by_admin_id
      FROM quiz_configs 
      ORDER BY version DESC
    `;

    return Response.json({ configs });
  } catch (error) {
    console.error("Error fetching quiz configs:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { configJson, adminId, audienceGender } = body;

    if (!configJson) {
      return Response.json(
        { error: "configJson is required" },
        { status: 400 },
      );
    }

    const audienceNorm =
      audienceGender === "MALE" ||
      audienceGender === "FEMALE" ||
      audienceGender === "ALL"
        ? audienceGender
        : "ALL";

    // Get next version number
    const maxVersionResult = await sql`
      SELECT COALESCE(MAX(version), 0) as max_version 
      FROM quiz_configs
    `;
    const nextVersion = maxVersionResult[0].max_version + 1;

    // Insert new config
    const result = await sql`
      INSERT INTO quiz_configs (version, is_active, audience_gender, config_json, created_by_admin_id)
      VALUES (${nextVersion}, false, ${audienceNorm}, ${JSON.stringify(configJson)}::jsonb, ${adminId || null})
      RETURNING id, version, is_active, audience_gender, config_json, created_at, updated_at
    `;

    // Log audit
    if (adminId) {
      await sql`
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
        VALUES (${adminId}, 'CREATE_QUIZ_CONFIG', 'quiz_config', ${result[0].id}, ${JSON.stringify({ version: nextVersion, audienceGender: audienceNorm })}::jsonb)
      `;
    }

    return Response.json({ config: result[0] });
  } catch (error) {
    console.error("Error creating quiz config:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
