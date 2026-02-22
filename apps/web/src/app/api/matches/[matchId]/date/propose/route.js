import sql from "@/app/api/utils/sql";
import { upload } from "@/app/api/utils/upload";
import { recordMatchDateEvent } from "@/app/api/utils/dateEvents";
import { sendDateInvitePushNotification } from "@/app/api/utils/pushNotifications";

function getGoogleServerApiKey() {
  // IMPORTANT: do not use NEXT_PUBLIC_* keys for server-to-server Places API calls.
  // Those are often HTTP referrer restricted (browser-only) and will 400 here.
  const key =
    process.env.WIFEY_GOOGLE_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY;
  return key ? String(key).trim() : null;
}

async function fetchPlaceDetails(placeId) {
  const pid = String(placeId || "").trim();
  if (!pid) return null;

  const key = getGoogleServerApiKey();
  if (!key) return null;

  // NOTE: We ask for rating + user_ratings_total + editorial_summary so the mobile date card
  // can show reviews + a short description.
  const fields = [
    "name",
    "formatted_address",
    "geometry",
    "photos",
    "rating",
    "user_ratings_total",
    "editorial_summary",
  ].join(",");

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(pid)}&fields=${encodeURIComponent(fields)}&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    let bodyText = "";
    try {
      bodyText = await resp.text();
    } catch {
      // ignore
    }

    throw new Error(
      `When fetching Google Place Details, the response was [${resp.status}] ${resp.statusText}. ${bodyText}`,
    );
  }
  const json = await resp.json();
  if (json?.status !== "OK") {
    // Not fatal; just means we couldn't enrich.
    return null;
  }
  return json?.result || null;
}

function buildPlaceMeta(details) {
  if (!details) return null;

  const ratingNum = Number(details?.rating);
  const rating = Number.isFinite(ratingNum) ? ratingNum : null;

  const ratingsTotalNum = Number(details?.user_ratings_total);
  const ratingsTotal = Number.isFinite(ratingsTotalNum)
    ? ratingsTotalNum
    : null;

  const addressRaw = details?.formatted_address;
  const address = addressRaw ? String(addressRaw).trim() : null;

  const descRaw = details?.editorial_summary?.overview;
  const description = descRaw ? String(descRaw).trim() : null;

  if (rating == null && ratingsTotal == null && !address && !description) {
    return null;
  }

  return {
    rating,
    ratingsTotal,
    address,
    description,
  };
}

async function maybeUploadCoverImageFromPlaceDetails(details) {
  const photoRef = details?.photos?.[0]?.photo_reference;
  if (!photoRef) return null;

  const key = getGoogleServerApiKey();
  if (!key) return null;

  // This endpoint redirects to the actual image. We upload it so we don't expose the API key in the client.
  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photoreference=${encodeURIComponent(photoRef)}&key=${encodeURIComponent(key)}`;
  const up = await upload({ url: photoUrl });
  if (up?.error) {
    console.error("Cover image upload failed:", up.error);
    return null;
  }
  return up?.url || null;
}

async function maybeUploadStaticMapCover({ placeLat, placeLng }) {
  const lat = Number(placeLat);
  const lng = Number(placeLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = getGoogleServerApiKey();
  if (!key) return null;

  // Fallback image when a place has no photo.
  // NOTE: this still uses Google APIs, but we upload the resulting image so we never expose the key.
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
    `${lat},${lng}`,
  )}&zoom=15&size=800x500&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(
    `${lat},${lng}`,
  )}&key=${encodeURIComponent(key)}`;

  const up = await upload({ url: mapUrl });
  if (up?.error) {
    console.error("Static map cover upload failed:", up.error);
    return null;
  }

  return up?.url || null;
}

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

export async function POST(request, { params }) {
  try {
    const matchIdRaw = params?.matchId;
    const matchIdNum = Number(matchIdRaw);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const {
      userId,
      dateStart,
      dateEnd,
      activityLabel,
      placeLabel,
      placeId,
      creditAmountCents,
    } = body || {};

    const userIdNum = Number(userId);
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const otherUserId = Number(access?.other_user_id);

    const start = new Date(dateStart);
    const end = new Date(dateEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return Response.json(
        { error: "Invalid dateStart/dateEnd" },
        { status: 400 },
      );
    }
    if (end.getTime() <= start.getTime()) {
      return Response.json(
        { error: "dateEnd must be after dateStart" },
        { status: 400 },
      );
    }

    const activity = String(activityLabel || "").trim();
    if (!activity) {
      return Response.json(
        { error: "activityLabel required" },
        { status: 400 },
      );
    }

    const place = String(placeLabel || "").trim();
    if (!place) {
      return Response.json({ error: "placeLabel required" }, { status: 400 });
    }

    const amountCentsRaw =
      creditAmountCents == null ? 1000 : Number(creditAmountCents);
    const amountCents = Number.isFinite(amountCentsRaw)
      ? Math.max(0, Math.round(amountCentsRaw))
      : 1000;

    const placeIdStr = placeId ? String(placeId).trim() : null;

    // If we already have planner prefs on this match, preserve them.
    let existingPlannerPrefs = {};
    try {
      const existingRows = await sql`
        SELECT planner_prefs
        FROM match_date_plans
        WHERE match_id = ${matchIdNum}
        LIMIT 1
      `;
      const existing = existingRows?.[0]?.planner_prefs;
      if (existing && typeof existing === "object") {
        existingPlannerPrefs = existing;
      }
    } catch (e) {
      console.error("Could not load existing planner_prefs", e);
    }

    // Enrich: lat/lng + cover image + place meta (rating/reviews/description)
    let coverImageUrl = null;
    let placeLat = null;
    let placeLng = null;
    let placeMeta = null;

    if (placeIdStr) {
      try {
        const details = await fetchPlaceDetails(placeIdStr);
        if (details?.geometry?.location) {
          const lat = Number(details.geometry.location.lat);
          const lng = Number(details.geometry.location.lng);
          placeLat = Number.isFinite(lat) ? lat : null;
          placeLng = Number.isFinite(lng) ? lng : null;
        }

        placeMeta = buildPlaceMeta(details);

        coverImageUrl = await maybeUploadCoverImageFromPlaceDetails(details);

        // Fallback if the place has no photo (or photo upload failed)
        if (!coverImageUrl && placeLat != null && placeLng != null) {
          coverImageUrl = await maybeUploadStaticMapCover({
            placeLat,
            placeLng,
          });
        }
      } catch (e) {
        console.error(e);
        // Not fatal; user can still propose.
        coverImageUrl = null;
        placeMeta = null;
      }
    }

    const mergedPlannerPrefs = {
      ...(existingPlannerPrefs && typeof existingPlannerPrefs === "object"
        ? existingPlannerPrefs
        : {}),
      ...(placeMeta
        ? {
            placeMeta,
          }
        : {}),
    };

    const plannerPrefsJson = JSON.stringify(mergedPlannerPrefs || {});

    const rows = await sql`
      INSERT INTO match_date_plans (
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
        planner_prefs,
        updated_at
      ) VALUES (
        ${matchIdNum},
        'proposed',
        ${userIdNum},
        ${start},
        ${end},
        ${activity},
        ${place},
        ${placeIdStr},
        ${coverImageUrl},
        ${placeLat},
        ${placeLng},
        ${amountCents},
        'pending',
        ${plannerPrefsJson}::jsonb,
        now()
      )
      ON CONFLICT (match_id)
      DO UPDATE SET
        date_status = 'proposed',
        proposed_by_user_id = EXCLUDED.proposed_by_user_id,
        date_start = EXCLUDED.date_start,
        date_end = EXCLUDED.date_end,
        activity_label = EXCLUDED.activity_label,
        place_label = EXCLUDED.place_label,
        place_id = EXCLUDED.place_id,
        cover_image_url = EXCLUDED.cover_image_url,
        place_lat = EXCLUDED.place_lat,
        place_lng = EXCLUDED.place_lng,
        credit_amount_cents = EXCLUDED.credit_amount_cents,
        credit_status = 'pending',
        credit_expires_at = NULL,
        planner_prefs = EXCLUDED.planner_prefs,
        updated_at = now()
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

    const r = rows[0];

    // Clear the 7-day countdown when a date is proposed (scheduled in-app)
    try {
      await sql`
        UPDATE match_conversation_states
        SET expires_at = NULL, updated_at = now()
        WHERE match_id = ${matchIdNum}
          AND active_at IS NOT NULL
          AND terminal_state IS NULL
      `;
    } catch (e) {
      console.error("Could not clear countdown on date propose", e);
    }

    const meta = r?.planner_prefs?.placeMeta || null;

    const date = {
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
      placeRating: meta?.rating ?? null,
      placeRatingsTotal: meta?.ratingsTotal ?? null,
      placeAddress: meta?.address ?? null,
      placeDescription: meta?.description ?? null,
    };

    // Record a durable history event for analytics/insights.
    recordMatchDateEvent({
      matchId: matchIdNum,
      actorUserId: userIdNum,
      eventType: "DATE_PROPOSED",
      occurredAt: new Date().toISOString(),
      meta: {
        source: "api",
        dateStart: date.dateStart,
        dateEnd: date.dateEnd,
        activityLabel: date.activityLabel,
        placeLabel: date.placeLabel,
        placeId: date.placeId,
      },
    });

    // NEW: also post a structured "date invite" message into chat.
    // We store JSON in message_text (backwards compatible) and render it as a card on mobile.
    let inviteMessage = null;
    try {
      const invitePayload = {
        type: "date_invite",
        v: 1,
        date,
      };
      const messageText = JSON.stringify(invitePayload);

      const inserted = await sql`
        INSERT INTO chat_messages (match_id, sender_id, message_text)
        VALUES (${matchIdNum}, ${userIdNum}, ${messageText})
        RETURNING id, sender_id, message_text, is_read, created_at
      `;
      inviteMessage = inserted?.[0] || null;
    } catch (e) {
      console.error("Could not insert date invite message", e);
    }

    // Best-effort push to the other user
    try {
      if (Number.isFinite(otherUserId) && otherUserId !== userIdNum) {
        await sendDateInvitePushNotification({
          toUserId: otherUserId,
          fromUserId: userIdNum,
          matchId: matchIdNum,
        });
      }
    } catch (e) {
      console.error("Could not send date invite push", e);
    }

    return Response.json({
      date,
      inviteMessage,
    });
  } catch (error) {
    console.error("Error proposing match date:", error);
    return Response.json({ error: "Failed to propose date" }, { status: 500 });
  }
}
