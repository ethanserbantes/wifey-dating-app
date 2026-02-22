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

function randomCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
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
    const autoJoin = Boolean(body?.autoJoin);

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const [perk] = await sql`
      SELECT state
      FROM match_drink_perks
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const state = String(perk?.state || "LOCKED");
    if (state !== "READY") {
      return Response.json({ error: "Not ready", state }, { status: 400 });
    }

    const existing = await sql`
      SELECT id, code, initiator_user_id, responder_user_id, responder_confirmed_at, expires_at, completed_at
      FROM drink_handshake_sessions
      WHERE match_id = ${matchIdNum}
        AND completed_at IS NULL
        AND expires_at > now()
      ORDER BY id DESC
      LIMIT 1
    `;

    const s = existing?.[0] || null;

    // --- AUTO JOIN PATH (no code shown; both phones tap "start") ---
    if (autoJoin) {
      // If the other person already started, join + immediately issue the credit.
      if (s && Number(s.initiator_user_id) !== userIdNum) {
        const now = new Date();
        const creditExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const token = randomToken();

        await sql.transaction((txn) => [
          txn`
            UPDATE drink_handshake_sessions
            SET responder_user_id = ${userIdNum},
                responder_confirmed_at = now(),
                completed_at = now()
            WHERE id = ${Number(s.id)}
              AND completed_at IS NULL
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
          autoJoin: true,
          completed: true,
          credit: { token, expiresAt: creditExpiresAt.toISOString() },
        });
      }

      // Otherwise, start (or re-start if I am the initiator).
      if (s && Number(s.initiator_user_id) === userIdNum) {
        return Response.json({
          ok: true,
          autoJoin: true,
          waiting: true,
          session: {
            id: Number(s.id),
            expiresAt: new Date(s.expires_at).toISOString(),
          },
        });
      }

      const code = randomCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const rows = await sql`
        INSERT INTO drink_handshake_sessions (
          match_id,
          code,
          initiator_user_id,
          expires_at
        ) VALUES (
          ${matchIdNum},
          ${code},
          ${userIdNum},
          ${expiresAt}
        )
        RETURNING id, expires_at
      `;

      const r = rows[0];

      return Response.json({
        ok: true,
        autoJoin: true,
        waiting: true,
        session: {
          id: Number(r.id),
          expiresAt: new Date(r.expires_at).toISOString(),
        },
      });
    }

    // --- EXISTING CODE FLOW (legacy) ---
    if (
      existing.length > 0 &&
      Number(existing[0].initiator_user_id) === userIdNum
    ) {
      return Response.json({
        session: {
          id: Number(existing[0].id),
          code: String(existing[0].code),
          expiresAt: new Date(existing[0].expires_at).toISOString(),
        },
      });
    }

    const code = randomCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const rows = await sql`
      INSERT INTO drink_handshake_sessions (
        match_id,
        code,
        initiator_user_id,
        expires_at
      ) VALUES (
        ${matchIdNum},
        ${code},
        ${userIdNum},
        ${expiresAt}
      )
      RETURNING id, code, expires_at
    `;

    const r = rows[0];

    return Response.json({
      session: {
        id: Number(r.id),
        code: String(r.code),
        expiresAt: new Date(r.expires_at).toISOString(),
      },
    });
  } catch (error) {
    console.error("Error starting handshake:", error);
    return Response.json({ error: "Failed to start" }, { status: 500 });
  }
}
