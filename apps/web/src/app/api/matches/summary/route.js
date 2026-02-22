import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const userId = Number(userIdRaw);

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const unseenRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM matches m
      WHERE (m.user1_id = ${userId} AND m.user1_seen_at IS NULL)
         OR (m.user2_id = ${userId} AND m.user2_seen_at IS NULL)
    `;

    const unseenMatches = unseenRows?.[0]?.count || 0;

    // Keep unreadMessages consistent with the Messages list logic:
    // - include SYSTEM_HINT (drives the one-time "start chat" badge)
    // - exclude DATE_FEEDBACK + SYSTEM
    // - exclude legacy "date credit" nag rows (now removed from product)
    // NOTE: messaging is never gated by date credits anymore, so we count all unread.
    const unreadRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM chat_messages cm
      JOIN matches m ON m.id = cm.match_id
      WHERE (m.user1_id = ${userId} OR m.user2_id = ${userId})
        AND (cm.sender_id IS NULL OR cm.sender_id != ${userId})
        AND cm.is_read = false
        AND COALESCE(cm.message_type, 'TEXT') NOT IN ('DATE_FEEDBACK', 'SYSTEM', 'CHAT_CREDIT_REQUIRED')
        AND NOT (
          LOWER(COALESCE(cm.message_text, '')) LIKE '%start with intent%'
          OR LOWER(COALESCE(cm.message_text, '')) LIKE '%date credit%'
          OR LOWER(COALESCE(cm.message_text, '')) LIKE '%unlock%'
          OR LOWER(COALESCE(cm.message_text, '')) LIKE '%$30%'
          OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add a $30%'
          OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add $30%'
        )
    `;

    const unreadMessages = unreadRows?.[0]?.count || 0;

    return Response.json({ unseenMatches, unreadMessages });
  } catch (error) {
    console.error("Error fetching match summary:", error);
    return Response.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
