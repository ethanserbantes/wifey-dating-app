import sql from "@/app/api/utils/sql";

export async function GET(request, { params }) {
  try {
    const userId = Number(params.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    const rows = await sql(
      `SELECT
        m.id AS match_id,
        m.user1_id,
        m.user2_id,
        m.created_at,
        u_other.id AS other_user_id,
        u_other.email AS other_email,
        up_other.display_name AS other_display_name,
        up_other.photos AS other_photos,
        (
          SELECT cm.message_text
          FROM chat_messages cm
          WHERE cm.match_id = m.id
          ORDER BY cm.created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT cm.created_at
          FROM chat_messages cm
          WHERE cm.match_id = m.id
          ORDER BY cm.created_at DESC
          LIMIT 1
        ) AS last_message_at
      FROM matches m
      JOIN users u_other
        ON u_other.id = CASE
          WHEN m.user1_id = $1 THEN m.user2_id
          ELSE m.user1_id
        END
      LEFT JOIN user_profiles up_other
        ON up_other.user_id = u_other.id
      WHERE (m.user1_id = $1 OR m.user2_id = $1)
      ORDER BY COALESCE(
        (
          SELECT cm.created_at
          FROM chat_messages cm
          WHERE cm.match_id = m.id
          ORDER BY cm.created_at DESC
          LIMIT 1
        ),
        m.created_at
      ) DESC
      LIMIT 50`,
      [userId],
    );

    const matches = rows.map((r) => {
      let otherPhotoUrl = null;
      const photos = r.other_photos;
      if (Array.isArray(photos) && photos.length > 0) {
        const first = photos[0];
        otherPhotoUrl = typeof first === "string" ? first : first?.url || null;
      }

      return {
        matchId: r.match_id,
        createdAt: r.created_at,
        user1Id: r.user1_id,
        user2Id: r.user2_id,
        otherUser: {
          id: r.other_user_id,
          email: r.other_email,
          displayName: r.other_display_name,
          photoUrl: otherPhotoUrl,
        },
        lastMessage: r.last_message,
        lastMessageAt: r.last_message_at,
      };
    });

    return Response.json({ matches });
  } catch (error) {
    console.error("Error fetching admin user chats:", error);
    return Response.json({ error: "Failed to fetch chats" }, { status: 500 });
  }
}
