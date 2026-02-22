import sql from "@/app/api/utils/sql";
import { sendAnnouncementPushNotification } from "@/app/api/utils/pushNotifications";

export async function notifyWaitlistForCandidate({ candidateUserId }) {
  try {
    const cid = Number(candidateUserId);
    if (!Number.isFinite(cid)) {
      return { ok: false, error: "Invalid candidateUserId" };
    }

    const candidateRows = await sql`
      SELECT u.status, up.is_visible, up.lat, up.lng
      FROM users u
      INNER JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = ${cid}
      LIMIT 1
    `;

    const candidate = candidateRows?.[0];
    const lat = candidate?.lat;
    const lng = candidate?.lng;
    const isVisible = candidate?.is_visible === true;
    const isApproved = String(candidate?.status || "") === "APPROVED";

    if (!isApproved || !isVisible) {
      return { ok: true, skipped: true, reason: "candidate_not_available" };
    }

    // ✅ Early-stage friendly behavior:
    // We DO NOT require candidate coords. Lots of approved users (and especially fake profiles)
    // may not have lat/lng yet, but they can still show up in the feed.
    const candidateHasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    // Find up to 50 nearby waitlisted users who haven't already interacted with this candidate.
    // If a waiter has no coords yet (common early on), still notify them (fallback behavior)
    // so the app can bring people back even when location isn't set.
    // Use a clamped acos to avoid NaNs.
    const waiters = candidateHasCoords
      ? await sql`
          SELECT fw.user_id
          FROM feed_waitlist fw
          WHERE fw.notified_at IS NULL
            AND fw.user_id <> ${cid}
            AND (
              fw.lat IS NULL
              OR fw.lng IS NULL
              OR (
                (
                  3959 * acos(
                    LEAST(1, GREATEST(-1,
                      cos(radians(fw.lat)) * cos(radians(${lat})) *
                      cos(radians(${lng}) - radians(fw.lng)) +
                      sin(radians(fw.lat)) * sin(radians(${lat}))
                    ))
                  )
                ) <= fw.radius_miles
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM profile_likes pl
              WHERE pl.from_user_id = fw.user_id
                AND pl.to_user_id = ${cid}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM profile_passes pp
              WHERE pp.from_user_id = fw.user_id
                AND pp.to_user_id = ${cid}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM matches m
              WHERE m.user1_id = LEAST(fw.user_id, ${cid})
                AND m.user2_id = GREATEST(fw.user_id, ${cid})
            )
            AND NOT EXISTS (
              SELECT 1
              FROM user_blocks b
              WHERE (b.blocker_user_id = fw.user_id AND b.blocked_user_id = ${cid})
                 OR (b.blocker_user_id = ${cid} AND b.blocked_user_id = fw.user_id)
            )
          LIMIT 50
        `
      : await sql`
          SELECT fw.user_id
          FROM feed_waitlist fw
          WHERE fw.notified_at IS NULL
            AND fw.user_id <> ${cid}
            AND NOT EXISTS (
              SELECT 1
              FROM profile_likes pl
              WHERE pl.from_user_id = fw.user_id
                AND pl.to_user_id = ${cid}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM profile_passes pp
              WHERE pp.from_user_id = fw.user_id
                AND pp.to_user_id = ${cid}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM matches m
              WHERE m.user1_id = LEAST(fw.user_id, ${cid})
                AND m.user2_id = GREATEST(fw.user_id, ${cid})
            )
            AND NOT EXISTS (
              SELECT 1
              FROM user_blocks b
              WHERE (b.blocker_user_id = fw.user_id AND b.blocked_user_id = ${cid})
                 OR (b.blocker_user_id = ${cid} AND b.blocked_user_id = fw.user_id)
            )
          LIMIT 50
        `;

    const waiterIds = (waiters || [])
      .map((r) => Number(r?.user_id))
      .filter((n) => Number.isFinite(n));

    if (waiterIds.length === 0) {
      return { ok: true, notified: 0 };
    }

    const okIds = [];

    for (const uid of waiterIds) {
      const res = await sendAnnouncementPushNotification({
        toUserId: uid,
        title: "More people nearby",
        body: "More people in your area are ready to swipe — open the app to check them out.",
        data: { type: "feed_more" },
      });

      if (res?.ok) {
        okIds.push(uid);
      }
    }

    if (okIds.length > 0) {
      await sql(
        "UPDATE feed_waitlist SET notified_at = NOW() WHERE user_id = ANY($1::int[])",
        [okIds],
      );
    }

    return { ok: true, notified: okIds.length };
  } catch (e) {
    console.error("[PUSH][WAITLIST] notifyWaitlistForCandidate error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}
