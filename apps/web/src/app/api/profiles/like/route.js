import sql from "@/app/api/utils/sql";
import {
  sendMatchPushNotification,
  sendLikePushNotification,
} from "@/app/api/utils/pushNotifications";

const START_CHAT_HINT_TEXT = "__START_CHAT_HINT__";

const CONTACT_EMAIL_REGEX = "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}";
const CONTACT_PHONE_REGEX = "(\\+?\\d[\\d\\-() .]{8,}\\d)";
const CONTACT_SOCIAL_REGEX =
  "(\\minstagram\\M|\\minsta\\M|\\mig\\M|instagram\\.com|\\msnapchat\\M|\\msnap\\M|\\mtiktok\\M|\\mwhatsapp\\M|wa\\.me|\\mtelegram\\M|t\\.me|\\msignal\\M|\\mfacebook\\M|\\mfb\\M|\\mtwitter\\M|x\\.com|\\mdiscord\\M)";

export async function POST(request) {
  try {
    const body = await request.json();
    const { fromUserId, toUserId, sectionType, sectionKey, commentText } = body;

    if (!fromUserId || !toUserId) {
      return Response.json({ error: "User IDs required" }, { status: 400 });
    }

    // Basic anti-spam rate limit (deterministic): cap likes per minute.
    const recent = await sql`
      SELECT COUNT(*)::int AS count
      FROM profile_likes
      WHERE from_user_id = ${fromUserId}
        AND created_at > (now() - interval '60 seconds')
    `;
    const recentCount = recent?.[0]?.count ?? 0;
    if (recentCount >= 25) {
      return Response.json(
        { error: "Too many likes. Please slow down." },
        { status: 429 },
      );
    }

    const safeSectionType =
      typeof sectionType === "string" && sectionType.length <= 50
        ? sectionType
        : null;
    const safeSectionKey = typeof sectionKey === "string" ? sectionKey : null;
    const safeCommentText =
      typeof commentText === "string" && commentText.trim().length
        ? commentText.trim().slice(0, 2000)
        : null;

    // Insert like.
    // IMPORTANT: the hidden-like throttle defaults new likes to pending_hidden.
    // If the like already exists (e.g. user tapped twice), do NOT reset status.
    // CHANGE: RETURN whether this row was newly inserted so we don't spam notifications.
    const insertedRows = await sql`
      INSERT INTO profile_likes (
        from_user_id,
        to_user_id,
        section_type,
        section_key,
        comment_text,
        status,
        pending_hidden,
        reveal_comment_after_match
      )
      VALUES (
        ${fromUserId},
        ${toUserId},
        ${safeSectionType},
        ${safeSectionKey},
        ${safeCommentText},
        'pending_hidden',
        true,
        true
      )
      ON CONFLICT (from_user_id, to_user_id) DO UPDATE
      SET
        section_type = COALESCE(profile_likes.section_type, EXCLUDED.section_type),
        section_key = COALESCE(profile_likes.section_key, EXCLUDED.section_key),
        comment_text = COALESCE(profile_likes.comment_text, EXCLUDED.comment_text)
      RETURNING id, (xmax = 0) AS inserted
    `;

    const didInsertNewLike = insertedRows?.[0]?.inserted === true;

    // Check if it's a mutual like.
    // NOTE: queued mutual likes are stored as status='matched' even before a match row exists.
    // CHANGE: include 'expired' so if the viewer previously passed this inbound like (and later
    // changes their mind / rewinds), liking back can still create a match.
    const mutualLike = await sql`
      SELECT id
      FROM profile_likes
      WHERE from_user_id = ${toUserId} AND to_user_id = ${fromUserId}
        AND status IN ('pending_hidden','surfaced','matched','expired')
      LIMIT 1
    `;

    let isMatch = false;
    let matchId = null;
    let isPending = false;

    if (mutualLike.length > 0) {
      const fromIdNum = Number(fromUserId);
      const toIdNum = Number(toUserId);
      const low = Math.min(fromIdNum, toIdNum);
      const high = Math.max(fromIdNum, toIdNum);

      // If a match already exists, return it (idempotent).
      const existingMatch = await sql`
        SELECT id
        FROM matches
        WHERE user1_id = ${low} AND user2_id = ${high}
        LIMIT 1
      `;

      if (existingMatch?.length) {
        isMatch = true;
        matchId = existingMatch?.[0]?.id;
        return Response.json({
          success: true,
          isMatch,
          matchId,
          isPending: false,
        });
      }

      // NEW: If either user is currently in an active conversation, we queue this match.
      // That way:
      // - The "busy" user doesn't see the new match yet.
      // - The other user sees a neutral "Match pending" placeholder.
      const activeRows = await sql`
        SELECT user_id, active_match_id
        FROM user_active_conversations
        WHERE user_id IN (${fromIdNum}, ${toIdNum})
      `;

      const fromActive = activeRows.find(
        (r) => Number(r.user_id) === fromIdNum,
      );
      const toActive = activeRows.find((r) => Number(r.user_id) === toIdNum);

      const fromHasActive =
        fromActive?.active_match_id != null &&
        Number.isFinite(Number(fromActive.active_match_id));
      const toHasActive =
        toActive?.active_match_id != null &&
        Number.isFinite(Number(toActive.active_match_id));

      const shouldQueue = Boolean(fromHasActive || toHasActive);

      if (shouldQueue) {
        await sql`
          UPDATE profile_likes
          SET status = 'matched', pending_hidden = false, matched_at = NOW(), expired_at = NULL
          WHERE (from_user_id = ${fromUserId} AND to_user_id = ${toUserId})
             OR (from_user_id = ${toUserId} AND to_user_id = ${fromUserId})
        `;

        isMatch = true;
        matchId = null;
        isPending = true;

        // NEW: Best-effort push notify the *other* user if they are not the active/busy one.
        // This helps TestFlight users actually see a notification for a match even when the
        // match is queued (no match row yet).
        try {
          const otherUserId = fromIdNum === low ? high : low;
          const otherHasActive =
            otherUserId === fromIdNum ? fromHasActive : toHasActive;

          if (!otherHasActive) {
            await sendMatchPushNotification({
              toUserId: otherUserId,
              fromUserId: fromIdNum,
              matchId: null,
            });
          }
        } catch (e) {
          console.error("Could not send queued-match push:", e);
        }

        return Response.json({ success: true, isMatch, matchId, isPending });
      }

      const now = new Date();
      const user1SeenAt = fromIdNum === low ? now : null;
      const user2SeenAt = fromIdNum === high ? now : null;

      // Match creation + like state updates should be atomic.
      const created = await sql.transaction(async (txn) => {
        const match = await txn`
          INSERT INTO matches (user1_id, user2_id, user1_seen_at, user2_seen_at)
          VALUES (${low}, ${high}, ${user1SeenAt}, ${user2SeenAt})
          ON CONFLICT (user1_id, user2_id) DO UPDATE
          SET created_at = matches.created_at
          RETURNING id
        `;

        const nextMatchId = match?.[0]?.id;

        await txn`
          UPDATE profile_likes
          SET status = 'matched', pending_hidden = false, matched_at = NOW(), expired_at = NULL
          WHERE (from_user_id = ${fromUserId} AND to_user_id = ${toUserId})
             OR (from_user_id = ${toUserId} AND to_user_id = ${fromUserId})
        `;

        // One-time unread "start chat" hint for BOTH users.
        if (Number.isFinite(Number(nextMatchId))) {
          const existingHint = await txn`
            SELECT 1
            FROM chat_messages
            WHERE match_id = ${nextMatchId}
              AND message_type = 'SYSTEM_HINT'
            LIMIT 1
          `;

          if (existingHint.length === 0) {
            await txn`
              INSERT INTO chat_messages (match_id, sender_id, message_text, message_type, is_read)
              VALUES
                (${nextMatchId}, ${low}, ${START_CHAT_HINT_TEXT}, 'SYSTEM_HINT', false),
                (${nextMatchId}, ${high}, ${START_CHAT_HINT_TEXT}, 'SYSTEM_HINT', false)
            `;
          }
        }

        return nextMatchId;
      });

      isMatch = true;
      matchId = created;

      // Push notify the other user (best-effort)
      const otherUserId = fromIdNum === low ? high : low;
      try {
        await sendMatchPushNotification({
          toUserId: otherUserId,
          fromUserId: fromIdNum,
          matchId,
        });
      } catch (e) {
        console.error("Could not send match push:", e);
      }
    }

    // NEW: send a push for the inbound like so the receiver knows to check Likes.
    // Even though the like may be paywalled, the notification is important.
    // Best-effort: do not block the request if Expo push fails.
    if (!isMatch && didInsertNewLike) {
      try {
        await sendLikePushNotification({
          toUserId: Number(toUserId),
          fromUserId: Number(fromUserId),
        });
      } catch (e) {
        console.error("Could not send like push:", e);
      }
    }

    return Response.json({ success: true, isMatch, matchId, isPending });
  } catch (error) {
    console.error("Error liking profile:", error);
    return Response.json({ error: "Failed to like profile" }, { status: 500 });
  }
}

// ADD: allow the app to "rewind" after a like/comment (Hinge-style undo)
export async function DELETE(request) {
  try {
    const body = await request.json();
    const { fromUserId, toUserId } = body;

    if (!fromUserId || !toUserId) {
      return Response.json({ error: "User IDs required" }, { status: 400 });
    }

    const fromIdNum = Number(fromUserId);
    const toIdNum = Number(toUserId);

    // Remove this user's like.
    await sql`
      DELETE FROM profile_likes
      WHERE from_user_id = ${fromUserId} AND to_user_id = ${toUserId}
    `;

    // If a match exists between the two users, remove it (and refund any committed chat credits)
    // because mutual-like is no longer true.
    const match = await sql`
      SELECT id
      FROM matches
      WHERE user1_id = LEAST(${fromUserId}, ${toUserId})
        AND user2_id = GREATEST(${fromUserId}, ${toUserId})
      LIMIT 1
    `;

    const matchId = match?.[0]?.id || null;

    if (matchId) {
      await sql.transaction((txn) => [
        // refund any committed deposits for this match (only if contact info was NOT exchanged)
        txn(
          `
            WITH m AS (
              SELECT id, user1_id, user2_id
              FROM matches
              WHERE id = $1
              FOR UPDATE
            ),
            contact AS (
              SELECT EXISTS (
                SELECT 1
                FROM chat_messages cm
                WHERE cm.match_id = $1
                  AND cm.sender_id IS NOT NULL
                  AND COALESCE(cm.message_type, 'TEXT') NOT IN (
                    'DATE_FEEDBACK',
                    'SYSTEM',
                    'SYSTEM_HINT',
                    'CHAT_CREDIT_REQUIRED'
                  )
                  AND (
                    COALESCE(cm.message_text, '') ~* $2
                    OR COALESCE(cm.message_text, '') ~* $3
                    OR LOWER(COALESCE(cm.message_text, '')) ~ $4
                  )
                LIMIT 1
              ) AS shared
            ),
            e AS (
              SELECT match_id, user1_deposit_cents, user2_deposit_cents
              FROM match_chat_escrows
              WHERE match_id = $1
              FOR UPDATE
            ),
            ins_wallets AS (
              INSERT INTO date_credit_wallets (user_id)
              SELECT user1_id FROM m
              UNION
              SELECT user2_id FROM m
              ON CONFLICT (user_id) DO NOTHING
            ),
            refund_user1 AS (
              UPDATE date_credit_wallets w
              SET balance_cents = w.balance_cents + CASE WHEN (SELECT shared FROM contact) THEN 0 ELSE COALESCE(e.user1_deposit_cents, 0) END,
                  updated_at = now()
              FROM m, e
              WHERE w.user_id = m.user1_id
                AND (CASE WHEN (SELECT shared FROM contact) THEN 0 ELSE COALESCE(e.user1_deposit_cents, 0) END) > 0
              RETURNING w.user_id AS user_id,
                        CASE WHEN (SELECT shared FROM contact) THEN 0 ELSE COALESCE(e.user1_deposit_cents, 0) END AS refunded_cents
            ),
            refund_user2 AS (
              UPDATE date_credit_wallets w
              SET balance_cents = w.balance_cents + CASE WHEN (SELECT shared FROM contact) THEN 0 ELSE COALESCE(e.user2_deposit_cents, 0) END,
                  updated_at = now()
              FROM m, e
              WHERE w.user_id = m.user2_id
                AND (CASE WHEN (SELECT shared FROM contact) THEN 0 ELSE COALESCE(e.user2_deposit_cents, 0) END) > 0
              RETURNING w.user_id AS user_id,
                        CASE WHEN (SELECT shared FROM contact) THEN 0 ELSE COALESCE(e.user2_deposit_cents, 0) END AS refunded_cents
            ),
            ledger1 AS (
              INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
              SELECT user_id, $1, 'REFUND', refunded_cents,
                     jsonb_build_object('reason', 'undo_like', 'contact_shared', (SELECT shared FROM contact))
              FROM refund_user1
              RETURNING 1
            ),
            ledger2 AS (
              INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
              SELECT user_id, $1, 'REFUND', refunded_cents,
                     jsonb_build_object('reason', 'undo_like', 'contact_shared', (SELECT shared FROM contact))
              FROM refund_user2
              RETURNING 1
            ),
            del_escrow AS (
              DELETE FROM match_chat_escrows
              WHERE match_id = $1
              RETURNING match_id
            ),
            del_chat AS (
              DELETE FROM chat_messages
              WHERE match_id = $1
              RETURNING 1
            ),
            del_match AS (
              DELETE FROM matches
              WHERE id = $1
              RETURNING id
            )
            SELECT 1
          `,
          [
            Number(matchId),
            CONTACT_EMAIL_REGEX,
            CONTACT_PHONE_REGEX,
            CONTACT_SOCIAL_REGEX,
          ],
        ),
      ]);
    }

    return Response.json({ success: true, removedMatch: !!matchId });
  } catch (error) {
    console.error("Error undoing like:", error);
    return Response.json({ error: "Failed to undo like" }, { status: 500 });
  }
}
