import sql from "@/app/api/utils/sql";
import { recordMatchDateEvent } from "@/app/api/utils/dateEvents";
import {
  spendDateCreditsForUsers,
  DATE_CREDIT_REQUIRED_CENTS,
} from "@/app/api/utils/dateCredits";

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

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const userIdNum = Number(body?.userId);

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    // Only create a date row if one doesn't already exist.
    // This keeps the existing date plan (if any) intact.
    const existing = await sql`
      SELECT match_id, date_status
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    if (
      !existing ||
      existing.length === 0 ||
      existing?.[0]?.date_status === "none"
    ) {
      // Make it eligible for the "pending feedback" prompt:
      // - date_status != 'none'
      // - date_start is at least 12h in the past
      const now = new Date();
      const dateStart = addHours(now, -13);
      const dateEnd = addHours(now, -12);

      await sql`
        INSERT INTO match_date_plans (
          match_id,
          date_status,
          date_start,
          date_end,
          activity_label,
          place_label,
          credit_amount_cents,
          credit_status,
          planner_prefs,
          updated_at
        ) VALUES (
          ${matchIdNum},
          'locked',
          ${dateStart},
          ${dateEnd},
          'We met',
          'In person',
          0,
          'pending',
          '{}'::jsonb,
          now()
        )
        ON CONFLICT (match_id)
        DO UPDATE SET
          date_status = CASE WHEN match_date_plans.date_status = 'none' THEN 'locked' ELSE match_date_plans.date_status END,
          date_start = COALESCE(match_date_plans.date_start, EXCLUDED.date_start),
          date_end = COALESCE(match_date_plans.date_end, EXCLUDED.date_end),
          activity_label = COALESCE(match_date_plans.activity_label, EXCLUDED.activity_label),
          place_label = COALESCE(match_date_plans.place_label, EXCLUDED.place_label),
          updated_at = now()
      `;
    }

    // Drop a simple system message into chat (keeps both people in sync).
    // Mark as read so it doesn't inflate unread counters.
    try {
      await sql`
        INSERT INTO chat_messages (match_id, sender_id, message_text, message_type, is_read)
        VALUES (${matchIdNum}, NULL, '✅ Marked as met', 'SYSTEM', true)
      `;
    } catch (e) {
      console.error("Could not insert we-met system message", e);
    }

    recordMatchDateEvent({
      matchId: matchIdNum,
      actorUserId: userIdNum,
      eventType: "DATE_COMPLETED",
      occurredAt: new Date().toISOString(),
      meta: { source: "we_met" },
    });

    // NEW: move this thread to Hidden/Archived for the person who marked "We met".
    try {
      await sql`
        INSERT INTO user_match_archives (match_id, user_id, reason)
        VALUES (${matchIdNum}, ${userIdNum}, 'we_met')
        ON CONFLICT (match_id, user_id)
        DO UPDATE SET
          archived_at = now(),
          reason = EXCLUDED.reason
      `;
    } catch (e) {
      console.error("Could not archive match after we-met", e);
    }

    // NEW: spending rule — marking "we met" consumes the date credit for BOTH users.
    try {
      await sql`
        UPDATE match_date_plans
        SET credit_status = 'spent', updated_at = now()
        WHERE match_id = ${matchIdNum}
          AND credit_status IS DISTINCT FROM 'spent'
      `;

      const matchRows = await sql`
        SELECT user1_id, user2_id
        FROM matches
        WHERE id = ${matchIdNum}
        LIMIT 1
      `;

      const m = matchRows?.[0] || null;
      const userIds = [Number(m?.user1_id), Number(m?.user2_id)].filter((n) =>
        Number.isFinite(n),
      );

      await spendDateCreditsForUsers({
        userIds,
        matchId: matchIdNum,
        reason: "we_met",
        meta: { source: "we_met", requiredCents: DATE_CREDIT_REQUIRED_CENTS },
      });
    } catch (e) {
      console.error("Could not spend date credit on we-met", e);
    }

    return Response.json({ success: true, archived: true });
  } catch (error) {
    console.error("Error marking we met:", error);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
