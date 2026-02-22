import sql from "@/app/api/utils/sql";
import { recordMatchDateEvent } from "@/app/api/utils/dateEvents";

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
    const { userId } = body || {};
    const userIdNum = Number(userId);
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const existing = await sql`
      SELECT match_id, date_status, proposed_by_user_id
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    if (existing.length === 0) {
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
        },
      });
    }

    if (existing[0].date_status === "unlocked") {
      return Response.json(
        { error: "Can't cancel an unlocked date" },
        { status: 400 },
      );
    }

    // Only the proposer can cancel their invite (matches mobile UI expectations)
    if (
      (existing[0].date_status === "proposed" ||
        existing[0].date_status === "locked") &&
      Number(existing[0].proposed_by_user_id) !== Number(userIdNum)
    ) {
      return Response.json(
        { error: "Only the inviter can cancel this date" },
        { status: 403 },
      );
    }

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

    // Restart 7-day countdown since date was canceled
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
      console.error("Could not restore countdown on date cancel", e);
    }

    recordMatchDateEvent({
      matchId: matchIdNum,
      actorUserId: userIdNum,
      eventType: "DATE_CANCELED",
      occurredAt: new Date().toISOString(),
      meta: { source: "api" },
    });

    // NEW: reset Drink on Us perk back to normal when a date is canceled.
    // - If the perk was already redeemed, keep it as REDEEMED (one-time).
    // - Otherwise, go back to LOCKED and clear any READY/together timestamps.
    try {
      await sql`
        INSERT INTO match_drink_perks (match_id, state, together_since, ready_at, redeemed_at, updated_at)
        VALUES (${matchIdNum}, 'LOCKED', NULL, NULL, NULL, now())
        ON CONFLICT (match_id)
        DO UPDATE SET
          state = CASE WHEN match_drink_perks.state = 'REDEEMED' THEN 'REDEEMED' ELSE 'LOCKED' END,
          together_since = NULL,
          ready_at = NULL,
          redeemed_at = CASE WHEN match_drink_perks.state = 'REDEEMED' THEN match_drink_perks.redeemed_at ELSE NULL END,
          updated_at = now()
      `;

      // If a handshake was in progress, close it out so it can't be completed later.
      await sql`
        UPDATE drink_handshake_sessions
        SET completed_at = now()
        WHERE match_id = ${matchIdNum}
          AND completed_at IS NULL
      `;

      // If a credit was unlocked but not redeemed yet, expire it immediately.
      await sql`
        UPDATE drink_credits
        SET expires_at = now()
        WHERE match_id = ${matchIdNum}
          AND redeemed_at IS NULL
          AND expires_at > now()
      `;
    } catch (e) {
      // Don't block date cancel if perk cleanup fails
      console.error("Could not reset drink perk on date cancel", e);
    }

    // NEW: system message in chat
    let systemMessage = null;
    try {
      const actorLabel = await getUserLabel(userIdNum);
      const text = `${actorLabel} canceled the date invite`;
      const inserted = await sql`
        INSERT INTO chat_messages (match_id, sender_id, message_text, is_read)
        VALUES (${matchIdNum}, NULL, ${text}, true)
        RETURNING id, sender_id, message_text, is_read, created_at
      `;
      systemMessage = inserted?.[0] || null;
    } catch (e) {
      console.error("Could not insert date cancel system message", e);
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
    console.error("Error cancelling match date:", error);
    return Response.json({ error: "Failed to cancel date" }, { status: 500 });
  }
}
