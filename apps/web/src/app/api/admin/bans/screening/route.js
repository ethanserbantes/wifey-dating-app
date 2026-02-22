import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, reason, isPermanent, expiresAt, notes, adminId } = body;

    if (!userId || !reason) {
      return Response.json(
        { error: "userId and reason are required" },
        { status: 400 },
      );
    }

    const [ban] = await sql`
      INSERT INTO screening_bans (
        user_id, reason, is_permanent, expires_at, notes, banned_by_admin_id
      ) VALUES (
        ${userId}, ${reason}, ${isPermanent || false}, 
        ${expiresAt || null}, ${notes || null}, ${adminId || null}
      )
      RETURNING *
    `;

    // Update user status
    await sql`
      UPDATE users 
      SET status = 'LIFETIME_INELIGIBLE', updated_at = NOW()
      WHERE id = ${userId}
    `;

    return Response.json({ ban });
  } catch (error) {
    console.error("Error creating screening ban:", error);
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

    const [ban] = await sql`
      DELETE FROM screening_bans WHERE id = ${banId}
      RETURNING user_id
    `;

    if (!ban) {
      return Response.json({ error: "Ban not found" }, { status: 404 });
    }

    // Check if user has any other active screening bans
    const [activeBans] = await sql`
      SELECT COUNT(*) as count FROM screening_bans
      WHERE user_id = ${ban.user_id}
      AND (is_permanent = true OR expires_at IS NULL OR expires_at > NOW())
    `;

    // If no active bans, reset user status
    if (parseInt(activeBans.count) === 0) {
      await sql`
        UPDATE users 
        SET status = 'PENDING_SCREENING', updated_at = NOW()
        WHERE id = ${ban.user_id}
      `;
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error removing screening ban:", error);
    return Response.json({ error: "Failed to remove ban" }, { status: 500 });
  }
}
