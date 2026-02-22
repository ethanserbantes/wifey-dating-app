import sql from "@/app/api/utils/sql";
import {
  spendDateCreditsForUsers,
  DATE_CREDIT_REQUIRED_CENTS,
} from "@/app/api/utils/dateCredits";

const CONTACT_EMAIL_REGEX = "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}";
// Pragmatic phone pattern: 10+ digits with optional separators.
const CONTACT_PHONE_REGEX = "(\\+?\\d[\\d\\-() .]{8,}\\d)";
// Social keywords / urls (checked against LOWER(message_text)).
const CONTACT_SOCIAL_REGEX =
  "(\\minstagram\\M|\\minsta\\M|\\mig\\M|instagram\\.com|\\msnapchat\\M|\\msnap\\M|\\mtiktok\\M|\\mwhatsapp\\M|wa\\.me|\\mtelegram\\M|t\\.me|\\msignal\\M|\\mfacebook\\M|\\mfb\\M|\\mtwitter\\M|x\\.com|\\mdiscord\\M)";

const ALLOWED_REASON_CODES = new Set([
  "NOT_INTERESTED",
  "NOT_READY_TO_MEET",
  "NO_LONGER_LOOKING",
  "UNCOMFORTABLE",
  "SAFETY_CONCERN",
  "OTHER",
  "UNKNOWN",
]);

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

    const reasonCodeRaw =
      body?.reasonCode != null ? String(body.reasonCode).trim() : "";
    const reasonCode = ALLOWED_REASON_CODES.has(reasonCodeRaw)
      ? reasonCodeRaw
      : "UNKNOWN";

    const reasonTextRaw =
      body?.reasonText != null ? String(body.reasonText).trim() : "";
    const reasonText =
      reasonTextRaw && reasonTextRaw.length <= 400 ? reasonTextRaw : null;

    // NEW POLICY:
    // - Users can unmatch at any time.
    // - A date credit is ONLY spent when an ACTIVE chat ends AND contact info was shared.
    // - We no longer refund per-match escrow deposits here (credits aren't committed per match).

    const txRows = await sql.transaction((txn) => [
      txn(
        `
          WITH m AS (
            SELECT id, user1_id, user2_id
            FROM matches
            WHERE id = $1
              AND ($2 = user1_id OR $2 = user2_id)
            FOR UPDATE
          ),
          ins_unmatch AS (
            INSERT INTO match_unmatch_events (
              match_id,
              actor_user_id,
              other_user_id,
              user1_id,
              user2_id,
              reason_code,
              reason_text
            )
            SELECT
              m.id,
              $2,
              CASE WHEN m.user1_id = $2 THEN m.user2_id ELSE m.user1_id END,
              m.user1_id,
              m.user2_id,
              $3,
              $4
            FROM m
            RETURNING 1
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
                  COALESCE(cm.message_text, '') ~* $5
                  OR COALESCE(cm.message_text, '') ~* $6
                  OR LOWER(COALESCE(cm.message_text, '')) ~ $7
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
            (SELECT COUNT(*)::int FROM m) AS match_found,
            (SELECT COUNT(*)::int FROM del_match) AS match_deleted,
            (SELECT user1_id FROM m LIMIT 1) AS user1_id,
            (SELECT user2_id FROM m LIMIT 1) AS user2_id,
            (SELECT shared FROM contact) AS contact_shared,
            (SELECT (active_at IS NOT NULL AND terminal_state IS NULL) FROM s) AS was_active
        `,
        [
          matchId,
          userId,
          reasonCode,
          reasonText,
          CONTACT_EMAIL_REGEX,
          CONTACT_PHONE_REGEX,
          CONTACT_SOCIAL_REGEX,
        ],
      ),
    ]);

    const row = txRows?.[0]?.[0] || null;

    if (!row || Number(row.match_found) === 0) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const contactShared = Boolean(row.contact_shared);
    const wasActive = Boolean(row.was_active);

    // Spend credits only when ending an active chat *and* contact info was exchanged.
    if (wasActive && contactShared) {
      const userIds = [Number(row.user1_id), Number(row.user2_id)].filter((n) =>
        Number.isFinite(n),
      );

      await spendDateCreditsForUsers({
        userIds,
        matchId,
        reason: "unmatch_contact_shared",
        meta: { source: "unmatch", requiredCents: DATE_CREDIT_REQUIRED_CENTS },
      });
    }

    return Response.json({
      success: true,
      contactShared,
      wasActive,
      creditsSpent: wasActive && contactShared,
    });
  } catch (error) {
    console.error("Error unmatching:", error);
    return Response.json({ error: "Failed to unmatch" }, { status: 500 });
  }
}
