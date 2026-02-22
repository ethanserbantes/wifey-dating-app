import sql from "@/app/api/utils/sql";
import { recordMatchDateEvent } from "@/app/api/utils/dateEvents";
import {
  spendDateCreditsForUsers,
  DATE_CREDIT_REQUIRED_CENTS,
} from "@/app/api/utils/dateCredits";

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

function extractPlaceMetaFields(plannerPrefs) {
  const prefs =
    plannerPrefs && typeof plannerPrefs === "object" ? plannerPrefs : {};
  const meta =
    prefs?.placeMeta && typeof prefs.placeMeta === "object"
      ? prefs.placeMeta
      : null;

  return {
    placeRating: meta?.rating ?? null,
    placeRatingsTotal: meta?.ratingsTotal ?? null,
    placeAddress: meta?.address ?? null,
    placeDescription: meta?.description ?? null,
  };
}

async function spendIfDatePassed(matchIdNum) {
  try {
    // Mark spent once per match (idempotent)
    const updated = await sql`
      UPDATE match_date_plans
      SET credit_status = 'spent', updated_at = now()
      WHERE match_id = ${matchIdNum}
        AND credit_status IS DISTINCT FROM 'spent'
        AND date_end IS NOT NULL
        AND date_end <= now()
        AND date_status <> 'none'
      RETURNING match_id
    `;

    if (!updated || updated.length === 0) {
      return;
    }

    const matchRows = await sql`
      SELECT user1_id, user2_id
      FROM matches
      WHERE id = ${matchIdNum}
      LIMIT 1
    `;

    const m = matchRows?.[0] || null;
    const userIds = [Number(m?.user1_id), Number(m?.user2_id)].filter((n) =>
      Number.isFinite(n),
    );

    if (!userIds.length) {
      return;
    }

    await spendDateCreditsForUsers({
      userIds,
      matchId: matchIdNum,
      reason: "date_time_passed",
      meta: {
        source: "match_date_get",
        requiredCents: DATE_CREDIT_REQUIRED_CENTS,
      },
    });
  } catch (e) {
    console.error("[match/date] spendIfDatePassed failed", e);
  }
}

export async function GET(request, { params }) {
  try {
    const matchIdRaw = params?.matchId;
    const matchIdNum = Number(matchIdRaw);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const userIdNum = Number(userIdRaw);

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    // Auto-expire locked dates after the window closes (if not unlocked)
    const now = new Date();

    const rows = await sql`
      SELECT
        match_id,
        date_status,
        proposed_by_user_id,
        date_start,
        date_end,
        activity_label,
        place_label,
        place_id,
        cover_image_url,
        place_lat,
        place_lng,
        credit_amount_cents,
        credit_status,
        credit_expires_at,
        planner_prefs,
        created_at,
        updated_at
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({
        date: {
          matchId: matchIdNum,
          dateStatus: "none",
          proposedByUserId: null,
          dateStart: null,
          dateEnd: null,
          activityLabel: null,
          placeLabel: null,
          placeId: null,
          coverImageUrl: null,
          placeLat: null,
          placeLng: null,
          creditAmountCents: 1000,
          creditStatus: "pending",
          creditExpiresAt: null,
          plannerPrefs: {},
          placeRating: null,
          placeRatingsTotal: null,
          placeAddress: null,
          placeDescription: null,
        },
      });
    }

    const r = rows[0];
    const metaFields = extractPlaceMetaFields(r.planner_prefs);

    const end = r.date_end ? new Date(r.date_end) : null;
    const shouldExpire =
      (r.date_status === "locked" || r.date_status === "ready") &&
      end &&
      !Number.isNaN(end.getTime()) &&
      now.getTime() > end.getTime() &&
      r.date_status !== "unlocked";

    if (shouldExpire) {
      const prevStatus = String(r.date_status || "");

      const updatedRows = await sql`
        UPDATE match_date_plans
        SET date_status = 'expired', updated_at = now()
        WHERE match_id = ${matchIdNum}
        RETURNING
          match_id,
          date_status,
          proposed_by_user_id,
          date_start,
          date_end,
          activity_label,
          place_label,
          place_id,
          cover_image_url,
          place_lat,
          place_lng,
          credit_amount_cents,
          credit_status,
          credit_expires_at,
          planner_prefs
      `;
      const u = updatedRows[0];
      const uMetaFields = extractPlaceMetaFields(u.planner_prefs);

      recordMatchDateEvent({
        matchId: matchIdNum,
        actorUserId: null,
        eventType: "DATE_EXPIRED",
        occurredAt: new Date().toISOString(),
        meta: { source: "auto_expire", fromStatus: prevStatus },
      });

      // NEW: If a scheduled date has passed, spend the date credit for both users.
      await spendIfDatePassed(matchIdNum);

      return Response.json({
        date: {
          matchId: u.match_id,
          dateStatus: u.date_status,
          proposedByUserId: u.proposed_by_user_id,
          dateStart: toIsoOrNull(u.date_start),
          dateEnd: toIsoOrNull(u.date_end),
          activityLabel: u.activity_label,
          placeLabel: u.place_label,
          placeId: u.place_id,
          coverImageUrl: u.cover_image_url,
          placeLat: u.place_lat,
          placeLng: u.place_lng,
          creditAmountCents: u.credit_amount_cents,
          creditStatus: u.credit_status,
          creditExpiresAt: toIsoOrNull(u.credit_expires_at),
          plannerPrefs: u.planner_prefs || {},
          ...uMetaFields,
        },
      });
    }

    // NEW: If a scheduled date has passed, spend the date credit for both users.
    await spendIfDatePassed(matchIdNum);

    return Response.json({
      date: {
        matchId: r.match_id,
        dateStatus: r.date_status,
        proposedByUserId: r.proposed_by_user_id,
        dateStart: toIsoOrNull(r.date_start),
        dateEnd: toIsoOrNull(r.date_end),
        activityLabel: r.activity_label,
        placeLabel: r.place_label,
        placeId: r.place_id,
        coverImageUrl: r.cover_image_url,
        placeLat: r.place_lat,
        placeLng: r.place_lng,
        creditAmountCents: r.credit_amount_cents,
        creditStatus: r.credit_status,
        creditExpiresAt: toIsoOrNull(r.credit_expires_at),
        plannerPrefs: r.planner_prefs || {},
        ...metaFields,
      },
    });
  } catch (error) {
    console.error("Error fetching match date:", error);
    return Response.json(
      { error: "Failed to fetch match date" },
      { status: 500 },
    );
  }
}
