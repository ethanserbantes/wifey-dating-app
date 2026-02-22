import sql from "@/app/api/utils/sql";
import {
  spendDateCreditsForUsers,
  DATE_CREDIT_REQUIRED_CENTS,
} from "@/app/api/utils/dateCredits";

const EXCLUDED_MESSAGE_TYPES = [
  "DATE_FEEDBACK",
  "SYSTEM",
  "SYSTEM_HINT",
  "CHAT_CREDIT_REQUIRED",
];

function safeJsonParse(input, fallback) {
  if (!input) return fallback;
  if (typeof input === "object") return input;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function starterSummaryForViewer({ viewerUserId, otherName, likeRow }) {
  if (!likeRow) return null;
  const fromId = Number(likeRow?.starter_from_user_id);
  const viewerId = Number(viewerUserId);
  if (!Number.isFinite(fromId) || !Number.isFinite(viewerId)) return null;

  const sectionType = String(likeRow?.starter_section_type || "").toLowerCase();
  const isComment =
    typeof likeRow?.starter_comment_text === "string" &&
    likeRow.starter_comment_text.trim().length > 0;

  const subject = fromId === viewerId ? "You" : String(otherName || "They");
  const verb = isComment ? "commented on" : "liked";

  const sectionLabel =
    sectionType === "photo"
      ? "photo"
      : sectionType === "prompt"
        ? "prompt"
        : "profile";

  const ownerText =
    fromId === viewerId ? (otherName ? `${otherName}'s` : "their") : "your";

  return `${subject} ${verb} ${ownerText} ${sectionLabel}.`;
}

async function spendPassedDateCreditsForUser(userId) {
  const userIdNum = Number(userId);
  if (!Number.isFinite(userIdNum)) return;

  try {
    // Mark as spent once per match and return the affected matches.
    const rows = await sql`
      WITH upd AS (
        UPDATE match_date_plans dp
        SET credit_status = 'spent', updated_at = now()
        FROM matches m
        WHERE dp.match_id = m.id
          AND (m.user1_id = ${userIdNum} OR m.user2_id = ${userIdNum})
          AND dp.credit_status IS DISTINCT FROM 'spent'
          AND dp.date_status <> 'none'
          AND dp.date_end IS NOT NULL
          AND dp.date_end <= now()
        RETURNING dp.match_id
      )
      SELECT
        u.match_id,
        m.user1_id,
        m.user2_id
      FROM upd u
      INNER JOIN matches m ON m.id = u.match_id
    `;

    const list = Array.isArray(rows) ? rows : [];
    for (const r of list) {
      const matchId = Number(r?.match_id);
      const userIds = [Number(r?.user1_id), Number(r?.user2_id)].filter((n) =>
        Number.isFinite(n),
      );

      if (!Number.isFinite(matchId) || userIds.length === 0) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await spendDateCreditsForUsers({
        userIds,
        matchId,
        reason: "date_time_passed",
        meta: {
          source: "matches_list_sweep",
          requiredCents: DATE_CREDIT_REQUIRED_CENTS,
        },
      });
    }
  } catch (e) {
    console.error("[matches] spendPassedDateCreditsForUser failed", e);
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const userId = Number(userIdRaw);

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    // NEW: sweep spent credits for passed scheduled dates.
    // This keeps the Messages header in sync without requiring the user to open the Date tab.
    await spendPassedDateCreditsForUser(userId);

    // 1) Sweep: mark any expired pre-chats as expired (best-effort, no cron).
    try {
      await sql`
        UPDATE match_conversation_states
        SET terminal_state = 'expired',
            terminal_at = now(),
            updated_at = now()
        WHERE terminal_state IS NULL
          AND active_at IS NULL
          AND decision_expires_at IS NOT NULL
          AND decision_expires_at <= now()
          AND (user1_id = ${userId} OR user2_id = ${userId})
      `;
    } catch (e) {
      console.error("[matches] expire sweep failed", e);
    }

    // 1a) Sweep: expire active chats whose 7-day countdown has elapsed without a date being scheduled.
    try {
      await sql`
        UPDATE match_conversation_states s
        SET terminal_state = 'expired',
            terminal_at = now(),
            updated_at = now()
        FROM matches m
        WHERE s.match_id = m.id
          AND s.terminal_state IS NULL
          AND s.active_at IS NOT NULL
          AND s.expires_at IS NOT NULL
          AND s.expires_at <= now()
          AND (s.user1_id = ${userId} OR s.user2_id = ${userId})
          AND NOT EXISTS (
            SELECT 1 FROM match_date_plans dp
            WHERE dp.match_id = s.match_id
              AND dp.date_status IN ('proposed', 'locked', 'ready', 'unlocked')
          )
      `;
    } catch (e) {
      console.error("[matches] 7-day countdown expire sweep failed", e);
    }

    // 1b) Restore legacy "unavailable" terminal rows.
    // We used to mark pre-chats as terminal_state='unavailable' when a user hit their active-chat limit.
    // That caused the match to disappear from the Messages tab after a few seconds.
    // Now we treat "limit reached" as non-terminal, so we clear those legacy terminal flags.
    try {
      await sql`
        UPDATE match_conversation_states
        SET terminal_state = NULL,
            terminal_at = NULL,
            updated_at = now()
        WHERE terminal_state = 'unavailable'
          AND active_at IS NULL
          AND (user1_id = ${userId} OR user2_id = ${userId})
      `;
    } catch (e) {
      console.error("[matches] unavailable restore sweep failed", e);
    }

    // 2) Backfill: ensure state rows exist for any match that already has messages.
    // (This makes older data compatible with the new Pre-Chat flow.)
    try {
      await sql`
        INSERT INTO match_conversation_states (match_id, user1_id, user2_id)
        SELECT m.id, m.user1_id, m.user2_id
        FROM matches m
        WHERE (m.user1_id = ${userId} OR m.user2_id = ${userId})
          AND EXISTS (
            SELECT 1
            FROM chat_messages cm
            WHERE cm.match_id = m.id
              AND cm.sender_id IS NOT NULL
              AND COALESCE(cm.message_type, 'TEXT') <> ALL(${EXCLUDED_MESSAGE_TYPES})
              AND NOT (LOWER(COALESCE(cm.message_text, '')) LIKE 'start the chat with %')
              AND NOT (
                LOWER(COALESCE(cm.message_text, '')) LIKE '%start with intent%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%date credit%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%unlock%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%$30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add a $30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add $30%'
              )
          )
        ON CONFLICT (match_id)
        DO NOTHING
      `;
    } catch (e) {
      console.error("[matches] state backfill failed", e);
    }

    // 3) Pending mutual matches (existing behavior)
    const pendingCountRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT
          LEAST(pl1.from_user_id, pl1.to_user_id) AS a,
          GREATEST(pl1.from_user_id, pl1.to_user_id) AS b
        FROM profile_likes pl1
        INNER JOIN profile_likes pl2
          ON pl2.from_user_id = pl1.to_user_id
         AND pl2.to_user_id = pl1.from_user_id
        WHERE pl1.status = 'matched'
          AND pl2.status = 'matched'
          AND (pl1.from_user_id = ${userId} OR pl1.to_user_id = ${userId})
          AND NOT EXISTS (
            SELECT 1
            FROM matches m
            WHERE m.user1_id = LEAST(pl1.from_user_id, pl1.to_user_id)
              AND m.user2_id = GREATEST(pl1.from_user_id, pl1.to_user_id)
          )
      ) t
    `;

    const pendingMatchCount = Number(pendingCountRows?.[0]?.count) || 0;

    // 4) Main list
    const rows = await sql`
      SELECT
        m.id AS match_id,
        m.created_at,
        m.user1_id,
        m.user2_id,
        CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END AS user_id,

        -- NEW: per-user archive/hidden
        a.archived_at AS archived_at,
        a.reason AS archive_reason,

        -- message stats
        msg_stats.message_count AS real_message_count,
        msg_stats.first_sender_id AS first_message_sender_id,
        msg_stats.last_message AS last_message,
        msg_stats.last_message_time AS last_message_time,
        msg_stats.unread_count AS unread_count,

        -- date plan info (used elsewhere)
        COALESCE(dp.date_status, 'none') AS date_status,
        dp.date_end AS date_end,

        -- match seen state
        CASE
          WHEN m.user1_id = ${userId} THEN (m.user1_seen_at IS NULL)
          ELSE (m.user2_seen_at IS NULL)
        END AS is_new_match,

        -- other profile
        COALESCE(NULLIF(up.display_name, ''), NULLIF(au.name, ''), u2.email) AS display_name,
        up.age,
        up.bio,
        COALESCE(up.photos, '[]'::jsonb) AS photos,

        -- starter like summary
        pl_last.from_user_id AS starter_from_user_id,
        pl_last.to_user_id AS starter_to_user_id,
        pl_last.section_type AS starter_section_type,
        pl_last.section_key AS starter_section_key,
        pl_last.comment_text AS starter_comment_text,
        pl_last.created_at AS starter_created_at,

        -- presence
        p.last_seen_at,
        (p.last_seen_at IS NOT NULL AND p.last_seen_at > (now() - interval '5 minutes')) AS is_online,

        -- conversation state
        s.user1_consented_at,
        s.user2_consented_at,
        s.active_at,
        s.decision_started_for_user_id,
        s.decision_started_at,
        s.decision_expires_at,
        s.terminal_state,
        s.terminal_at,
        s.expires_at
      FROM matches m
      INNER JOIN users u2 ON u2.id = (CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END)
      LEFT JOIN user_profiles up ON up.user_id = u2.id
      LEFT JOIN auth_users au ON au.email = u2.email
      LEFT JOIN user_presence_latest p ON p.user_id = u2.id
      LEFT JOIN match_date_plans dp ON dp.match_id = m.id
      LEFT JOIN match_conversation_states s ON s.match_id = m.id
      LEFT JOIN user_match_archives a ON a.match_id = m.id AND a.user_id = ${userId}

      LEFT JOIN LATERAL (
        SELECT from_user_id, to_user_id, section_type, section_key, comment_text, created_at
        FROM profile_likes pl
        WHERE (pl.from_user_id = m.user1_id AND pl.to_user_id = m.user2_id)
           OR (pl.from_user_id = m.user2_id AND pl.to_user_id = m.user1_id)
        ORDER BY pl.created_at DESC
        LIMIT 1
      ) pl_last ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS message_count,
          (
            SELECT cm.sender_id
            FROM chat_messages cm
            WHERE cm.match_id = m.id
              AND cm.sender_id IS NOT NULL
              AND COALESCE(cm.message_type, 'TEXT') <> ALL(${EXCLUDED_MESSAGE_TYPES})
              AND NOT (LOWER(COALESCE(cm.message_text, '')) LIKE 'start the chat with %')
              AND NOT (
                LOWER(COALESCE(cm.message_text, '')) LIKE '%start with intent%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%date credit%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%unlock%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%$30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add a $30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add $30%'
              )
            ORDER BY cm.created_at ASC
            LIMIT 1
          ) AS first_sender_id,
          (
            SELECT
              CASE
                WHEN (cm.message_type = 'AUDIO' OR cm.audio_url IS NOT NULL) THEN '🎤 Voice memo'
                WHEN cm.message_text LIKE '{"type":"date_invite"%' THEN '📅 Date invite'
                ELSE cm.message_text
              END
            FROM chat_messages cm
            WHERE cm.match_id = m.id
              AND COALESCE(cm.message_type, 'TEXT') <> ALL(${EXCLUDED_MESSAGE_TYPES})
              AND NOT (LOWER(COALESCE(cm.message_text, '')) LIKE 'start the chat with %')
              AND NOT (
                LOWER(COALESCE(cm.message_text, '')) LIKE '%start with intent%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%date credit%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%unlock%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%$30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add a $30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add $30%'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM profile_likes pl
                WHERE (
                  (pl.from_user_id = m.user1_id AND pl.to_user_id = m.user2_id)
                  OR (pl.from_user_id = m.user2_id AND pl.to_user_id = m.user1_id)
                )
                AND pl.comment_text IS NOT NULL
                AND LENGTH(TRIM(pl.comment_text)) > 0
                AND cm.sender_id = pl.from_user_id
                AND cm.message_text = pl.comment_text
              )
            ORDER BY cm.created_at DESC
            LIMIT 1
          ) AS last_message,
          (
            SELECT cm.created_at
            FROM chat_messages cm
            WHERE cm.match_id = m.id
              AND COALESCE(cm.message_type, 'TEXT') <> ALL(${EXCLUDED_MESSAGE_TYPES})
              AND NOT (LOWER(COALESCE(cm.message_text, '')) LIKE 'start the chat with %')
              AND NOT (
                LOWER(COALESCE(cm.message_text, '')) LIKE '%start with intent%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%date credit%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%unlock%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%$30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add a $30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add $30%'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM profile_likes pl
                WHERE (
                  (pl.from_user_id = m.user1_id AND pl.to_user_id = m.user2_id)
                  OR (pl.from_user_id = m.user2_id AND pl.to_user_id = m.user1_id)
                )
                AND pl.comment_text IS NOT NULL
                AND LENGTH(TRIM(pl.comment_text)) > 0
                AND cm.sender_id = pl.from_user_id
                AND cm.message_text = pl.comment_text
              )
            ORDER BY cm.created_at DESC
            LIMIT 1
          ) AS last_message_time,
          (
            SELECT COUNT(*)::int
            FROM chat_messages cm
            WHERE cm.match_id = m.id
              AND (cm.sender_id IS NULL OR cm.sender_id != ${userId})
              AND cm.is_read = false
              AND COALESCE(cm.message_type, 'TEXT') <> ALL(${EXCLUDED_MESSAGE_TYPES})
              AND NOT (LOWER(COALESCE(cm.message_text, '')) LIKE 'start the chat with %')
              AND NOT (
                LOWER(COALESCE(cm.message_text, '')) LIKE '%start with intent%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%date credit%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%unlock%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%$30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add a $30%'
                OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add $30%'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM profile_likes pl
                WHERE (
                  (pl.from_user_id = m.user1_id AND pl.to_user_id = m.user2_id)
                  OR (pl.from_user_id = m.user2_id AND pl.to_user_id = m.user1_id)
                )
                AND pl.comment_text IS NOT NULL
                AND LENGTH(TRIM(pl.comment_text)) > 0
                AND cm.sender_id = pl.from_user_id
                AND cm.message_text = pl.comment_text
              )
          ) AS unread_count
        FROM chat_messages cm0
        WHERE cm0.match_id = m.id
          AND COALESCE(cm0.message_type, 'TEXT') <> ALL(${EXCLUDED_MESSAGE_TYPES})
          AND NOT (LOWER(COALESCE(cm0.message_text, '')) LIKE 'start the chat with %')
          AND NOT (
            LOWER(COALESCE(cm0.message_text, '')) LIKE '%start with intent%'
            OR LOWER(COALESCE(cm0.message_text, '')) LIKE '%date credit%'
            OR LOWER(COALESCE(cm0.message_text, '')) LIKE '%unlock%'
            OR LOWER(COALESCE(cm0.message_text, '')) LIKE '%$30%'
            OR LOWER(COALESCE(cm0.message_text, '')) LIKE '%add a $30%'
            OR LOWER(COALESCE(cm0.message_text, '')) LIKE '%add $30%'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM profile_likes pl
            WHERE (
              (pl.from_user_id = m.user1_id AND pl.to_user_id = m.user2_id)
              OR (pl.from_user_id = m.user2_id AND pl.to_user_id = m.user1_id)
            )
            AND pl.comment_text IS NOT NULL
            AND LENGTH(TRIM(pl.comment_text)) > 0
            AND cm0.sender_id = pl.from_user_id
            AND cm0.message_text = pl.comment_text
          )
      ) msg_stats ON TRUE

      WHERE (m.user1_id = ${userId} OR m.user2_id = ${userId})
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks b
          WHERE (
            b.blocker_user_id = ${userId}
            AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END)
          )
          OR (
            b.blocker_user_id = (CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END)
            AND b.blocked_user_id = ${userId}
          )
        )
        -- Auto-dismiss: only return terminal rows briefly
        AND (
          s.terminal_state IS NULL
          OR s.terminal_at IS NULL
          OR s.terminal_at > now() - interval '5 seconds'
        )

      ORDER BY COALESCE(msg_stats.last_message_time, m.created_at) DESC
    `;

    const matches = (rows || []).map((r) => {
      const starterLike = {
        starter_from_user_id: r?.starter_from_user_id,
        starter_to_user_id: r?.starter_to_user_id,
        starter_section_type: r?.starter_section_type,
        starter_section_key: r?.starter_section_key,
        starter_comment_text: r?.starter_comment_text,
        starter_created_at: r?.starter_created_at,
      };

      const otherName = r?.display_name;

      const starterSummary = starterSummaryForViewer({
        viewerUserId: userId,
        otherName,
        likeRow: starterLike,
      });

      const safeOtherName =
        typeof otherName === "string" && otherName.trim().length > 0
          ? otherName.trim()
          : "your match";

      const messageCount = Number(r?.real_message_count || 0);

      const terminalState = r?.terminal_state ? String(r.terminal_state) : null;
      const isActive = Boolean(r?.active_at) && !terminalState;

      const isArchived = Boolean(r?.archived_at) && !terminalState;

      const chatState = terminalState
        ? "closed"
        : isArchived
          ? "archived"
          : isActive
            ? "active"
            : messageCount > 0
              ? "prechat"
              : "match";

      const firstSenderId =
        r?.first_message_sender_id != null
          ? Number(r.first_message_sender_id)
          : null;

      const prechatRole =
        chatState === "prechat" && Number.isFinite(firstSenderId)
          ? firstSenderId === Number(userId)
            ? "sender"
            : "receiver"
          : null;

      const isUser1 = Number(r?.user1_id) === Number(userId);
      const myConsented = isUser1
        ? Boolean(r?.user1_consented_at)
        : Boolean(r?.user2_consented_at);
      const otherConsented = isUser1
        ? Boolean(r?.user2_consented_at)
        : Boolean(r?.user1_consented_at);

      const decisionExpiresAtIso = toIsoOrNull(r?.decision_expires_at);
      const secondsRemaining = r?.decision_expires_at
        ? Math.max(
            0,
            Math.floor(
              (new Date(r.decision_expires_at).getTime() - Date.now()) / 1000,
            ),
          )
        : null;

      return {
        ...r,
        photos: safeJsonParse(r?.photos, []),
        unread_count: Number(r?.unread_count) || 0,
        is_online: Boolean(r?.is_online),
        is_new_match: Boolean(r?.is_new_match),
        starter_summary: starterSummary,
        start_chat_line: `start the chat with ${safeOtherName}`,
        real_message_count: messageCount,

        date_status:
          typeof r?.date_status === "string" ? r.date_status : "none",
        date_end: r?.date_end ? new Date(r.date_end).toISOString() : null,

        chat_state: chatState,
        prechat_role: prechatRole,

        my_consented: myConsented,
        other_consented: otherConsented,
        decision_expires_at: decisionExpiresAtIso,
        decision_seconds_remaining: secondsRemaining,
        terminal_state: terminalState,
        terminal_at: toIsoOrNull(r?.terminal_at),
        active_at: toIsoOrNull(r?.active_at),

        // NEW: per-user archive metadata
        archived_at: toIsoOrNull(r?.archived_at),
        archive_reason:
          typeof r?.archive_reason === "string" ? r.archive_reason : null,

        // NEW: 7-day countdown
        expires_at: toIsoOrNull(r?.expires_at),
        countdown_seconds_remaining: r?.expires_at
          ? Math.max(
              0,
              Math.floor(
                (new Date(r.expires_at).getTime() - Date.now()) / 1000,
              ),
            )
          : null,
      };
    });

    return Response.json({ matches, pendingMatchCount });
  } catch (error) {
    console.error("Error fetching matches:", error);
    return Response.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}
