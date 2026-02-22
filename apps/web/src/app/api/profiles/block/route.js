import sql from "@/app/api/utils/sql";
import {
  spendDateCreditsForUsers,
  DATE_CREDIT_REQUIRED_CENTS,
} from "@/app/api/utils/dateCredits";

const CONTACT_EMAIL_REGEX = "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}";
const CONTACT_PHONE_REGEX = "(\\+?\\d[\\d\\-() .]{8,}\\d)";
const CONTACT_SOCIAL_REGEX =
  "(\\minstagram\\M|\\minsta\\M|\\mig\\M|instagram\\.com|\\msnapchat\\M|\\msnap\\M|\\mtiktok\\M|\\mwhatsapp\\M|wa\\.me|\\mtelegram\\M|t\\.me|\\msignal\\M|\\mfacebook\\M|\\mfb\\M|\\mtwitter\\M|x\\.com|\\mdiscord\\M)";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const blockerUserId = Number(body?.blockerUserId);
    const blockedUserId = Number(body?.blockedUserId);

    if (!Number.isFinite(blockerUserId) || blockerUserId <= 0) {
      return Response.json({ error: "Invalid blockerUserId" }, { status: 400 });
    }

    if (!Number.isFinite(blockedUserId) || blockedUserId <= 0) {
      return Response.json({ error: "Invalid blockedUserId" }, { status: 400 });
    }

    if (blockerUserId === blockedUserId) {
      return Response.json({ error: "Cannot block yourself" }, { status: 400 });
    }

    // Block + cleanup so the user disappears immediately from feed and can't re-match.
    // NEW POLICY: if a match existed and it was an ACTIVE chat with contact shared,
    // spend a date credit for both users.
    const txRes = await sql.transaction((txn) => [
      txn`
        INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
        VALUES (${blockerUserId}, ${blockedUserId})
        ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
      `,
      txn`
        DELETE FROM profile_likes
        WHERE (from_user_id = ${blockerUserId} AND to_user_id = ${blockedUserId})
           OR (from_user_id = ${blockedUserId} AND to_user_id = ${blockerUserId})
      `,
      txn`
        DELETE FROM profile_passes
        WHERE (from_user_id = ${blockerUserId} AND to_user_id = ${blockedUserId})
           OR (from_user_id = ${blockedUserId} AND to_user_id = ${blockerUserId})
      `,
      txn(
        `
          WITH m AS (
            SELECT id, user1_id, user2_id
            FROM matches
            WHERE user1_id = LEAST($1, $2)
              AND user2_id = GREATEST($1, $2)
            FOR UPDATE
          ),
          s AS (
            SELECT active_at, terminal_state
            FROM match_conversation_states
            WHERE match_id IN (SELECT id FROM m)
            LIMIT 1
          ),
          contact AS (
            SELECT EXISTS (
              SELECT 1
              FROM chat_messages cm
              WHERE cm.match_id IN (SELECT id FROM m)
                AND cm.sender_id IS NOT NULL
                AND COALESCE(cm.message_type, 'TEXT') NOT IN (
                  'DATE_FEEDBACK',
                  'SYSTEM',
                  'SYSTEM_HINT',
                  'CHAT_CREDIT_REQUIRED'
                )
                AND (
                  COALESCE(cm.message_text, '') ~* $3
                  OR COALESCE(cm.message_text, '') ~* $4
                  OR LOWER(COALESCE(cm.message_text, '')) ~ $5
                )
              LIMIT 1
            ) AS shared
          ),
          del_escrow AS (
            DELETE FROM match_chat_escrows
            WHERE match_id IN (SELECT id FROM m)
            RETURNING match_id
          ),
          del_match AS (
            DELETE FROM matches
            WHERE id IN (SELECT id FROM m)
            RETURNING id
          )
          SELECT
            (SELECT id FROM m LIMIT 1) AS match_id,
            (SELECT user1_id FROM m LIMIT 1) AS user1_id,
            (SELECT user2_id FROM m LIMIT 1) AS user2_id,
            (SELECT shared FROM contact) AS contact_shared,
            (SELECT (active_at IS NOT NULL AND terminal_state IS NULL) FROM s) AS was_active
        `,
        [
          blockerUserId,
          blockedUserId,
          CONTACT_EMAIL_REGEX,
          CONTACT_PHONE_REGEX,
          CONTACT_SOCIAL_REGEX,
        ],
      ),
    ]);

    const summary = txRes?.[3]?.[0] || null;
    const matchId = summary?.match_id != null ? Number(summary.match_id) : null;
    const contactShared = Boolean(summary?.contact_shared);
    const wasActive = Boolean(summary?.was_active);

    if (Number.isFinite(matchId) && wasActive && contactShared) {
      const userIds = [
        Number(summary?.user1_id),
        Number(summary?.user2_id),
      ].filter((n) => Number.isFinite(n));

      await spendDateCreditsForUsers({
        userIds,
        matchId,
        reason: "profile_block_contact_shared",
        meta: {
          source: "profile_block",
          requiredCents: DATE_CREDIT_REQUIRED_CENTS,
        },
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error blocking user from profile:", error);
    return Response.json({ error: "Failed to block user" }, { status: 500 });
  }
}
