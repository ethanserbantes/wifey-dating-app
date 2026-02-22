import sql from "@/app/api/utils/sql";

export async function GET(request, { params }) {
  try {
    const matchId = Number(params.matchId);
    if (!Number.isFinite(matchId)) {
      return Response.json({ error: "Invalid match id" }, { status: 400 });
    }

    const [match] = await sql`
      SELECT id, user1_id, user2_id, created_at
      FROM matches
      WHERE id = ${matchId}
      LIMIT 1
    `;

    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const participants = await sql`
      SELECT u.id, u.email, up.display_name
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id IN (${match.user1_id}, ${match.user2_id})
    `;

    const messages = await sql`
      SELECT
        cm.id,
        cm.sender_id,
        cm.message_text,
        cm.message_type,
        cm.audio_url,
        cm.audio_duration_ms,
        cm.is_read,
        cm.created_at,
        u.email AS sender_email,
        up.display_name AS sender_display_name
      FROM chat_messages cm
      LEFT JOIN users u ON u.id = cm.sender_id
      LEFT JOIN user_profiles up ON up.user_id = cm.sender_id
      WHERE cm.match_id = ${matchId}
      ORDER BY cm.created_at ASC
      LIMIT 500
    `;

    return Response.json({ match, participants, messages });
  } catch (error) {
    console.error("Error fetching admin match messages:", error);
    return Response.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

export async function POST(request, { params }) {
  try {
    const matchId = Number(params.matchId);
    if (!Number.isFinite(matchId)) {
      return Response.json({ error: "Invalid match id" }, { status: 400 });
    }

    const body = await request.json();
    const senderId = Number(body?.senderId);
    const messageText = String(body?.messageText || "").trim();

    if (!Number.isFinite(senderId)) {
      return Response.json({ error: "senderId required" }, { status: 400 });
    }

    if (!messageText) {
      return Response.json({ error: "messageText required" }, { status: 400 });
    }

    const [match] = await sql`
      SELECT id, user1_id, user2_id
      FROM matches
      WHERE id = ${matchId}
      LIMIT 1
    `;

    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const isParticipant =
      senderId === match.user1_id || senderId === match.user2_id;
    if (!isParticipant) {
      return Response.json(
        { error: "Sender is not a participant in this match" },
        { status: 400 },
      );
    }

    const rows = await sql`
      INSERT INTO chat_messages (match_id, sender_id, message_text, message_type, is_read, created_at)
      VALUES (${matchId}, ${senderId}, ${messageText}, 'TEXT', false, now())
      RETURNING id, sender_id, message_text, message_type, audio_url, audio_duration_ms, is_read, created_at
    `;

    const inserted = rows[0];

    return Response.json({ ok: true, message: inserted });
  } catch (error) {
    console.error("Error posting admin match message:", error);
    return Response.json({ error: "Failed to post message" }, { status: 500 });
  }
}
