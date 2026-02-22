import sql from "@/app/api/utils/sql";

// PUT - Update lifetime rule
export async function PUT(request, { params }) {
  try {
    const ruleId = params.ruleId;
    const body = await request.json();
    const { ruleName, ruleJson } = body;

    await sql`
      UPDATE version_lifetime_rules
      SET rule_name = ${ruleName},
          rule_json = ${JSON.stringify(ruleJson)}::jsonb
      WHERE id = ${ruleId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating lifetime rule:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete lifetime rule
export async function DELETE(request, { params }) {
  try {
    const ruleId = params.ruleId;

    await sql`DELETE FROM version_lifetime_rules WHERE id = ${ruleId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting lifetime rule:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
