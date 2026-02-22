import sql from "@/app/api/utils/sql";
import {
  spendDateCreditsForUsers,
  DATE_CREDIT_REQUIRED_CENTS,
} from "@/app/api/utils/dateCredits";

const CONTACT_EMAIL_REGEX = "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}";
const CONTACT_PHONE_REGEX = "(\\+?\\d[\\d\\-() .]{8,}\\d)";
const CONTACT_SOCIAL_REGEX =
  "(\\minstagram\\M|\\minsta\\M|\\mig\\M|instagram\\.com|\\msnapchat\\M|\\msnap\\M|\\mtiktok\\M|\\mwhatsapp\\M|wa\\.me|\\mtelegram\\M|t\\.me|\\msignal\\M|\\mfacebook\\M|\\mfb\\M|\\mtwitter\\M|x\\.com|\\mdiscord\\M)";

export async function POST(request, { params }) {
  try {
    const matchIdRaw = params?.matchId;
    const matchId = Number(matchIdRaw);
    if (!Number.isFinite(matchId)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const userId = Number(body?.userId);

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const matchRows = await sql`
      SELECT id, user1_id, user2_id
      FROM matches
      WHERE id = ${matchId}
        AND (${userId} = user1_id OR ${userId} = user2_id)
      LIMIT 1
    `;

    if (matchRows.length === 0) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const match = matchRows[0];
    const otherUserId =
      Number(match.user1_id) === userId
        ? Number(match.user2_id)
        : Number(match.user1_id);

    if (!Number.isFinite(otherUserId)) {
      return Response.json(
        { error: "Could not determine other user" },
        { status: 500 },
      );
    }

    // Block + cleanup + delete match in a transaction.
    // NEW POLICY: spend a date credit only when ending an ACTIVE chat AND contact info was exchanged.
    const result = await sql.transaction((txn) => [
      txn`
        INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
        VALUES (${userId}, ${otherUserId})
        ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
      `,
      // remove likes/pass history so they don't re-appear
      txn`
        DELETE FROM profile_likes
        WHERE (from_user_id = ${userId} AND to_user_id = ${otherUserId})
           OR (from_user_id = ${otherUserId} AND to_user_id = ${userId})
      `,
      txn`
        DELETE FROM profile_passes
        WHERE (from_user_id = ${userId} AND to_user_id = ${otherUserId})
           OR (from_user_id = ${otherUserId} AND to_user_id = ${userId})
      `,
      txn(
        `
          WITH m AS (
            SELECT id, user1_id, user2_id
            FROM matches
            WHERE id = $1
              AND ($2 = user1_id OR $2 = user2_id)
            FOR UPDATE
          ),
          s AS (
            SELECT active_at, terminal_state
            FROM match_conversation_states
            WHERE match_id = $1
            LIMIT 1
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
                  COALESCE(cm.message_text, '') ~* $3
                  OR COALESCE(cm.message_text, '') ~* $4
                  OR LOWER(COALESCE(cm.message_text, '')) ~ $5
                )
              LIMIT 1
            ) AS shared
          ),
          del_escrow AS (
            DELETE FROM match_chat_escrows
            WHERE match_id = $1
            RETURNING match_id
          ),
          del_match AS (
            DELETE FROM matches
            WHERE id IN (SELECT id FROM m)
            RETURNING id
          )
          SELECT
            (SELECT COUNT(*)::int FROM del_match) AS match_deleted,
            (SELECT user1_id FROM m LIMIT 1) AS user1_id,
            (SELECT user2_id FROM m LIMIT 1) AS user2_id,
            (SELECT shared FROM contact) AS contact_shared,
            (SELECT (active_at IS NOT NULL AND terminal_state IS NULL) FROM s) AS was_active
        `,
        [
          matchId,
          userId,
          CONTACT_EMAIL_REGEX,
          CONTACT_PHONE_REGEX,
          CONTACT_SOCIAL_REGEX,
        ],
      ),
    ]);

    const summary = result?.[3]?.[0] || null;

    const contactShared = Boolean(summary?.contact_shared);
    const wasActive = Boolean(summary?.was_active);

    if (wasActive && contactShared) {
      const userIds = [
        Number(summary?.user1_id),
        Number(summary?.user2_id),
      ].filter((n) => Number.isFinite(n));

      await spendDateCreditsForUsers({
        userIds,
        matchId,
        reason: "block_contact_shared",
        meta: { source: "block", requiredCents: DATE_CREDIT_REQUIRED_CENTS },
      });
    }

    return Response.json({
      success: true,
      blockedUserId: otherUserId,
      contactShared,
      wasActive,
      creditsSpent: wasActive && contactShared,
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    return Response.json({ error: "Failed to block user" }, { status: 500 });
  }
}
