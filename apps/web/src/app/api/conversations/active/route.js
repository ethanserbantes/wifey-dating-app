import sql from "@/app/api/utils/sql";

const START_CHAT_HINT_TEXT = "__START_CHAT_HINT__";

async function releasePendingMatchesForUser(userId) {
  // Pending matches are mutual likes marked as status='matched' but without a matches row.
  // We only release them when BOTH sides are not actively focused on another conversation.
  try {
    if (!Number.isFinite(Number(userId))) return [];

    const pairs = await sql`
      SELECT DISTINCT
        LEAST(pl1.from_user_id, pl1.to_user_id) AS low_id,
        GREATEST(pl1.from_user_id, pl1.to_user_id) AS high_id,
        CASE
          WHEN pl1.from_user_id = ${userId} THEN pl1.to_user_id
          ELSE pl1.from_user_id
        END AS other_user_id
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
        AND NOT EXISTS (
          SELECT 1
          FROM user_active_conversations uac
          WHERE uac.user_id = (
            CASE
              WHEN pl1.from_user_id = ${userId} THEN pl1.to_user_id
              ELSE pl1.from_user_id
            END
          )
          AND uac.active_match_id IS NOT NULL
        )
      ORDER BY low_id, high_id
      LIMIT 25
    `;

    const released = [];

    for (const p of pairs || []) {
      const low = Number(p.low_id);
      const high = Number(p.high_id);

      if (!Number.isFinite(low) || !Number.isFinite(high)) {
        continue;
      }

      const matchId = await sql.transaction(async (txn) => {
        const matchRows = await txn`
          INSERT INTO matches (user1_id, user2_id, user1_seen_at, user2_seen_at)
          VALUES (${low}, ${high}, NULL, NULL)
          ON CONFLICT (user1_id, user2_id) DO UPDATE
          SET created_at = matches.created_at
          RETURNING id
        `;

        const nextMatchId = matchRows?.[0]?.id;

        if (!Number.isFinite(Number(nextMatchId))) {
          return null;
        }

        // Ensure like rows are in matched state (no-op if already).
        await txn`
          UPDATE profile_likes
          SET status = 'matched', pending_hidden = false, matched_at = COALESCE(matched_at, NOW())
          WHERE (from_user_id = ${low} AND to_user_id = ${high})
             OR (from_user_id = ${high} AND to_user_id = ${low})
        `;

        // Ensure the one-time starter hint exists.
        const existingHint = await txn`
          SELECT 1
          FROM chat_messages
          WHERE match_id = ${nextMatchId}
            AND message_type = 'SYSTEM_HINT'
          LIMIT 1
        `;

        if (existingHint.length === 0) {
          await txn`
            INSERT INTO chat_messages (match_id, sender_id, message_text, message_type, is_read)
            VALUES
              (${nextMatchId}, ${low}, ${START_CHAT_HINT_TEXT}, 'SYSTEM_HINT', false),
              (${nextMatchId}, ${high}, ${START_CHAT_HINT_TEXT}, 'SYSTEM_HINT', false)
          `;
        }

        return Number(nextMatchId);
      });

      if (Number.isFinite(Number(matchId))) {
        released.push(matchId);
      }
    }

    return released;
  } catch (e) {
    console.error("Error releasing pending matches:", e);
    return [];
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = Number(searchParams.get("userId"));

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const rows = await sql`
      SELECT user_id, active_match_id, updated_at
      FROM user_active_conversations
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const row = rows?.[0] || null;

    return Response.json({
      active: row
        ? {
            userId: Number(row.user_id),
            activeMatchId:
              row.active_match_id != null ? Number(row.active_match_id) : null,
            updatedAt: row.updated_at
              ? new Date(row.updated_at).toISOString()
              : null,
          }
        : { userId, activeMatchId: null, updatedAt: null },
    });
  } catch (e) {
    console.error("Error getting active conversation:", e);
    return Response.json(
      { error: "Failed to get active conversation" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const userId = Number(body?.userId);
    const matchIdRaw = body?.matchId;
    const matchId = matchIdRaw == null ? null : Number(matchIdRaw);

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    if (matchId != null && !Number.isFinite(matchId)) {
      return Response.json(
        { error: "matchId must be a number or null" },
        { status: 400 },
      );
    }

    // If matchId is provided, verify the match belongs to the user.
    if (matchId != null) {
      const owns = await sql`
        SELECT 1
        FROM matches
        WHERE id = ${matchId}
          AND (user1_id = ${userId} OR user2_id = ${userId})
        LIMIT 1
      `;

      if (!owns?.length) {
        return Response.json(
          { error: "Match not found for this user" },
          { status: 404 },
        );
      }
    }

    if (matchId == null) {
      await sql`
        DELETE FROM user_active_conversations
        WHERE user_id = ${userId}
      `;

      const releasedMatchIds = await releasePendingMatchesForUser(userId);

      return Response.json({
        success: true,
        activeMatchId: null,
        releasedMatchIds,
      });
    }

    await sql`
      INSERT INTO user_active_conversations (user_id, active_match_id, updated_at)
      VALUES (${userId}, ${matchId}, now())
      ON CONFLICT (user_id) DO UPDATE
      SET active_match_id = EXCLUDED.active_match_id,
          updated_at = now()
    `;

    return Response.json({ success: true, activeMatchId: matchId });
  } catch (e) {
    console.error("Error setting active conversation:", e);
    return Response.json(
      { error: "Failed to set active conversation" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => null);
    const userId = Number(body?.userId);

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    await sql`
      DELETE FROM user_active_conversations
      WHERE user_id = ${userId}
    `;

    const releasedMatchIds = await releasePendingMatchesForUser(userId);

    return Response.json({
      success: true,
      activeMatchId: null,
      releasedMatchIds,
    });
  } catch (e) {
    console.error("Error clearing active conversation:", e);
    return Response.json(
      { error: "Failed to clear active conversation" },
      { status: 500 },
    );
  }
}
