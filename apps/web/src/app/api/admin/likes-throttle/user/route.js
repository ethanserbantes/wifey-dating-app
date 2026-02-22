import sql from "@/app/api/utils/sql";
import {
  computeIsLowActivityUser,
  getLikeThrottleConfig,
} from "@/app/api/utils/likeThrottle";

function hoursAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const h = (Date.now() - d.getTime()) / 36e5;
  return Math.round(h * 10) / 10;
}

export async function GET(request) {
  try {
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
        { error: "userId or email required" },
        { status: 400 },
      );
    }

    const cfg = await getLikeThrottleConfig();
    const isLowActivity = await computeIsLowActivityUser(userId);
    const basePromoteAfterHours = isLowActivity
      ? cfg.lowActivityPromoteAfterHours
      : cfg.promoteAfterHours;

    const counts = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending_hidden')::int AS pending_hidden,
        COUNT(*) FILTER (WHERE status = 'surfaced')::int AS surfaced,
        COUNT(*) FILTER (WHERE status = 'matched')::int AS matched,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
        COUNT(*)::int AS total
      FROM profile_likes
      WHERE to_user_id = ${userId}
    `;

    const c = counts?.[0] || {};

    // NEW: mirror the runtime logic.
    const allowImmediateFirstSurfaceActive =
      Boolean(cfg.allowImmediateFirstSurface) && (c.surfaced ?? 0) === 0;

    const promoteAfterHours = allowImmediateFirstSurfaceActive
      ? 0
      : basePromoteAfterHours;

    const surfacedIn24hRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM profile_likes
      WHERE to_user_id = ${userId}
        AND surfaced_at IS NOT NULL
        AND surfaced_at > (now() - interval '24 hours')
    `;
    const surfacedIn24h = surfacedIn24hRows?.[0]?.count ?? 0;

    const nextHidden = await sql`
      SELECT
        pl.id,
        pl.from_user_id,
        pl.created_at,
        u.email,
        COALESCE(NULLIF(up.display_name, ''), u.email) AS display_name,
        pl.section_type,
        pl.section_key,
        (pl.comment_text IS NOT NULL) AS has_comment
      FROM profile_likes pl
      INNER JOIN users u ON u.id = pl.from_user_id
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE pl.to_user_id = ${userId}
        AND pl.status = 'pending_hidden'
      ORDER BY pl.created_at DESC
      LIMIT 25
    `;

    const nowMs = Date.now();

    const next = (nextHidden || []).map((r) => {
      const createdAt = new Date(r.created_at);
      const eligibleAt = new Date(
        createdAt.getTime() + promoteAfterHours * 36e5,
      );
      const eligible = eligibleAt.getTime() <= nowMs;

      return {
        like_id: r.id,
        from_user_id: r.from_user_id,
        display_name: r.display_name,
        email: r.email,
        created_at: r.created_at,
        age_hours: hoursAgo(r.created_at),
        eligible_at: eligibleAt.toISOString(),
        eligible_now: eligible,
        section_type: r.section_type,
        section_key: r.section_key,
        has_comment: Boolean(r.has_comment),
      };
    });

    return Response.json({
      userId,
      config: cfg,
      isLowActivity,
      promoteAfterHours,
      allowImmediateFirstSurfaceActive,
      counts: {
        total: c.total ?? 0,
        pending_hidden: c.pending_hidden ?? 0,
        surfaced: c.surfaced ?? 0,
        matched: c.matched ?? 0,
        expired: c.expired ?? 0,
        surfaced_in_24h: surfacedIn24h,
      },
      nextHiddenLikes: next,
    });
  } catch (e) {
    console.error("GET /api/admin/likes-throttle/user error:", e);
    return Response.json(
      { error: "Failed to load debug data" },
      { status: 500 },
    );
  }
}
