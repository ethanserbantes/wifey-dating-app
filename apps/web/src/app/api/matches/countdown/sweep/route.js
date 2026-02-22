import sql from "@/app/api/utils/sql";
import { sendCountdownPushNotification } from "@/app/api/utils/pushNotifications";

/**
 * Server-side sweep endpoint — designed to be called every 15 minutes by an external cron/scheduler.
 * GET /api/matches/countdown/sweep
 *
 * 1. Expires active chats that have passed their 7-day countdown without a scheduled date.
 * 2. Sends push notifications at key milestones (48h, day 5, day 7 morning, 2h before).
 */
export async function GET() {
  const results = { expired: 0, pushes: 0, errors: [] };

  try {
    // ── 1. Expire matches whose countdown has elapsed ──
    const expired = await sql`
      UPDATE match_conversation_states s
      SET terminal_state = 'expired',
          terminal_at = now(),
          updated_at = now()
      WHERE s.terminal_state IS NULL
        AND s.active_at IS NOT NULL
        AND s.expires_at IS NOT NULL
        AND s.expires_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM match_date_plans dp
          WHERE dp.match_id = s.match_id
            AND dp.date_status IN ('proposed', 'locked', 'ready', 'unlocked')
        )
      RETURNING s.match_id, s.user1_id, s.user2_id
    `;

    results.expired = expired?.length || 0;

    // Send expiration push to both users
    for (const row of expired || []) {
      const matchId = Number(row.match_id);
      const userIds = [Number(row.user1_id), Number(row.user2_id)].filter((n) =>
        Number.isFinite(n),
      );
      for (const uid of userIds) {
        try {
          await sendCountdownPushNotification({
            toUserId: uid,
            matchId,
            title: "Match expired",
            body: "Your 7-day window to schedule a date has ended.",
            pushType: "expired",
          });
        } catch (e) {
          console.error("[sweep] expiration push failed", e);
        }
      }
    }

    // ── 2. Send milestone push notifications ──
    const candidates = await sql`
      SELECT
        s.match_id,
        s.user1_id,
        s.user2_id,
        s.expires_at,
        EXTRACT(EPOCH FROM (s.expires_at - now())) AS seconds_remaining
      FROM match_conversation_states s
      WHERE s.terminal_state IS NULL
        AND s.active_at IS NOT NULL
        AND s.expires_at IS NOT NULL
        AND s.expires_at > now()
        AND NOT EXISTS (
          SELECT 1 FROM match_date_plans dp
          WHERE dp.match_id = s.match_id
            AND dp.date_status IN ('proposed', 'locked', 'ready', 'unlocked')
        )
    `;

    for (const c of candidates || []) {
      const matchId = Number(c.match_id);
      const secRemaining = Number(c.seconds_remaining);
      const userIds = [Number(c.user1_id), Number(c.user2_id)].filter((n) =>
        Number.isFinite(n),
      );

      const hoursRemaining = secRemaining / 3600;
      const daysRemaining = Math.ceil(hoursRemaining / 24);

      const milestones = [];

      // 2h before expiration
      if (hoursRemaining <= 2) {
        milestones.push({
          type: "2h_before",
          title: "Match expiring soon",
          body: "Less than 2 hours left — schedule a date now or this match disappears.",
        });
      }
      // Day 7 morning (< 24h remaining)
      else if (hoursRemaining <= 24) {
        milestones.push({
          type: "day7_morning",
          title: "Last day!",
          body: "This match expires today. Schedule a date to keep the conversation going.",
        });
      }
      // Day 5 (< 48h remaining)
      else if (hoursRemaining <= 48) {
        milestones.push({
          type: "day5",
          title: "⏰ 2 days left",
          body: `Only ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining — schedule your date now!`,
        });
      }
      // 48h mark (around 5 days elapsed = ~48-72h remaining)
      else if (hoursRemaining <= 72) {
        milestones.push({
          type: "48h",
          title: "Time is ticking",
          body: `${daysRemaining} days left to schedule a date before this match expires.`,
        });
      }

      for (const milestone of milestones) {
        const alreadySent = await sql`
          SELECT 1 FROM match_countdown_pushes
          WHERE match_id = ${matchId} AND push_type = ${milestone.type}
          LIMIT 1
        `;

        if (alreadySent?.length > 0) {
          continue;
        }

        try {
          await sql`
            INSERT INTO match_countdown_pushes (match_id, push_type)
            VALUES (${matchId}, ${milestone.type})
            ON CONFLICT (match_id, push_type) DO NOTHING
          `;

          for (const uid of userIds) {
            await sendCountdownPushNotification({
              toUserId: uid,
              matchId,
              title: milestone.title,
              body: milestone.body,
              pushType: milestone.type,
            });
            results.pushes++;
          }
        } catch (e) {
          console.error("[sweep] push " + milestone.type + " failed", e);
          results.errors.push(matchId + ":" + milestone.type);
        }
      }
    }

    return Response.json({ ok: true, ...results });
  } catch (e) {
    console.error("[countdown/sweep] fatal error", e);
    return Response.json(
      { error: "Sweep failed", detail: e?.message },
      { status: 500 },
    );
  }
}
