import sql from "@/app/api/utils/sql";

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

    const matchRows = await sql`
      SELECT id, user1_id, user2_id
      FROM matches
      WHERE id = ${matchIdNum}
      LIMIT 1
    `;

    const match = matchRows?.[0] || null;
    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const activeSessions = await sql`
      SELECT id, initiator_user_id, responder_user_id, completed_at, expires_at
      FROM drink_handshake_sessions
      WHERE match_id = ${matchIdNum}
        AND completed_at IS NULL
        AND expires_at > now()
      ORDER BY id DESC
      LIMIT 1
    `;

    const session = activeSessions?.[0] || null;
    if (!session) {
      return Response.json(
        {
          error:
            "No active handshake session found. Have one phone tap 'Tap to start' first, then run this admin action.",
        },
        { status: 400 },
      );
    }

    const initiatorId = Number(session.initiator_user_id);
    const user1Id = Number(match.user1_id);
    const user2Id = Number(match.user2_id);

    const responderId =
      initiatorId === user1Id
        ? user2Id
        : initiatorId === user2Id
          ? user1Id
          : user2Id;

    const now = new Date();
    const creditExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const token = randomToken();

    const [updatedSessionRows] = await sql.transaction((txn) => [
      txn`
        UPDATE drink_handshake_sessions
        SET responder_user_id = COALESCE(responder_user_id, ${responderId}),
            responder_confirmed_at = COALESCE(responder_confirmed_at, now()),
            completed_at = now()
        WHERE id = ${Number(session.id)}
          AND completed_at IS NULL
        RETURNING id
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

    if (!updatedSessionRows || updatedSessionRows.length === 0) {
      return Response.json(
        {
          error:
            "Could not complete handshake session (it may have already completed or expired).",
        },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      matchId: matchIdNum,
      completed: true,
      credit: {
        token,
        expiresAt: creditExpiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[ADMIN][DRINK][SIMULATE_COMPLETE] Error:", error);
    return Response.json(
      { error: "Failed to simulate handshake completion" },
      { status: 500 },
    );
  }
}
