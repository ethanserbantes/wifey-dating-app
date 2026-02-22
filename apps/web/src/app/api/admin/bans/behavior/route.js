import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      userId,
      reason,
      violationType,
      isPermanent,
      expiresAt,
      notes,
      adminId,
    } = body;

    if (!userId || !reason || !violationType) {
      return Response.json(
        { error: "userId, reason, and violationType are required" },
        { status: 400 },
      );
    }

    const [ban] = await sql`
      INSERT INTO behavior_bans (
        user_id, reason, violation_type, is_permanent, expires_at, notes, banned_by_admin_id
      ) VALUES (
        ${userId}, ${reason}, ${violationType}, ${isPermanent || false},
        ${expiresAt || null}, ${notes || null}, ${adminId || null}
      )
      RETURNING *
    `;

    return Response.json({ ban });
  } catch (error) {
    console.error("Error creating behavior ban:", error);
    return Response.json({ error: "Failed to create ban" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const banId = searchParams.get("id");

    if (!banId) {
      return Response.json({ error: "Ban ID required" }, { status: 400 });
    }

    await sql`DELETE FROM behavior_bans WHERE id = ${banId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error removing behavior ban:", error);
    return Response.json({ error: "Failed to remove ban" }, { status: 500 });
  }
}
