import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Mobile app uses the custom `users` table.
// We implement a 30-day recoverable deletion by scheduling deletion.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userIdRaw = body?.userId;

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const now = new Date();
    const scheduledFor = addDays(now, 30);

    const rows = await sql`
      UPDATE users
      SET delete_requested_at = ${now},
          delete_scheduled_for = ${scheduledFor},
          deleted_at = NULL
      WHERE id = ${userId}
      RETURNING id, delete_requested_at, delete_scheduled_for
    `;

    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({
      success: true,
      user: {
        id: rows[0].id,
        deleteRequestedAt: rows[0].delete_requested_at,
        deleteScheduledFor: rows[0].delete_scheduled_for,
      },
    });
  } catch (error) {
    console.error("Error scheduling account deletion:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Web auth uses auth_users. This is a hard delete (no recovery window)
// and is kept for backwards compatibility.
export async function DELETE(request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Delete user and all related data (cascades will handle it)
    await sql`
      DELETE FROM auth_users WHERE id = ${userId}
    `;

    return Response.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
