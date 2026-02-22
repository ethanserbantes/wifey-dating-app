import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, delete_requested_at, delete_scheduled_for, deleted_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const u = rows[0];

    // Lazily finalize deletion if the scheduled time has passed.
    const now = new Date();
    const scheduledFor = u.delete_scheduled_for
      ? new Date(u.delete_scheduled_for)
      : null;

    const deletionExpired =
      !!u.delete_requested_at &&
      scheduledFor instanceof Date &&
      Number.isFinite(scheduledFor.getTime()) &&
      scheduledFor.getTime() <= now.getTime();

    if (!u.deleted_at && deletionExpired) {
      try {
        await sql`DELETE FROM users WHERE id = ${u.id}`;
      } catch (e) {
        console.error("Error finalizing expired deletion:", e);
      }
      return Response.json({
        status: "deleted",
        deleteRequestedAt: u.delete_requested_at,
        deleteScheduledFor: u.delete_scheduled_for,
      });
    }

    if (u.deleted_at) {
      return Response.json({
        status: "deleted",
        deleteRequestedAt: u.delete_requested_at,
        deleteScheduledFor: u.delete_scheduled_for,
        deletedAt: u.deleted_at,
      });
    }

    if (u.delete_requested_at && u.delete_scheduled_for) {
      return Response.json({
        status: "pending",
        deleteRequestedAt: u.delete_requested_at,
        deleteScheduledFor: u.delete_scheduled_for,
      });
    }

    return Response.json({ status: "active" });
  } catch (error) {
    console.error("Error getting deletion status:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
