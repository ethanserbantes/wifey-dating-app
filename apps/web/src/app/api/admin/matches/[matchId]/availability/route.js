import sql from "@/app/api/utils/sql";

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

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function getMatchOrNull(matchId) {
  const rows = await sql`
    SELECT id, user1_id, user2_id
    FROM matches
    WHERE id = ${matchId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getAvailability(matchId, userId) {
  const rows = await sql`
    SELECT match_id, user_id, days, times, tag, dismissed_until, not_sure_until, updated_at
    FROM match_availability
    WHERE match_id = ${matchId} AND user_id = ${userId}
    LIMIT 1
  `;

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    matchId: r.match_id,
    userId: r.user_id,
    days: normalizeArray(r.days),
    times: normalizeArray(r.times),
    tag: r.tag || null,
    dismissedUntil: toIsoOrNull(r.dismissed_until),
    notSureUntil: toIsoOrNull(r.not_sure_until),
    updatedAt: toIsoOrNull(r.updated_at),
  };
}

export async function GET(request, { params }) {
  try {
    const matchId = Number(params?.matchId);
    if (!Number.isFinite(matchId)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userId = Number(searchParams.get("userId"));
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const match = await getMatchOrNull(matchId);
    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const isParticipant =
      userId === match.user1_id || userId === match.user2_id;
    if (!isParticipant) {
      return Response.json(
        { error: "User is not a participant in this match" },
        { status: 400 },
      );
    }

    const otherUserId =
      userId === match.user1_id ? match.user2_id : match.user1_id;

    const availability = await getAvailability(matchId, userId);
    const otherAvailability = await getAvailability(matchId, otherUserId);

    let overlap = null;
    const bothSavedNormally =
      availability &&
      otherAvailability &&
      !availability.tag &&
      !otherAvailability.tag &&
      availability.days.length > 0 &&
      otherAvailability.days.length > 0;

    if (bothSavedNormally) {
      overlap = computeOverlap(availability, otherAvailability);
    }

    return Response.json({ availability, otherAvailability, overlap });
  } catch (error) {
    console.error("Error fetching admin match availability:", error);
    return Response.json(
      { error: "Failed to fetch availability" },
      { status: 500 },
    );
  }
}

export async function POST(request, { params }) {
  try {
    const matchId = Number(params?.matchId);
    if (!Number.isFinite(matchId)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const match = await getMatchOrNull(matchId);
    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const isParticipant =
      userId === match.user1_id || userId === match.user2_id;
    if (!isParticipant) {
      return Response.json(
        { error: "User is not a participant in this match" },
        { status: 400 },
      );
    }

    const tagRaw = body?.tag ? String(body.tag) : null;
    const tag = tagRaw === "not_sure" ? "not_sure" : null;

    const daysInput = normalizeArray(body?.days);
    const timesInput = normalizeArray(body?.times);

    const days = uniqueStrings(daysInput).slice(0, 3);
    const times = uniqueStrings(timesInput);

    const finalDays = tag ? [] : days;
    const finalTimes = tag ? [] : times;

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
        ${matchId},
        ${userId},
        ${JSON.stringify(finalDays)}::jsonb,
        ${JSON.stringify(finalTimes)}::jsonb,
        ${tag},
        NULL,
        NULL,
        now(),
        now()
      )
      ON CONFLICT (match_id, user_id)
      DO UPDATE SET
        days = EXCLUDED.days,
        times = EXCLUDED.times,
        tag = EXCLUDED.tag,
        dismissed_until = NULL,
        not_sure_until = NULL,
        updated_at = now()
    `;

    const otherUserId =
      userId === match.user1_id ? match.user2_id : match.user1_id;

    const availability = await getAvailability(matchId, userId);
    const otherAvailability = await getAvailability(matchId, otherUserId);

    let overlap = null;
    const bothSavedNormally =
      availability &&
      otherAvailability &&
      !availability.tag &&
      !otherAvailability.tag &&
      availability.days.length > 0 &&
      otherAvailability.days.length > 0;

    if (bothSavedNormally) {
      overlap = computeOverlap(availability, otherAvailability);
    }

    return Response.json({
      ok: true,
      availability,
      otherAvailability,
      overlap,
    });
  } catch (error) {
    console.error("Error saving admin match availability:", error);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
