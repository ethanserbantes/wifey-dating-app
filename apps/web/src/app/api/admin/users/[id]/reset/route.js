import sql from "@/app/api/utils/sql";
import { requireAdmin } from "@/app/api/utils/adminAuth";

export async function POST(request, { params }) {
  try {
    const authResult = await requireAdmin(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    const { id } = params;

    if (!id) {
      return Response.json({ error: "User ID is required" }, { status: 400 });
    }

    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // Ensure the user exists (helps catch cases where a UI is passing the wrong id)
    const existing = await sql`
      SELECT id FROM users WHERE id = ${userId} LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // IMPORTANT: the Neon sql.transaction API expects a callback that RETURNS an array of queries.
    // Using an async callback with awaited queries can silently no-op.
    await sql.transaction((txn) => [
      // Reset user to pending screening
      txn`
        UPDATE users
        SET status = 'PENDING_SCREENING',
            screening_phase = 1,
            screening_state_json = '{}'::jsonb,
            cooldown_until = NULL,
            updated_at = NOW()
        WHERE id = ${userId}
      `,

      // Delete all screening attempts
      txn`
        DELETE FROM screening_attempts WHERE user_id = ${userId}
      `,

      // Reset swipes + matches so the user can see people again and start fresh
      // 1) Remove any matches (chat_messages will cascade via FK)
      txn`
        DELETE FROM matches
        WHERE user1_id = ${userId} OR user2_id = ${userId}
      `,

      // 2) Remove likes (both directions)
      txn`
        DELETE FROM profile_likes
        WHERE from_user_id = ${userId} OR to_user_id = ${userId}
      `,

      // 3) Remove passes (both directions)
      txn`
        DELETE FROM profile_passes
        WHERE from_user_id = ${userId} OR to_user_id = ${userId}
      `,
    ]);

    return Response.json({
      success: true,
      message: "User account reset successfully",
    });
  } catch (error) {
    console.error("Error resetting user:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
