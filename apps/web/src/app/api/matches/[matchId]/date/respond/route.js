import sql from "@/app/api/utils/sql";
import { recordMatchDateEvent } from "@/app/api/utils/dateEvents";
import { sendDateUpdatePushNotification } from "@/app/api/utils/pushNotifications";

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

async function getUserLabel(userIdNum) {
  try {
    const rows = await sql`
      SELECT COALESCE(up.display_name, u.email, 'Someone') AS label
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = ${userIdNum}
      LIMIT 1
    `;
    const label = rows?.[0]?.label;
    return label ? String(label) : "Someone";
  } catch (e) {
    console.error("Could not load user label", e);
    return "Someone";
  }
}

export async function POST(request, { params }) {
  try {
    const matchIdRaw = params?.matchId;
    const matchIdNum = Number(matchIdRaw);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const { userId, response } = body || {};
    const userIdNum = Number(userId);
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const otherUserId = Number(access?.other_user_id);

    const resp = String(response || "").toLowerCase();
    if (resp !== "accept" && resp !== "decline") {
      return Response.json({ error: "Invalid response" }, { status: 400 });
    }

    const rows = await sql`
      SELECT match_id, date_status, proposed_by_user_id
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    if (rows.length === 0 || rows[0].date_status !== "proposed") {
      return Response.json(
        { error: "No proposed date to respond to" },
        { status: 400 },
      );
    }

    const plan = rows[0];

    const actorLabel = await getUserLabel(userIdNum);

    if (resp === "accept") {
      if (plan.proposed_by_user_id === userIdNum) {
        return Response.json(
          { error: "You can't accept your own proposal" },
          { status: 400 },
        );
      }

      const updated = await sql`
        UPDATE match_date_plans
        SET date_status = 'locked', updated_at = now()
        WHERE match_id = ${matchIdNum}
        RETURNING
          match_id, date_status, proposed_by_user_id,
          date_start, date_end, activity_label, place_label,
          place_id, cover_image_url, place_lat, place_lng,
          credit_amount_cents, credit_status, credit_expires_at
      `;
      const r = updated[0];

      // Clear countdown — date is locked in
      try {
        await sql`
          UPDATE match_conversation_states
          SET expires_at = NULL, updated_at = now()
          WHERE match_id = ${matchIdNum}
            AND active_at IS NOT NULL
            AND terminal_state IS NULL
        `;
      } catch (e) {
        console.error("Could not clear countdown on date accept", e);
      }

      recordMatchDateEvent({
        matchId: matchIdNum,
        actorUserId: userIdNum,
        eventType: "DATE_ACCEPTED",
        occurredAt: new Date().toISOString(),
        meta: { source: "api" },
      });

      // NEW: system message in chat
      let systemMessage = null;
      try {
        const text = `${actorLabel} accepted the date`;
        const inserted = await sql`
          INSERT INTO chat_messages (match_id, sender_id, message_text, is_read)
          VALUES (${matchIdNum}, NULL, ${text}, true)
          RETURNING id, sender_id, message_text, is_read, created_at
        `;
        systemMessage = inserted?.[0] || null;
      } catch (e) {
        console.error("Could not insert date accept system message", e);
      }

      // Best-effort push to the proposer
      try {
        if (Number.isFinite(otherUserId) && otherUserId !== userIdNum) {
          await sendDateUpdatePushNotification({
            toUserId: otherUserId,
            matchId: matchIdNum,
            title: "Date accepted",
            body: `${actorLabel} accepted the date`,
          });
        }
      } catch (e) {
        console.error("Could not send date update push", e);
      }

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
        },
        systemMessage,
      });
    }

    // decline -> reset
    const updated = await sql`
      UPDATE match_date_plans
      SET
        date_status = 'none',
        proposed_by_user_id = NULL,
        date_start = NULL,
        date_end = NULL,
        activity_label = NULL,
        place_label = NULL,
        place_id = NULL,
        cover_image_url = NULL,
        place_lat = NULL,
        place_lng = NULL,
        credit_status = 'pending',
        credit_expires_at = NULL,
        updated_at = now()
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
        credit_expires_at
    `;

    const r = updated[0];

    // Restart 7-day countdown since the date was declined (no scheduled date anymore)
    try {
      await sql`
        UPDATE match_conversation_states
        SET expires_at = now() + interval '7 days',
            updated_at = now()
        WHERE match_id = ${matchIdNum}
          AND active_at IS NOT NULL
          AND terminal_state IS NULL
          AND expires_at IS NULL
      `;
    } catch (e) {
      console.error("Could not restore countdown on date decline", e);
    }

    recordMatchDateEvent({
      matchId: matchIdNum,
      actorUserId: userIdNum,
      eventType: "DATE_DECLINED",
      occurredAt: new Date().toISOString(),
      meta: { source: "api" },
    });

    // NEW: system message in chat
    let systemMessage = null;
    try {
      const text = `${actorLabel} declined the date`;
      const inserted = await sql`
        INSERT INTO chat_messages (match_id, sender_id, message_text, is_read)
        VALUES (${matchIdNum}, NULL, ${text}, true)
        RETURNING id, sender_id, message_text, is_read, created_at
      `;
      systemMessage = inserted?.[0] || null;
    } catch (e) {
      console.error("Could not insert date decline system message", e);
    }

    // Best-effort push to the proposer
    try {
      if (Number.isFinite(otherUserId) && otherUserId !== userIdNum) {
        await sendDateUpdatePushNotification({
          toUserId: otherUserId,
          matchId: matchIdNum,
          title: "Date declined",
          body: `${actorLabel} declined the date`,
        });
      }
    } catch (e) {
      console.error("Could not send date update push", e);
    }

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
      },
      systemMessage,
    });
  } catch (error) {
    console.error("Error responding to match date:", error);
    return Response.json({ error: "Failed to respond" }, { status: 500 });
  }
}
