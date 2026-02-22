import sql from "@/app/api/utils/sql";

const EXCLUDED_MESSAGE_TYPES = [
  "DATE_FEEDBACK",
  "SYSTEM",
  "SYSTEM_HINT",
  "CHAT_CREDIT_REQUIRED",
];

async function ensureConversationState(matchIdNum, user1Id, user2Id) {
  await sql`
    INSERT INTO match_conversation_states (match_id, user1_id, user2_id)
    VALUES (${matchIdNum}, ${Number(user1Id)}, ${Number(user2Id)})
    ON CONFLICT (match_id)
    DO UPDATE SET
      updated_at = now(),
      user1_id = EXCLUDED.user1_id,
      user2_id = EXCLUDED.user2_id
  `;

  const rows = await sql`
    SELECT *
    FROM match_conversation_states
    WHERE match_id = ${matchIdNum}
    LIMIT 1
  `;

  return rows?.[0] || null;
}

async function maybeStartDecisionTimer({ matchIdNum, userIdNum, state }) {
  // 24-hour decision timer starts when the receiver first sees the Pre-Chat.
  // Primary trigger is the Messages list (prechat-seen). This is a fallback
  // so if the receiver lands directly in the thread (push notification),
  // the timer still starts.
  // "Receiver" = the user who is NOT the sender of the first real message.
  if (!state) return;
  if (state.terminal_state) return;
  if (state.active_at) return;

  // Already started
  if (state.decision_started_at || state.decision_expires_at) {
    return;
  }

  const firstRows = await sql`
    SELECT sender_id
    FROM chat_messages
    WHERE match_id = ${matchIdNum}
      AND sender_id IS NOT NULL
      AND COALESCE(message_type, 'TEXT') <> ALL(${EXCLUDED_MESSAGE_TYPES})
      AND NOT (LOWER(COALESCE(message_text, '')) LIKE 'start the chat with %')
      AND NOT (
        LOWER(COALESCE(message_text, '')) LIKE '%start with intent%'
        OR LOWER(COALESCE(message_text, '')) LIKE '%date credit%'
        OR LOWER(COALESCE(message_text, '')) LIKE '%unlock%'
        OR LOWER(COALESCE(message_text, '')) LIKE '%$30%'
        OR LOWER(COALESCE(message_text, '')) LIKE '%add a $30%'
        OR LOWER(COALESCE(message_text, '')) LIKE '%add $30%'
      )
    ORDER BY created_at ASC
    LIMIT 1
  `;

  const firstSender = Number(firstRows?.[0]?.sender_id);
  if (!Number.isFinite(firstSender)) return;

  // Only start timer when the receiver opens.
  if (firstSender === Number(userIdNum)) return;

  await sql`
    UPDATE match_conversation_states
    SET decision_started_for_user_id = ${Number(userIdNum)},
        decision_started_at = now(),
        decision_expires_at = now() + interval '24 hours',
        updated_at = now()
    WHERE match_id = ${matchIdNum}
      AND active_at IS NULL
      AND terminal_state IS NULL
      AND decision_started_at IS NULL
  `;
}

export async function GET(request, { params }) {
  try {
    const { matchId } = params;
    const matchIdNum = Number(matchId);
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const userIdNum = Number(userIdRaw);

    if (!Number.isFinite(matchIdNum) || !Number.isFinite(userIdNum)) {
      return Response.json(
        { error: "Match ID and User ID required" },
        { status: 400 },
      );
    }

    // Ensure the requester is part of this match and not blocked.
    const accessRows = await sql`
      SELECT
        m.id,
        m.user1_id,
        m.user2_id,
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
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const access = accessRows[0];

    // Ensure state row exists (needed for Pre-Chat timers + Active Chat consent).
    let state = await ensureConversationState(
      matchIdNum,
      access.user1_id,
      access.user2_id,
    );

    // If this pre-chat expired, block opening with a neutral terminal state.
    if (
      state?.decision_expires_at &&
      !state?.active_at &&
      !state?.terminal_state &&
      new Date(state.decision_expires_at).getTime() <= Date.now()
    ) {
      await sql`
        UPDATE match_conversation_states
        SET terminal_state = 'expired',
            terminal_at = now(),
            updated_at = now()
        WHERE match_id = ${matchIdNum}
          AND terminal_state IS NULL
          AND active_at IS NULL
      `;

      return Response.json(
        { error: "This match is no longer available." },
        { status: 410 },
      );
    }

    // Start the 24h timer only when the receiver opens.
    await maybeStartDecisionTimer({ matchIdNum, userIdNum, state });

    // Refresh state after timer update (best-effort)
    try {
      const rows = await sql`
        SELECT *
        FROM match_conversation_states
        WHERE match_id = ${matchIdNum}
        LIMIT 1
      `;
      state = rows?.[0] || state;
    } catch (e) {
      console.error(e);
    }

    // Clear the one-time hint rows
    await sql`
      UPDATE chat_messages
      SET is_read = true
      WHERE match_id = ${matchIdNum}
        AND message_type = 'SYSTEM_HINT'
        AND (sender_id IS NULL OR sender_id != ${userIdNum})
        AND is_read = false
    `;

    // Also clear any legacy credit-nag rows so they can never keep badges “stuck”
    await sql`
      UPDATE chat_messages
      SET is_read = true
      WHERE match_id = ${matchIdNum}
        AND is_read = false
        AND (
          LOWER(COALESCE(message_text, '')) LIKE '%start with intent%'
          OR LOWER(COALESCE(message_text, '')) LIKE '%date credit%'
          OR LOWER(COALESCE(message_text, '')) LIKE '%unlock%'
          OR LOWER(COALESCE(message_text, '')) LIKE '%$30%'
          OR LOWER(COALESCE(message_text, '')) LIKE '%add a $30%'
          OR LOWER(COALESCE(message_text, '')) LIKE '%add $30%'
        )
    `;

    // Messages are always visible in both Matches + Pre-Chats.
    const messages = await sql`
      SELECT 
        cm.id,
        cm.sender_id,
        cm.message_text,
        cm.message_type,
        cm.audio_url,
        cm.audio_duration_ms,
        cm.replied_to_message_id,
        parent.sender_id AS reply_sender_id,
        parent.message_text AS reply_message_text,
        parent.message_type AS reply_message_type,
        parent.audio_url AS reply_audio_url,
        parent.audio_duration_ms AS reply_audio_duration_ms,
        (
          SELECT COUNT(*)::int
          FROM chat_message_reactions r
          WHERE r.message_id = cm.id
            AND r.reaction_type = 'LIKE'
        ) AS like_count,
        EXISTS (
          SELECT 1
          FROM chat_message_reactions r
          WHERE r.message_id = cm.id
            AND r.user_id = ${userIdNum}
            AND r.reaction_type = 'LIKE'
        ) AS liked_by_me,
        cm.is_read,
        cm.created_at
      FROM chat_messages cm
      LEFT JOIN chat_messages parent ON parent.id = cm.replied_to_message_id
      WHERE cm.match_id = ${matchIdNum}
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
            (pl.from_user_id = ${access.user1_id} AND pl.to_user_id = ${access.user2_id})
            OR (pl.from_user_id = ${access.user2_id} AND pl.to_user_id = ${access.user1_id})
          )
          AND pl.comment_text IS NOT NULL
          AND LENGTH(TRIM(pl.comment_text)) > 0
          AND cm.sender_id = pl.from_user_id
          AND cm.message_text = pl.comment_text
        )
      ORDER BY cm.created_at ASC
    `;

    // Mark visible messages as read
    await sql`
      UPDATE chat_messages cm
      SET is_read = true
      WHERE cm.match_id = ${matchIdNum}
        AND (cm.sender_id IS NULL OR cm.sender_id != ${userIdNum})
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
            (pl.from_user_id = ${access.user1_id} AND pl.to_user_id = ${access.user2_id})
            OR (pl.from_user_id = ${access.user2_id} AND pl.to_user_id = ${access.user1_id})
          )
          AND pl.comment_text IS NOT NULL
          AND LENGTH(TRIM(pl.comment_text)) > 0
          AND cm.sender_id = pl.from_user_id
          AND cm.message_text = pl.comment_text
        )
    `;

    return Response.json({ messages, conversationState: state || null });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return Response.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}
