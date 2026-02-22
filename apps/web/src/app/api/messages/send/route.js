import sql from "@/app/api/utils/sql";
import { sendMessagePushNotification } from "@/app/api/utils/pushNotifications";
import {
  DATE_CREDIT_REQUIRED_CENTS,
  getWalletBalanceCents,
} from "@/app/api/utils/dateCredits";

const EXCLUDED_MESSAGE_TYPES = [
  "DATE_FEEDBACK",
  "SYSTEM",
  "SYSTEM_HINT",
  "CHAT_CREDIT_REQUIRED",
];

async function isFakeUser(userId) {
  const rows = await sql`
    SELECT COALESCE(screening_state_json->>'is_fake','false') = 'true' AS is_fake
    FROM users
    WHERE id = ${Number(userId)}
    LIMIT 1
  `;
  return Boolean(rows?.[0]?.is_fake);
}

async function ensureConversationState(matchIdNum, user1Id, user2Id) {
  // This row drives the Match -> Pre-Chat -> Active Chat state machine.
  await sql`
    INSERT INTO match_conversation_states (match_id, user1_id, user2_id)
    VALUES (${matchIdNum}, ${Number(user1Id)}, ${Number(user2Id)})
    ON CONFLICT (match_id)
    DO UPDATE SET
      updated_at = now(),
      user1_id = EXCLUDED.user1_id,
      user2_id = EXCLUDED.user2_id
  `;
}

async function getConversationState(matchIdNum) {
  const rows = await sql`
    SELECT active_at, terminal_state
    FROM match_conversation_states
    WHERE match_id = ${matchIdNum}
    LIMIT 1
  `;

  return rows?.[0] || null;
}

export async function POST(request) {
  try {
    const {
      matchId,
      senderId,
      messageText,
      audioUrl,
      audioDurationMs,
      repliedToMessageId, // NEW
    } = await request.json();

    const matchIdNum = Number(matchId);
    const senderIdNum = Number(senderId);

    const messageTextStr = String(messageText || "").trim();
    const audioUrlStr = String(audioUrl || "").trim();
    const durationMsNum =
      audioDurationMs == null ? null : Number(audioDurationMs);

    const repliedToIdNum =
      repliedToMessageId == null || repliedToMessageId === ""
        ? null
        : Number(repliedToMessageId);

    const hasText = Boolean(messageTextStr);
    const hasAudio = Boolean(audioUrlStr);

    if (!Number.isFinite(matchIdNum) || !Number.isFinite(senderIdNum)) {
      return Response.json({ error: "All fields required" }, { status: 400 });
    }

    if (!hasText && !hasAudio) {
      return Response.json(
        { error: "messageText or audioUrl required" },
        { status: 400 },
      );
    }

    // NEW: validate reply target (must be in the same match)
    let replyPreview = null;
    if (repliedToIdNum != null) {
      if (!Number.isFinite(repliedToIdNum)) {
        return Response.json(
          { error: "repliedToMessageId must be a number" },
          { status: 400 },
        );
      }

      const parentRows = await sql`
        SELECT id, match_id, sender_id, message_text, message_type, audio_url, audio_duration_ms
        FROM chat_messages
        WHERE id = ${repliedToIdNum}
        LIMIT 1
      `;

      const parent = parentRows?.[0] || null;
      if (!parent || Number(parent.match_id) !== matchIdNum) {
        return Response.json(
          { error: "Reply target not found in this chat" },
          { status: 404 },
        );
      }

      replyPreview = parent;
    }

    // Validate sender is part of this match and not blocked.
    const access = await sql`
      SELECT
        m.user1_id,
        m.user2_id,
        CASE WHEN m.user1_id = ${senderIdNum} THEN m.user2_id ELSE m.user1_id END AS other_user_id
      FROM matches m
      WHERE m.id = ${matchIdNum}
        AND (${senderIdNum} = m.user1_id OR ${senderIdNum} = m.user2_id)
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks b
          WHERE (b.blocker_user_id = ${senderIdNum} AND b.blocked_user_id = (CASE WHEN m.user1_id = ${senderIdNum} THEN m.user2_id ELSE m.user1_id END))
             OR (b.blocker_user_id = (CASE WHEN m.user1_id = ${senderIdNum} THEN m.user2_id ELSE m.user1_id END) AND b.blocked_user_id = ${senderIdNum})
        )
      LIMIT 1
    `;

    if (access.length === 0) {
      return Response.json(
        { error: "Match not found (or you don't have access)" },
        { status: 404 },
      );
    }

    const otherUserId = Number(access?.[0]?.other_user_id);

    // Ensure the conversation state row exists. This is what moves a Match into a Pre-Chat once messages exist.
    await ensureConversationState(
      matchIdNum,
      access?.[0]?.user1_id,
      access?.[0]?.user2_id,
    );

    // NEW: Only require a date credit once the chat is an *active* chat.
    // Matches + pre-chats should be viewable and messageable without credits.
    const state = await getConversationState(matchIdNum);
    if (state?.terminal_state) {
      return Response.json(
        {
          error: "This match is no longer available",
          code: "NO_LONGER_AVAILABLE",
        },
        { status: 410 },
      );
    }

    const isActive = Boolean(state?.active_at) && !state?.terminal_state;
    if (isActive) {
      const balanceCents = await getWalletBalanceCents(senderIdNum);
      if (Number(balanceCents) < DATE_CREDIT_REQUIRED_CENTS) {
        return Response.json(
          {
            error: "Date credit required to message in an active chat",
            code: "DATE_CREDIT_REQUIRED",
            requiredCents: DATE_CREDIT_REQUIRED_CENTS,
          },
          { status: 402 },
        );
      }
    }

    // NEW: if the recipient had this match in Hidden/Archived, unhide it when a new message arrives.
    try {
      if (Number.isFinite(otherUserId) && otherUserId !== senderIdNum) {
        await sql`
          DELETE FROM user_match_archives
          WHERE match_id = ${matchIdNum}
            AND user_id = ${otherUserId}
        `;
      }
    } catch (e) {
      console.error("Could not unarchive match for recipient", e);
    }

    const messageType = hasAudio ? "AUDIO" : "TEXT";

    // Keep message_text non-empty for backwards-compatible UIs.
    const finalText = hasAudio ? "🎤 Voice memo" : messageTextStr;

    // Insert message
    const result = await sql`
      INSERT INTO chat_messages (
        match_id,
        sender_id,
        message_text,
        message_type,
        audio_url,
        audio_duration_ms,
        replied_to_message_id
      )
      VALUES (
        ${matchIdNum},
        ${senderIdNum},
        ${finalText},
        ${messageType},
        ${hasAudio ? audioUrlStr : null},
        ${Number.isFinite(durationMsNum) ? Math.max(0, Math.round(durationMsNum)) : null},
        ${repliedToIdNum}
      )
      RETURNING id, sender_id, message_text, message_type, audio_url, audio_duration_ms, replied_to_message_id, is_read, created_at
    `;

    const row = result[0];

    const message = {
      ...row,
      like_count: 0,
      liked_by_me: false,
      reply_sender_id: replyPreview?.sender_id ?? null,
      reply_message_text: replyPreview?.message_text ?? null,
      reply_message_type: replyPreview?.message_type ?? null,
      reply_audio_url: replyPreview?.audio_url ?? null,
      reply_audio_duration_ms: replyPreview?.audio_duration_ms ?? null,
    };

    // Best-effort: send push to the other participant
    try {
      const senderIsFake = await isFakeUser(senderIdNum);
      const otherIsFake = Number.isFinite(otherUserId)
        ? await isFakeUser(otherUserId)
        : false;

      if (Number.isFinite(otherUserId) && otherUserId !== senderIdNum) {
        const pushPreview = hasAudio ? "🎤 Voice memo" : messageTextStr;

        // Keep pushes turned on for real users; fake profiles are a QA tool.
        if (!senderIsFake || otherIsFake) {
          await sendMessagePushNotification({
            toUserId: otherUserId,
            fromUserId: senderIdNum,
            matchId: matchIdNum,
            messageText: pushPreview,
          });
        }
      }
    } catch (e) {
      console.error("Could not send message push:", e);
    }

    return Response.json({ message });
  } catch (error) {
    console.error("Error sending message:", error);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}
