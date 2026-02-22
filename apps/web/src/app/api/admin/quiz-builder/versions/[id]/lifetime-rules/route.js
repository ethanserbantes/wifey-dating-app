import sql from "@/app/api/utils/sql";

// GET - Get lifetime rules for version
export async function GET(request, { params }) {
  try {
    const versionId = params.id;

    const rules = await sql`
      SELECT * FROM version_lifetime_rules
      WHERE version_id = ${versionId}
      ORDER BY display_order
    `;

    return Response.json({ rules });
  } catch (error) {
    console.error("Error fetching lifetime rules:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create lifetime rule
export async function POST(request, { params }) {
  try {
    const versionId = params.id;
    const body = await request.json();
    const { ruleName, ruleJson } = body;

    const maxOrder = await sql`
      SELECT COALESCE(MAX(display_order), -1) as max_order
      FROM version_lifetime_rules
      WHERE version_id = ${versionId}
    `;

    const result = await sql`
      INSERT INTO version_lifetime_rules (version_id, rule_name, rule_json, display_order)
      VALUES (${versionId}, ${ruleName}, ${JSON.stringify(ruleJson)}::jsonb, ${maxOrder[0].max_order + 1})
      RETURNING *
    `;

    return Response.json({ rule: result[0] });
  } catch (error) {
    console.error("Error creating lifetime rule:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
