import sql from "@/app/api/utils/sql";
import { ensureSurfacedLikes } from "@/app/api/utils/likeThrottle";

function safeJsonParse(input, fallback) {
  if (!input) return fallback;
  if (typeof input === "object") return input;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

export async function GET(request) {
  try {
    // Safe URL parsing (some runtimes provide a relative request.url)
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url);
    } catch {
      parsedUrl = new URL(request.url, process.env.APP_URL);
    }

    const { searchParams } = parsedUrl;
    const userIdRaw = searchParams.get("userId");
    const emailRaw = searchParams.get("email");

    const email = typeof emailRaw === "string" ? emailRaw.trim() : "";

    let userId = null;

    if (userIdRaw) {
      const parsed = Number(userIdRaw);
      if (!Number.isFinite(parsed)) {
        return Response.json({ error: "Invalid userId" }, { status: 400 });
      }
      userId = parsed;
    }

    // If the client passes email (or userId is stale), map email → users.id.
    if (email) {
      const rows = await sql`
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER(${email})
        LIMIT 1
      `;
      const idFromEmail = rows?.[0]?.id;
      if (Number.isFinite(idFromEmail)) {
        userId = Number(idFromEmail);
      }
    }

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "User ID (or email) required" },
        { status: 400 },
      );
    }

    // NEW: opportunistically promote hidden likes into the visible inbox (throttled).
    // This keeps the system deterministic and doesn't require a cron.
    try {
      await ensureSurfacedLikes(userId);
    } catch (e) {
      console.error("ensureSurfacedLikes failed:", e);
      // do not block the inbox
    }

    // Likes tab = "they liked me".
    // We exclude:
    // - people I already liked
    // - anyone I'm already matched with
    // - anyone I've blocked (or who blocked me)
    // NOTE: We intentionally DO NOT exclude people I previously passed here.
    // CHANGE: include *both* surfaced + pending_hidden so new likes show up immediately.
    const rows = await sql`
      WITH me AS (
        SELECT
          COALESCE(ul_me.lat, up_me.lat) AS lat,
          COALESCE(ul_me.lng, up_me.lng) AS lng
        FROM users me_u
        LEFT JOIN user_location_latest ul_me
          ON ul_me.user_id = me_u.id
        LEFT JOIN user_profiles up_me
          ON up_me.user_id = me_u.id
        WHERE me_u.id = ${userId}
        LIMIT 1
      )
      SELECT 
        u.id,
        COALESCE(NULLIF(up.display_name, ''), NULLIF(au.name, ''), u.email) AS display_name,
        up.age,
        up.gender,
        up.bio,
        COALESCE(up.photos, '[]'::jsonb) AS photos,
        up.location,
        pl.status AS like_status,
        pl.created_at as liked_at,
        pl.surfaced_at as surfaced_at,
        (pp.id IS NOT NULL) AS passed_by_me,
        p.last_seen_at AS last_seen_at,
        (p.last_seen_at IS NOT NULL AND p.last_seen_at > (now() - interval '5 minutes')) AS is_online,

        -- distance (miles) between me and the liker, when we have coordinates
        CASE
          WHEN me.lat IS NULL OR me.lng IS NULL THEN NULL
          WHEN COALESCE(ul_from.lat, up.lat) IS NULL OR COALESCE(ul_from.lng, up.lng) IS NULL THEN NULL
          ELSE (
            3958.8 * 2 * asin(
              sqrt(
                pow(sin(radians((COALESCE(ul_from.lat, up.lat) - me.lat) / 2)), 2) +
                cos(radians(me.lat)) * cos(radians(COALESCE(ul_from.lat, up.lat))) *
                pow(sin(radians((COALESCE(ul_from.lng, up.lng) - me.lng) / 2)), 2)
              )
            )
          )
        END AS distance_miles
      FROM profile_likes pl
      INNER JOIN users u ON pl.from_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_location_latest ul_from
        ON ul_from.user_id = u.id
      LEFT JOIN auth_users au ON au.email = u.email
      LEFT JOIN profile_passes pp
        ON pp.from_user_id = ${userId}
       AND pp.to_user_id = pl.from_user_id
      LEFT JOIN user_presence_latest p
        ON p.user_id = u.id
      CROSS JOIN me
      WHERE pl.to_user_id = ${userId}
        AND pl.status IN ('pending_hidden','surfaced')
        AND pl.from_user_id NOT IN (
          SELECT to_user_id FROM profile_likes WHERE from_user_id = ${userId}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM matches m
          WHERE m.user1_id = LEAST(pl.from_user_id, ${userId})
            AND m.user2_id = GREATEST(pl.from_user_id, ${userId})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks b
          WHERE (b.blocker_user_id = ${userId} AND b.blocked_user_id = pl.from_user_id)
             OR (b.blocker_user_id = pl.from_user_id AND b.blocked_user_id = ${userId})
        )
      ORDER BY pl.created_at DESC
    `;

    const likes = (rows || []).map((r) => ({
      ...r,
      passed_by_me: Boolean(r?.passed_by_me),
      photos: safeJsonParse(r?.photos, []),
      is_online: Boolean(r?.is_online),
      // like_status is passed through for UI gating/telemetry
    }));

    return Response.json({ likes, resolvedUserId: userId });
  } catch (error) {
    console.error("Error fetching likes:", error);
    return Response.json({ error: "Failed to fetch likes" }, { status: 500 });
  }
}
