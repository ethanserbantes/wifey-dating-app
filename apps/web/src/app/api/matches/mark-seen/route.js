import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();
    const userId = Number(body?.userId);

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId must be a number" },
        { status: 400 },
      );
    }

    // Mark all matches as seen for this user (idempotent).
    await sql`
      UPDATE matches
      SET user1_seen_at = CASE
        WHEN user1_id = ${userId} AND user1_seen_at IS NULL THEN NOW()
        ELSE user1_seen_at
      END,
      user2_seen_at = CASE
        WHEN user2_id = ${userId} AND user2_seen_at IS NULL THEN NOW()
        ELSE user2_seen_at
      END
      WHERE user1_id = ${userId} OR user2_id = ${userId}
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error marking matches seen:", error);
    return Response.json({ error: "Failed to mark seen" }, { status: 500 });
  }
}
