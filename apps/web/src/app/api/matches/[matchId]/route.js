import sql from "@/app/api/utils/sql";

export async function GET(request, { params }) {
  try {
    const matchIdRaw = params?.matchId;
    const matchId = Number(matchIdRaw);
    if (!Number.isFinite(matchId)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const userId = Number(userIdRaw);

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const rows = await sql`
      SELECT
        m.id AS match_id,
        m.user1_id,
        m.user2_id,
        m.created_at,
        CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END AS other_user_id,

        -- CHANGE: don't require a user_profiles row to exist
        COALESCE(NULLIF(up.display_name, ''), NULLIF(au.name, ''), u2.email) AS display_name,
        up.age,
        COALESCE(up.photos, '[]'::jsonb) AS photos,
        up.phone_number,

        p.last_seen_at,
        (p.last_seen_at IS NOT NULL AND p.last_seen_at > (now() - interval '5 minutes')) AS is_online,

        -- countdown + date status
        s.expires_at,
        s.active_at,
        COALESCE(dp.date_status, 'none') AS date_status
      FROM matches m
      JOIN users u2 ON u2.id = (CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END)
      LEFT JOIN user_profiles up ON up.user_id = u2.id
      LEFT JOIN auth_users au ON au.email = u2.email
      LEFT JOIN user_presence_latest p ON p.user_id = u2.id
      LEFT JOIN match_conversation_states s ON s.match_id = m.id
      LEFT JOIN match_date_plans dp ON dp.match_id = m.id
      WHERE m.id = ${matchId}
        AND (${userId} = m.user1_id OR ${userId} = m.user2_id)
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks b
          WHERE (b.blocker_user_id = ${userId} AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END))
             OR (b.blocker_user_id = (CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END) AND b.blocked_user_id = ${userId})
        )
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json(
        { error: "Match not found (or you don't have access)" },
        { status: 404 },
      );
    }

    const r = rows[0];

    const expiresAtIso = r?.expires_at
      ? new Date(r.expires_at).toISOString()
      : null;

    return Response.json({
      match: {
        id: r.match_id,
        createdAt: r.created_at,
        expiresAt: expiresAtIso,
        dateStatus: typeof r?.date_status === "string" ? r.date_status : "none",
        otherUser: {
          id: r.other_user_id,
          displayName: r.display_name,
          age: r.age,
          photos: r.photos,
          phoneNumber: r.phone_number,
          lastSeenAt: r.last_seen_at,
          isOnline: Boolean(r?.is_online),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching match details:", error);
    return Response.json({ error: "Failed to fetch match" }, { status: 500 });
  }
}
