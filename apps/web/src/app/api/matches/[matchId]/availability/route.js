import sql from "@/app/api/utils/sql";

const MINIMUM_MESSAGES_EACH_USER = 2;
const DISMISS_COOLDOWN_HOURS = 72;
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

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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

function intersectStrings(a, b) {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

function buildOverlapSummary(overlapDays, overlapTimes) {
  const days = uniqueStrings(overlapDays);
  const times = uniqueStrings(overlapTimes);

  if (days.length === 0 && times.length === 0) return null;

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const weekend = ["Sat", "Sun"];
  const weekdayCount = days.filter((d) => weekdays.includes(d)).length;
  const weekendCount = days.filter((d) => weekend.includes(d)).length;

  let dayLabel = null;
  if (weekdayCount >= 3 && weekendCount === 0) {
    dayLabel = "Weeknights";
  } else if (weekendCount === 2 && weekdayCount === 0) {
    dayLabel = "Weekend";
  } else if (days.length > 0) {
    dayLabel = days.join(" ");
  }

  let timeLabel = null;
  if (times.includes("Evening") && times.length === 1) timeLabel = "Evenings";
  else if (times.includes("Daytime") && times.length === 1)
    timeLabel = "Daytime";
  else if (times.includes("Late") && times.length === 1) timeLabel = "Late";
  else if (times.includes("Flexible")) timeLabel = "Flexible";
  else if (times.length > 0) timeLabel = times.join(" / ");

  if (dayLabel && timeLabel) return `${dayLabel} + ${timeLabel}`;
  return dayLabel || timeLabel || null;
}

function computeOverlap(userA, userB) {
  const aDays = uniqueStrings(normalizeArray(userA?.days));
  const bDays = uniqueStrings(normalizeArray(userB?.days));
  const aTimes = uniqueStrings(normalizeArray(userA?.times));
  const bTimes = uniqueStrings(normalizeArray(userB?.times));

  const overlapDays = intersectStrings(aDays, bDays);

  const aFlexible = aTimes.includes("Flexible");
  const bFlexible = bTimes.includes("Flexible");

  let overlapTimes = intersectStrings(aTimes, bTimes);
  if (aFlexible && !bFlexible) overlapTimes = bTimes;
  if (bFlexible && !aFlexible) overlapTimes = aTimes;
  if (aFlexible && bFlexible) overlapTimes = ["Flexible"];

  const summary = buildOverlapSummary(overlapDays, overlapTimes);

  return {
    days: overlapDays,
    times: overlapTimes,
    summary,
  };
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

    const otherUserIdNum = Number(access.other_user_id);

    const userRows = await sql`
      SELECT match_id, user_id, days, times, tag, dismissed_until, not_sure_until, updated_at
      FROM match_availability
      WHERE match_id = ${matchIdNum} AND user_id = ${userIdNum}
      LIMIT 1
    `;

    const otherRows = await sql`
      SELECT match_id, user_id, days, times, tag, dismissed_until, not_sure_until, updated_at
      FROM match_availability
      WHERE match_id = ${matchIdNum} AND user_id = ${otherUserIdNum}
      LIMIT 1
    `;

    const userAvailability = userRows[0]
      ? {
          matchId: userRows[0].match_id,
          userId: userRows[0].user_id,
          days: normalizeArray(userRows[0].days),
          times: normalizeArray(userRows[0].times),
          tag: userRows[0].tag || null,
          dismissedUntil: toIsoOrNull(userRows[0].dismissed_until),
          notSureUntil: toIsoOrNull(userRows[0].not_sure_until),
          updatedAt: toIsoOrNull(userRows[0].updated_at),
        }
      : null;

    const otherAvailability = otherRows[0]
      ? {
          matchId: otherRows[0].match_id,
          userId: otherRows[0].user_id,
          days: normalizeArray(otherRows[0].days),
          times: normalizeArray(otherRows[0].times),
          tag: otherRows[0].tag || null,
          updatedAt: toIsoOrNull(otherRows[0].updated_at),
        }
      : null;

    let seed = null;
    if (!userAvailability) {
      const seedRows = await sql`
        SELECT days, times
        FROM match_availability
        WHERE user_id = ${userIdNum}
          AND (tag IS NULL OR tag = '')
          AND jsonb_array_length(days) > 0
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      if (seedRows.length > 0) {
        seed = {
          days: normalizeArray(seedRows[0].days),
          times: normalizeArray(seedRows[0].times),
        };
      }
    }

    let overlap = null;
    const bothSavedNormally =
      userAvailability &&
      otherAvailability &&
      !userAvailability.tag &&
      !otherAvailability.tag &&
      userAvailability.days.length > 0 &&
      otherAvailability.days.length > 0;

    if (bothSavedNormally) {
      overlap = computeOverlap(userAvailability, otherAvailability);
    }

    return Response.json({
      availability: userAvailability,
      otherAvailability,
      seed,
      overlap,
      config: {
        minimumMessagesEachUser: MINIMUM_MESSAGES_EACH_USER,
        dismissCooldownHours: DISMISS_COOLDOWN_HOURS,
        notSureCooldownDays: NOT_SURE_COOLDOWN_DAYS,
      },
    });
  } catch (error) {
    console.error("Error fetching match availability:", error);
    return Response.json(
      { error: "Failed to fetch availability" },
      { status: 500 },
    );
  }
}
