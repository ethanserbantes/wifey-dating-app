import sql from "@/app/api/utils/sql";

/**
 * POST /api/drink-perk/[matchId]/verify/token
 *
 * Issue a one-time QR verification token.
 * Only works within the date window (-2h to +6h of date_start).
 * Token expires in 120 seconds.
 */

function randomToken() {
  const a = Math.random().toString(36).slice(2);
  const b = Math.random().toString(36).slice(2);
  const c = Math.random().toString(36).slice(2);
  return `dv_${Date.now()}_${a}${b}${c}`.slice(0, 80);
}

async function assertMatchAccess(matchIdNum, userIdNum) {
  const rows = await sql`
    SELECT m.id, m.user1_id, m.user2_id,
      CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END AS other_user_id
    FROM matches m
    WHERE m.id = ${matchIdNum}
      AND (${userIdNum} = m.user1_id OR ${userIdNum} = m.user2_id)
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_user_id = ${userIdNum} AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END))
           OR (b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END) AND b.blocked_user_id = ${userIdNum})
      )
    LIMIT 1
  `;
  return rows?.[0] || null;
}

function isWithinDateWindow(now, dateStart) {
  if (!dateStart) return false;
  const start = new Date(dateStart);
  if (Number.isNaN(start.getTime())) return false;
  const twoHoursBefore = start.getTime() - 2 * 60 * 60 * 1000;
  const sixHoursAfter = start.getTime() + 6 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  return nowMs >= twoHoursBefore && nowMs <= sixHoursAfter;
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
      return Response.json({ error: "userId required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    // Check date plan exists and is in a valid state
    const dateRows = await sql`
      SELECT match_id, date_status, date_start, date_end, date_verified
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;
    const datePlan = dateRows?.[0] || null;
    if (!datePlan) {
      return Response.json({ error: "No date plan found" }, { status: 400 });
    }

    const status = String(datePlan.date_status);
    if (
      status !== "proposed" &&
      status !== "locked" &&
      status !== "ready" &&
      status !== "unlocked"
    ) {
      return Response.json({ error: "No scheduled date" }, { status: 400 });
    }

    if (datePlan.date_verified) {
      return Response.json(
        { error: "Date already verified", code: "ALREADY_VERIFIED" },
        { status: 409 },
      );
    }

    // Check time window
    const now = new Date();
    if (!isWithinDateWindow(now, datePlan.date_start)) {
      return Response.json(
        {
          error:
            "Verification is only available within 2 hours before and 6 hours after the date",
          code: "OUTSIDE_WINDOW",
        },
        { status: 400 },
      );
    }

    // Invalidate any existing unused tokens for this match (one-at-a-time)
    await sql`
      UPDATE date_verify_tokens
      SET used_at = now()
      WHERE match_id = ${matchIdNum}
        AND used_at IS NULL
        AND expires_at > now()
    `;

    // Issue new token
    const token = randomToken();
    const expiresAt = new Date(now.getTime() + 120 * 1000); // 120 seconds

    const rows = await sql`
      INSERT INTO date_verify_tokens (match_id, issuer_user_id, token, expires_at)
      VALUES (${matchIdNum}, ${userIdNum}, ${token}, ${expiresAt})
      RETURNING id, token, expires_at
    `;

    const r = rows[0];

    // Build QR payload
    const qrPayload = JSON.stringify({
      type: "wifey_date_verify",
      v: 1,
      token: r.token,
      matchId: matchIdNum,
      issuerId: userIdNum,
      expiresAt: new Date(r.expires_at).toISOString(),
    });

    return Response.json({
      ok: true,
      token: r.token,
      expiresAt: new Date(r.expires_at).toISOString(),
      qrPayload,
    });
  } catch (e) {
    console.error("POST /api/drink-perk/[matchId]/verify/token error", e);
    return Response.json({ error: "Failed to issue token" }, { status: 500 });
  }
}
