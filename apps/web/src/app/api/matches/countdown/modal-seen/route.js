import sql from "@/app/api/utils/sql";

/**
 * POST /api/matches/countdown/modal-seen
 * Mark the "How Wifey Works" modal as seen for a user + match.
 *
 * GET /api/matches/countdown/modal-seen?matchId=X&userId=Y
 * Check if the modal has been seen.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const matchId = Number(body?.matchId);
    const userId = Number(body?.userId);

    if (!Number.isFinite(matchId) || !Number.isFinite(userId)) {
      return Response.json(
        { error: "matchId and userId required" },
        { status: 400 },
      );
    }

    await sql`
      INSERT INTO match_countdown_modal_seen (match_id, user_id)
      VALUES (${matchId}, ${userId})
      ON CONFLICT (match_id, user_id) DO NOTHING
    `;

    return Response.json({ ok: true });
  } catch (e) {
    console.error("POST /api/matches/countdown/modal-seen error", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = Number(searchParams.get("matchId"));
    const userId = Number(searchParams.get("userId"));

    if (!Number.isFinite(matchId) || !Number.isFinite(userId)) {
      return Response.json(
        { error: "matchId and userId required" },
        { status: 400 },
      );
    }

    const rows = await sql`
      SELECT 1 FROM match_countdown_modal_seen
      WHERE match_id = ${matchId} AND user_id = ${userId}
      LIMIT 1
    `;

    return Response.json({ seen: (rows?.length || 0) > 0 });
  } catch (e) {
    console.error("GET /api/matches/countdown/modal-seen error", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
