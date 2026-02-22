import sql from "@/app/api/utils/sql";

async function assertMatchNotBlocked(matchIdNum, userIdNum) {
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
        WHERE (
          b.blocker_user_id = ${userIdNum}
          AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END)
        )
        OR (
          b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END)
          AND b.blocked_user_id = ${userIdNum}
        )
      )
    LIMIT 1
  `;

  return rows?.[0] || null;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdNum = Number(searchParams.get("userId"));

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    // Find recent dates where we should ask for feedback.
    // Rule of thumb:
    // - wait 12h after date_start ("next day" feel)
    // - stop asking after 7 days
    // - don't ask if the user already submitted feedback for that match
    const rows = await sql`
      SELECT
        mdp.match_id,
        mdp.date_start,
        mdp.date_end,
        CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END AS other_user_id,
        COALESCE(NULLIF(up.display_name, ''), u2.email) AS other_display_name
      FROM match_date_plans mdp
      JOIN matches m ON m.id = mdp.match_id
      JOIN users u2 ON u2.id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END)
      LEFT JOIN user_profiles up ON up.user_id = u2.id
      WHERE (m.user1_id = ${userIdNum} OR m.user2_id = ${userIdNum})
        AND mdp.date_status != 'none'
        AND mdp.date_start IS NOT NULL
        AND now() >= (mdp.date_start + interval '12 hours')
        AND now() <= (mdp.date_start + interval '7 days')
        AND NOT EXISTS (
          SELECT 1
          FROM chat_messages cm
          WHERE cm.match_id = mdp.match_id
            AND cm.sender_id = ${userIdNum}
            AND cm.message_type = 'DATE_FEEDBACK'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks b
          WHERE (
            b.blocker_user_id = ${userIdNum}
            AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END)
          )
          OR (
            b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END)
            AND b.blocked_user_id = ${userIdNum}
          )
        )
      ORDER BY mdp.date_start DESC
      LIMIT 5
    `;

    const pending = (rows || []).map((r) => ({
      matchId: Number(r.match_id),
      dateStart: toIsoOrNull(r.date_start),
      dateEnd: toIsoOrNull(r.date_end),
      otherUser: {
        id: Number(r.other_user_id),
        displayName: String(r.other_display_name || ""),
      },
    }));

    // Extra safety: filter out anything the user can't access (blocked/unmatched edge cases)
    const safePending = [];
    for (const item of pending) {
      const access = await assertMatchNotBlocked(
        Number(item.matchId),
        userIdNum,
      );
      if (access) {
        safePending.push(item);
      }
    }

    return Response.json({ pending: safePending });
  } catch (error) {
    console.error("[DATE_FEEDBACK_PENDING] Error:", error);
    return Response.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
