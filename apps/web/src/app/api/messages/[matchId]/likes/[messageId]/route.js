import sql from "@/app/api/utils/sql";

async function ensureAccess({ matchIdNum, userIdNum }) {
  const access = await sql`
    SELECT
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

  return access?.[0] || null;
}

async function ensureMessageInMatch({ matchIdNum, messageIdNum }) {
  const rows = await sql`
    SELECT id
    FROM chat_messages
    WHERE id = ${messageIdNum}
      AND match_id = ${matchIdNum}
    LIMIT 1
  `;

  return rows?.[0] || null;
}

async function getLikeState({ messageIdNum, userIdNum }) {
  const rows = await sql`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM chat_message_reactions r
        WHERE r.message_id = ${messageIdNum}
          AND r.reaction_type = 'LIKE'
      ) AS like_count,
      EXISTS (
        SELECT 1
        FROM chat_message_reactions r
        WHERE r.message_id = ${messageIdNum}
          AND r.user_id = ${userIdNum}
          AND r.reaction_type = 'LIKE'
      ) AS liked_by_me
  `;

  const row = rows?.[0] || {};
  return {
    like_count: Number(row.like_count || 0),
    liked_by_me: Boolean(row.liked_by_me),
  };
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    const messageIdNum = Number(params?.messageId);

    const body = await request.json().catch(() => ({}));
    const userIdNum = Number(body?.userId);

    if (
      !Number.isFinite(matchIdNum) ||
      !Number.isFinite(messageIdNum) ||
      !Number.isFinite(userIdNum)
    ) {
      return Response.json(
        { error: "matchId, messageId, and userId are required" },
        { status: 400 },
      );
    }

    const access = await ensureAccess({ matchIdNum, userIdNum });
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const msg = await ensureMessageInMatch({ matchIdNum, messageIdNum });
    if (!msg) {
      return Response.json({ error: "Message not found" }, { status: 404 });
    }

    await sql`
      INSERT INTO chat_message_reactions (message_id, user_id, reaction_type)
      VALUES (${messageIdNum}, ${userIdNum}, 'LIKE')
      ON CONFLICT (message_id, user_id, reaction_type)
      DO NOTHING
    `;

    const state = await getLikeState({ messageIdNum, userIdNum });
    return Response.json({ ok: true, ...state });
  } catch (e) {
    console.error("POST /api/messages/[matchId]/likes/[messageId] error", e);
    return Response.json({ error: "Failed to like message" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    const messageIdNum = Number(params?.messageId);

    const body = await request.json().catch(() => ({}));
    const userIdNum = Number(body?.userId);

    if (
      !Number.isFinite(matchIdNum) ||
      !Number.isFinite(messageIdNum) ||
      !Number.isFinite(userIdNum)
    ) {
      return Response.json(
        { error: "matchId, messageId, and userId are required" },
        { status: 400 },
      );
    }

    const access = await ensureAccess({ matchIdNum, userIdNum });
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const msg = await ensureMessageInMatch({ matchIdNum, messageIdNum });
    if (!msg) {
      return Response.json({ error: "Message not found" }, { status: 404 });
    }

    await sql`
      DELETE FROM chat_message_reactions
      WHERE message_id = ${messageIdNum}
        AND user_id = ${userIdNum}
        AND reaction_type = 'LIKE'
    `;

    const state = await getLikeState({ messageIdNum, userIdNum });
    return Response.json({ ok: true, ...state });
  } catch (e) {
    console.error("DELETE /api/messages/[matchId]/likes/[messageId] error", e);
    return Response.json(
      { error: "Failed to unlike message" },
      { status: 500 },
    );
  }
}
