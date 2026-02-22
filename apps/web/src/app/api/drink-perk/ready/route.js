import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdNum = Number(searchParams.get("userId"));

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const rows = await sql`
      SELECT mdp.match_id, mdp.ready_at
      FROM match_drink_perks mdp
      JOIN matches m ON m.id = mdp.match_id
      WHERE mdp.state = 'READY'
        AND mdp.ready_at IS NOT NULL
        AND (m.user1_id = ${userIdNum} OR m.user2_id = ${userIdNum})
      ORDER BY mdp.ready_at DESC
      LIMIT 20
    `;

    const ready = (rows || []).map((r) => ({
      matchId: Number(r.match_id),
      readyAt: r.ready_at ? new Date(r.ready_at).toISOString() : null,
    }));

    return Response.json({ ready });
  } catch (error) {
    console.error("[DRINK_READY_LIST] Error:", error);
    return Response.json(
      { error: "Failed to list ready perks" },
      { status: 500 },
    );
  }
}
