import sql from "@/app/api/utils/sql";
import { sendDrinkReadyPushNotification } from "@/app/api/utils/pushNotifications";

async function assertMatchAccess(matchIdNum, userIdNum) {
  const accessRows = await sql`
    SELECT
      m.id,
      m.user1_id,
      m.user2_id,
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

function haversineMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const aa =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function isWithinUnlockWindow(now, dateStart, dateEnd) {
  if (!dateStart) return false;
  const start = new Date(dateStart);
  if (Number.isNaN(start.getTime())) return false;

  const end = dateEnd ? new Date(dateEnd) : null;
  const endMs =
    end && !Number.isNaN(end.getTime()) ? end.getTime() : start.getTime();

  const sixHoursMs = 6 * 60 * 60 * 1000;
  const windowStart = start.getTime() - sixHoursMs;
  const windowEnd = endMs + sixHoursMs;

  const nowMs = now.getTime();
  return nowMs >= windowStart && nowMs <= windowEnd;
}

async function ensurePerkRow(matchIdNum) {
  const rows = await sql`
    INSERT INTO match_drink_perks (match_id)
    VALUES (${matchIdNum})
    ON CONFLICT (match_id)
    DO UPDATE SET updated_at = now()
    RETURNING match_id, state, together_since, ready_at, redeemed_at, updated_at
  `;
  return rows[0];
}

async function evaluateProximity({
  matchIdNum,
  user1Id,
  user2Id,
  dateStart,
  dateEnd,
}) {
  const now = new Date();

  const perkRows = await sql`
    SELECT match_id, state, together_since, ready_at, redeemed_at
    FROM match_drink_perks
    WHERE match_id = ${matchIdNum}
    LIMIT 1
  `;

  if (!perkRows || perkRows.length === 0) {
    return null;
  }

  const perk = perkRows[0];

  if (String(perk.state) === "REDEEMED") {
    return perk;
  }

  const inWindow = isWithinUnlockWindow(now, dateStart, dateEnd);
  if (!inWindow) {
    return perk;
  }

  const locRows = await sql`
    SELECT user_id, lat, lng, captured_at
    FROM user_location_latest
    WHERE user_id IN (${Number(user1Id)}, ${Number(user2Id)})
  `;

  if (!locRows || locRows.length < 2) {
    return perk;
  }

  const locA = locRows.find((r) => Number(r.user_id) === Number(user1Id));
  const locB = locRows.find((r) => Number(r.user_id) === Number(user2Id));

  const aLat = Number(locA?.lat);
  const aLng = Number(locA?.lng);
  const bLat = Number(locB?.lat);
  const bLng = Number(locB?.lng);

  if (
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng)
  ) {
    return perk;
  }

  const aTime = locA?.captured_at ? new Date(locA.captured_at) : null;
  const bTime = locB?.captured_at ? new Date(locB.captured_at) : null;
  if (!aTime || !bTime) {
    return perk;
  }

  const fiveMinMs = 5 * 60 * 1000;
  if (now.getTime() - aTime.getTime() > fiveMinMs) return perk;
  if (now.getTime() - bTime.getTime() > fiveMinMs) return perk;

  const dist = haversineMeters(aLat, aLng, bLat, bLng);
  const within = dist <= 50;

  if (!within) {
    const updated = await sql`
      UPDATE match_drink_perks
      SET together_since = NULL,
          updated_at = now()
      WHERE match_id = ${matchIdNum}
        AND together_since IS NOT NULL
      RETURNING match_id, state, together_since, ready_at, redeemed_at
    `;

    return updated?.[0] || perk;
  }

  const togetherSince = perk.together_since
    ? new Date(perk.together_since)
    : null;
  if (!togetherSince || Number.isNaN(togetherSince.getTime())) {
    const updated = await sql`
      UPDATE match_drink_perks
      SET together_since = now(),
          updated_at = now()
      WHERE match_id = ${matchIdNum}
      RETURNING match_id, state, together_since, ready_at, redeemed_at
    `;
    return updated[0];
  }

  const twoMinMs = 2 * 60 * 1000;
  const elapsed = now.getTime() - togetherSince.getTime();

  if (elapsed >= twoMinMs && String(perk.state) !== "READY") {
    const updated = await sql`
      UPDATE match_drink_perks
      SET state = 'READY',
          ready_at = now(),
          updated_at = now()
      WHERE match_id = ${matchIdNum}
      RETURNING match_id, state, together_since, ready_at, redeemed_at
    `;

    // Best-effort push to both users.
    await sendDrinkReadyPushNotification({
      toUserId: Number(user1Id),
      matchId: matchIdNum,
    });
    await sendDrinkReadyPushNotification({
      toUserId: Number(user2Id),
      matchId: matchIdNum,
    });

    return updated[0];
  }

  return perk;
}

export async function GET(request, { params }) {
  try {
    const matchIdRaw = params?.matchId;
    const matchIdNum = Number(matchIdRaw);
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

    const dateRows = await sql`
      SELECT match_id, date_status, date_start, date_end
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const dateRow = dateRows?.[0] || null;
    const dateStatus = String(dateRow?.date_status || "none");
    const dateStart = dateRow?.date_start || null;
    const dateEnd = dateRow?.date_end || null;

    const hasDatePlan = dateStatus !== "none" && dateStatus !== "expired";

    const perkRow = await ensurePerkRow(matchIdNum);

    let perk = perkRow;

    if (hasDatePlan && String(perkRow?.state || "LOCKED") === "LOCKED") {
      const updated = await sql`
        UPDATE match_drink_perks
        SET state = 'ARMED',
            updated_at = now()
        WHERE match_id = ${matchIdNum}
        RETURNING match_id, state, together_since, ready_at, redeemed_at, updated_at
      `;
      perk = updated[0];
    }

    if (String(perk?.state) === "ARMED" || String(perk?.state) === "READY") {
      const evaluated = await evaluateProximity({
        matchIdNum,
        user1Id: access.user1_id,
        user2Id: access.user2_id,
        dateStart,
        dateEnd,
      });
      if (evaluated) {
        perk = evaluated;
      }
    }

    const creditRows = await sql`
      SELECT id, token, unlocked_at, expires_at, redeemed_at
      FROM drink_credits
      WHERE match_id = ${matchIdNum}
      ORDER BY id DESC
      LIMIT 1
    `;

    const credit = creditRows?.[0]
      ? {
          id: Number(creditRows[0].id),
          token: String(creditRows[0].token || ""),
          unlockedAt: toIsoOrNull(creditRows[0].unlocked_at),
          expiresAt: toIsoOrNull(creditRows[0].expires_at),
          redeemedAt: toIsoOrNull(creditRows[0].redeemed_at),
        }
      : null;

    return Response.json({
      perk: {
        matchId: matchIdNum,
        state: String(perk?.state || "LOCKED"),
        togetherSince: toIsoOrNull(perk?.together_since),
        readyAt: toIsoOrNull(perk?.ready_at),
        redeemedAt: toIsoOrNull(perk?.redeemed_at),
      },
      date: {
        matchId: matchIdNum,
        hasDatePlan,
        dateStatus,
        dateStart: toIsoOrNull(dateStart),
        dateEnd: toIsoOrNull(dateEnd),
      },
      credit,
    });
  } catch (error) {
    console.error("Error fetching drink perk:", error);
    return Response.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
