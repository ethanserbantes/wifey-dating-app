import sql from "@/app/api/utils/sql";

const EXCLUDED_MESSAGE_TYPES = [
  "DATE_FEEDBACK",
  "SYSTEM",
  "SYSTEM_HINT",
  "CHAT_CREDIT_REQUIRED",
];

async function assertMatchAccess(matchIdNum, userIdNum) {
  const rows = await sql`
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

  return rows?.[0] || null;
}

async function ensureStateRow(matchIdNum, user1Id, user2Id) {
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

async function getFirstRealSenderId(matchIdNum) {
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
  return Number.isFinite(firstSender) ? firstSender : null;
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    const body = await request.json().catch(() => ({}));
    const userIdNum = Number(body?.userId);

    if (!Number.isFinite(matchIdNum) || !Number.isFinite(userIdNum)) {
      return Response.json(
        { error: "Match ID and User ID required" },
        { status: 400 },
      );
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    let state = await ensureStateRow(
      matchIdNum,
      access.user1_id,
      access.user2_id,
    );

    // If already closed/active, no-op.
    if (state?.terminal_state || state?.active_at) {
      return Response.json({ started: false });
    }

    // Already started.
    if (state?.decision_started_at || state?.decision_expires_at) {
      return Response.json({ started: false });
    }

    const firstSenderId = await getFirstRealSenderId(matchIdNum);

    // If there are no messages, it isn't a pre-chat.
    if (!Number.isFinite(firstSenderId)) {
      return Response.json({ started: false });
    }

    // Only the receiver starts the decision timer.
    if (Number(firstSenderId) === Number(userIdNum)) {
      return Response.json({ started: false });
    }

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

    // Reload (best-effort)
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

    return Response.json({ started: true });
  } catch (e) {
    console.error("POST /api/conversations/prechat-seen/[matchId] error", e);
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}
