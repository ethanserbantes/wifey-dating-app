import sql from "@/app/api/utils/sql";

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

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function safeJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") {
    return value;
  }
  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

export async function POST(request, { params }) {
  try {
    const matchIdRaw = params?.matchId;
    const matchIdNum = Number(matchIdRaw);
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

    const plannerPrefs = safeJsonObject(body?.plannerPrefs);

    // Create row if it doesn't exist, but never change date fields here.
    const rows = await sql`
      INSERT INTO match_date_plans (
        match_id,
        date_status,
        credit_amount_cents,
        credit_status,
        planner_prefs,
        updated_at
      ) VALUES (
        ${matchIdNum},
        'none',
        1000,
        'pending',
        ${plannerPrefs},
        now()
      )
      ON CONFLICT (match_id)
      DO UPDATE SET
        planner_prefs = EXCLUDED.planner_prefs,
        updated_at = now()
      RETURNING
        match_id,
        date_status,
        proposed_by_user_id,
        date_start,
        date_end,
        place_label,
        credit_amount_cents,
        credit_status,
        credit_expires_at,
        planner_prefs
    `;

    const r = rows[0];

    return Response.json({
      date: {
        matchId: r.match_id,
        dateStatus: r.date_status,
        proposedByUserId: r.proposed_by_user_id,
        dateStart: toIsoOrNull(r.date_start),
        dateEnd: toIsoOrNull(r.date_end),
        placeLabel: r.place_label,
        creditAmountCents: r.credit_amount_cents,
        creditStatus: r.credit_status,
        creditExpiresAt: toIsoOrNull(r.credit_expires_at),
        plannerPrefs: r.planner_prefs || {},
      },
    });
  } catch (error) {
    console.error("Error saving date planner prefs:", error);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
