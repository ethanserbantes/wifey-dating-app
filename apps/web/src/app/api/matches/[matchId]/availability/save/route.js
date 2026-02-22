import sql from "@/app/api/utils/sql";

const NOT_SURE_COOLDOWN_DAYS = 7;

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

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [];
}

function uniqueStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const s = String(x || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
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

    const tagRaw = body?.tag ? String(body.tag) : null;
    const tag = tagRaw === "not_sure" ? "not_sure" : null;

    const daysInput = normalizeArray(body?.days);
    const timesInput = normalizeArray(body?.times);

    const days = uniqueStrings(daysInput).slice(0, 3);
    const times = uniqueStrings(timesInput);

    const notSureUntil = tag
      ? new Date(Date.now() + NOT_SURE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
      : null;

    const finalDays = tag ? [] : days;
    const finalTimes = tag ? [] : times;

    const rows = await sql`
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
        ${JSON.stringify(finalDays)}::jsonb,
        ${JSON.stringify(finalTimes)}::jsonb,
        ${tag},
        NULL,
        ${notSureUntil},
        now(),
        now()
      )
      ON CONFLICT (match_id, user_id)
      DO UPDATE SET
        days = EXCLUDED.days,
        times = EXCLUDED.times,
        tag = EXCLUDED.tag,
        dismissed_until = NULL,
        not_sure_until = EXCLUDED.not_sure_until,
        updated_at = now()
      RETURNING match_id, user_id
    `;

    return Response.json({ ok: true, availability: rows[0] });
  } catch (error) {
    console.error("Error saving availability:", error);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
