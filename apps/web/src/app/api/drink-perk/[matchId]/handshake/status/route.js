import sql from "@/app/api/utils/sql";

async function assertMatchAccess(matchIdNum, userIdNum) {
  const accessRows = await sql`
    SELECT m.id, m.user1_id, m.user2_id
    FROM matches m
    WHERE m.id = ${matchIdNum}
      AND (${userIdNum} = m.user1_id OR ${userIdNum} = m.user2_id)
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE (b.blocker_user_id = ${userIdNum} AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END))
           OR (b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END) AND b.blocked_user_id = ${userIdNum})
      )
    LIMIT 1
  `;

  if (accessRows.length === 0) {
    return null;
  }

  return accessRows[0];
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userIdNum = Number(searchParams.get("userId"));
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const sessions = await sql`
      SELECT id, initiator_user_id, initiator_confirmed_at, responder_user_id, responder_confirmed_at, expires_at, completed_at
      FROM drink_handshake_sessions
      WHERE match_id = ${matchIdNum}
        AND completed_at IS NULL
        AND expires_at > now()
      ORDER BY id DESC
      LIMIT 1
    `;

    const s = sessions?.[0] || null;

    const credits = await sql`
      SELECT token, unlocked_at, expires_at
      FROM drink_credits
      WHERE match_id = ${matchIdNum}
      ORDER BY id DESC
      LIMIT 1
    `;

    const c = credits?.[0] || null;

    return Response.json({
      session: s
        ? {
            id: Number(s.id),
            initiatorUserId: Number(s.initiator_user_id),
            initiatorConfirmedAt: toIsoOrNull(s.initiator_confirmed_at),
            responderUserId:
              s.responder_user_id != null ? Number(s.responder_user_id) : null,
            responderConfirmedAt: toIsoOrNull(s.responder_confirmed_at),
            expiresAt: toIsoOrNull(s.expires_at),
          }
        : null,
      credit: c
        ? {
            token: String(c.token || ""),
            unlockedAt: toIsoOrNull(c.unlocked_at),
            expiresAt: toIsoOrNull(c.expires_at),
          }
        : null,
    });
  } catch (error) {
    console.error("Error getting handshake status:", error);
    return Response.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
