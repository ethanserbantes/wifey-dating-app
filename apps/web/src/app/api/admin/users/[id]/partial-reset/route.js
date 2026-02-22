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

    const existing = await sql`
      SELECT id FROM users WHERE id = ${userId} LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // “Partial reset” = clear social graph + feed history so you can retest likes/matches,
    // without touching screening status, profile, photos, etc.
    await sql.transaction((txn) => [
      // Remove any matches (chat_messages + date tables cascade via FK)
      txn`
        DELETE FROM matches
        WHERE user1_id = ${userId} OR user2_id = ${userId}
      `,

      // Remove likes + passes (both directions) so you can like again (unique constraints)
      txn`
        DELETE FROM profile_likes
        WHERE from_user_id = ${userId} OR to_user_id = ${userId}
      `,
      txn`
        DELETE FROM profile_passes
        WHERE from_user_id = ${userId} OR to_user_id = ${userId}
      `,

      // Clear feed history so cards can show again
      txn`
        DELETE FROM feed_impressions
        WHERE viewer_id = ${userId} OR viewed_user_id = ${userId}
      `,

      // Clear cached standout sets for this viewer
      txn`
        DELETE FROM discover_standout_sets
        WHERE viewer_user_id = ${userId}
      `,

      // Clear active conversation pointer (match_id FK sets null anyway, but keep it tidy)
      txn`
        DELETE FROM user_active_conversations
        WHERE user_id = ${userId}
      `,
    ]);

    return Response.json({
      success: true,
      message: "User social graph reset successfully",
    });
  } catch (error) {
    console.error("Error partially resetting user:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
