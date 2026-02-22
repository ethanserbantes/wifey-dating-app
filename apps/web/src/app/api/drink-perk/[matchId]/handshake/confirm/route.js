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

function randomToken() {
  const a = Math.random().toString(36).slice(2);
  const b = Math.random().toString(36).slice(2);
  return `drink_${Date.now()}_${a}${b}`.slice(0, 64);
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const userIdNum = Number(body?.userId);
    const code = String(body?.code || "").trim();

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    if (!code) {
      return Response.json({ error: "Code required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const sessions = await sql`
      SELECT id, code, initiator_user_id, responder_user_id, responder_confirmed_at, expires_at, completed_at
      FROM drink_handshake_sessions
      WHERE match_id = ${matchIdNum}
        AND completed_at IS NULL
        AND expires_at > now()
        AND code = ${code}
      ORDER BY id DESC
      LIMIT 1
    `;

    if (!sessions || sessions.length === 0) {
      return Response.json(
        { error: "Invalid or expired code" },
        { status: 400 },
      );
    }

    const s = sessions[0];
    const initiator = Number(s.initiator_user_id);

    if (initiator === userIdNum) {
      // Initiator can't be the responder. Just return status.
      return Response.json({ ok: true, waiting: true });
    }

    // mark responder
    const updated = await sql`
      UPDATE drink_handshake_sessions
      SET responder_user_id = ${userIdNum},
          responder_confirmed_at = now()
      WHERE id = ${Number(s.id)}
        AND responder_confirmed_at IS NULL
      RETURNING id
    `;

    // if already confirmed, still proceed
    const now = new Date();
    const creditExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const still = await sql`
      SELECT id, initiator_user_id, responder_confirmed_at, completed_at
      FROM drink_handshake_sessions
      WHERE id = ${Number(s.id)}
      LIMIT 1
    `;

    const current = still[0];
    if (current?.completed_at) {
      return Response.json({ ok: true, completed: true });
    }

    if (!current?.responder_confirmed_at) {
      return Response.json({ ok: true, waiting: true });
    }

    // complete + create credit
    const token = randomToken();

    await sql.transaction((txn) => [
      txn`
        UPDATE drink_handshake_sessions
        SET completed_at = now()
        WHERE id = ${Number(s.id)}
      `,
      txn`
        INSERT INTO drink_credits (match_id, token, expires_at)
        VALUES (${matchIdNum}, ${token}, ${creditExpiresAt})
      `,
      txn`
        INSERT INTO match_drink_perks (match_id, state, redeemed_at, updated_at)
        VALUES (${matchIdNum}, 'REDEEMED', now(), now())
        ON CONFLICT (match_id)
        DO UPDATE SET
          state = 'REDEEMED',
          redeemed_at = now(),
          updated_at = now()
      `,
    ]);

    return Response.json({
      ok: true,
      completed: true,
      credit: {
        token,
        expiresAt: creditExpiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error confirming handshake:", error);
    return Response.json({ error: "Failed to confirm" }, { status: 500 });
  }
}
