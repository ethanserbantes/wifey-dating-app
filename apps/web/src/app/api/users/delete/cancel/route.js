import sql from "@/app/api/utils/sql";

// Cancel a pending deletion during the 30-day recovery window.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userIdRaw = body?.userId;

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const rows = await sql`
      UPDATE users
      SET delete_requested_at = NULL,
          delete_scheduled_for = NULL,
          deleted_at = NULL
      WHERE id = ${userId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error cancelling account deletion:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
