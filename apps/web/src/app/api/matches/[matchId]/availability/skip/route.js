import sql from "@/app/api/utils/sql";

const DISMISS_COOLDOWN_HOURS = 72;

async function assertMatchAccess(matchIdNum, userIdNum) {
  const accessRows = await sql`
    SELECT
      m.id,
      CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END AS other_user_id
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

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const userIdNum = Number(body?.userId);
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const dismissedUntil = new Date(
      Date.now() + DISMISS_COOLDOWN_HOURS * 60 * 60 * 1000,
    );

    await sql`
      INSERT INTO match_availability (
        match_id,
        user_id,
        days,
        times,
        tag,
        dismissed_until,
        not_sure_until,
        created_at,
        updated_at
      )
      VALUES (
        ${matchIdNum},
        ${userIdNum},
        '[]'::jsonb,
        '[]'::jsonb,
        NULL,
        ${dismissedUntil},
        NULL,
        now(),
        now()
      )
      ON CONFLICT (match_id, user_id)
      DO UPDATE SET
        dismissed_until = EXCLUDED.dismissed_until,
        updated_at = now()
    `;

    return Response.json({
      ok: true,
      dismissedUntil: dismissedUntil.toISOString(),
    });
  } catch (error) {
    console.error("Error skipping availability prompt:", error);
    return Response.json({ error: "Failed to skip" }, { status: 500 });
  }
}
