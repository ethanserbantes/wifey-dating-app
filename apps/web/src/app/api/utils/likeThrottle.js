import sql from "@/app/api/utils/sql";

const DEFAULT_CONFIG = {
  maxSurfacedAtOnce: 1,
  maxSurfacedPer24h: 3,
  promoteAfterHours: 48,
  lowActivityPromoteAfterHours: 24,
  impressionCooldownHours: 12,
  inboundBoostCount: 3,
  expireHiddenOnPass: true,
  // NEW: if the user currently has 0 surfaced likes in their inbox, allow surfacing 1 immediately
  // (so brand-new users don't wait 24–48h to see anything).
  allowImmediateFirstSurface: false,
};

function clampInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export async function getLikeThrottleConfig() {
  try {
    const rows = await sql`
      SELECT config_json
      FROM like_throttle_settings
      WHERE id = 1
      LIMIT 1
    `;

    const dbCfg = rows?.[0]?.config_json || {};

    const cfg = {
      maxSurfacedAtOnce: clampInt(dbCfg?.maxSurfacedAtOnce, {
        min: 0,
        max: 25,
        fallback: DEFAULT_CONFIG.maxSurfacedAtOnce,
      }),
      maxSurfacedPer24h: clampInt(dbCfg?.maxSurfacedPer24h, {
        min: 0,
        max: 100,
        fallback: DEFAULT_CONFIG.maxSurfacedPer24h,
      }),
      promoteAfterHours: clampInt(dbCfg?.promoteAfterHours, {
        min: 0,
        max: 24 * 30,
        fallback: DEFAULT_CONFIG.promoteAfterHours,
      }),
      lowActivityPromoteAfterHours: clampInt(
        dbCfg?.lowActivityPromoteAfterHours,
        {
          min: 0,
          max: 24 * 30,
          fallback: DEFAULT_CONFIG.lowActivityPromoteAfterHours,
        },
      ),
      impressionCooldownHours: clampInt(dbCfg?.impressionCooldownHours, {
        min: 0,
        max: 24 * 7,
        fallback: DEFAULT_CONFIG.impressionCooldownHours,
      }),
      inboundBoostCount: clampInt(dbCfg?.inboundBoostCount, {
        min: 0,
        max: 20,
        fallback: DEFAULT_CONFIG.inboundBoostCount,
      }),
      expireHiddenOnPass: Boolean(
        typeof dbCfg?.expireHiddenOnPass === "boolean"
          ? dbCfg.expireHiddenOnPass
          : DEFAULT_CONFIG.expireHiddenOnPass,
      ),
      allowImmediateFirstSurface:
        typeof dbCfg?.allowImmediateFirstSurface === "boolean"
          ? dbCfg.allowImmediateFirstSurface
          : DEFAULT_CONFIG.allowImmediateFirstSurface,
    };

    return cfg;
  } catch (e) {
    console.error("getLikeThrottleConfig error:", e);
    return { ...DEFAULT_CONFIG };
  }
}

export async function computeIsLowActivityUser(userId) {
  // Deterministic: based only on last_seen_at.
  // If we can't find it, treat as low activity to avoid dead-end likes.
  try {
    const rows = await sql`
      SELECT last_seen_at
      FROM user_presence_latest
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const lastSeen = rows?.[0]?.last_seen_at
      ? new Date(rows[0].last_seen_at)
      : null;
    if (!lastSeen || Number.isNaN(lastSeen.getTime())) {
      return true;
    }

    const hours = (Date.now() - lastSeen.getTime()) / 36e5;
    return hours >= 72; // 3 days inactive = low activity
  } catch (e) {
    console.error("computeIsLowActivityUser error:", e);
    return true;
  }
}

function hoursAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / 36e5;
}

function scoreCandidate({ createdAt, isOnline }) {
  // Higher is better. Deterministic.
  // - Prefer more recent likes.
  // - Slightly boost currently-online likers.
  const ageHours = hoursAgo(createdAt);
  const recencyScore = -ageHours; // recent => closer to 0
  const onlineBoost = isOnline ? 0.5 : 0;
  return recencyScore + onlineBoost;
}

export async function ensureSurfacedLikes(toUserId) {
  const cfg = await getLikeThrottleConfig();

  // Quick exit when throttling is disabled.
  if (cfg.maxSurfacedAtOnce <= 0 || cfg.maxSurfacedPer24h <= 0) {
    return { promoted: 0, promotedLikeIds: [] };
  }

  const isLowActivity = await computeIsLowActivityUser(toUserId);
  const defaultPromoteAfterHours = isLowActivity
    ? cfg.lowActivityPromoteAfterHours
    : cfg.promoteAfterHours;

  // How many are currently visible?
  const surfacedNow = await sql`
    SELECT COUNT(*)::int AS count
    FROM profile_likes
    WHERE to_user_id = ${toUserId}
      AND status = 'surfaced'
  `;

  const surfacedCount = surfacedNow?.[0]?.count ?? 0;

  // NEW: optional rule to let the very first surfaced like appear immediately.
  // Deterministic: depends only on current surfacedCount + config flag.
  const allowImmediateFirst =
    Boolean(cfg.allowImmediateFirstSurface) && surfacedCount === 0;

  const promoteAfterHours = allowImmediateFirst ? 0 : defaultPromoteAfterHours;

  const remainingSlots = Math.max(0, cfg.maxSurfacedAtOnce - surfacedCount);
  if (remainingSlots <= 0) {
    return { promoted: 0, promotedLikeIds: [] };
  }

  // How many have we surfaced in the last 24h?
  const surfaced24h = await sql`
    SELECT COUNT(*)::int AS count
    FROM profile_likes
    WHERE to_user_id = ${toUserId}
      AND surfaced_at IS NOT NULL
      AND surfaced_at > (now() - interval '24 hours')
  `;

  const surfacedIn24h = surfaced24h?.[0]?.count ?? 0;
  const remainingDaily = Math.max(0, cfg.maxSurfacedPer24h - surfacedIn24h);
  if (remainingDaily <= 0) {
    return { promoted: 0, promotedLikeIds: [] };
  }

  const promoteCount = Math.min(remainingSlots, remainingDaily);

  // Load eligible hidden likes.
  // If allowImmediateFirst is enabled, promoteAfterHours becomes 0, so ANY hidden like can be surfaced.
  // Exclude blocked users + already-matched users.
  const candidates = await sql`
    SELECT
      pl.id,
      pl.from_user_id,
      pl.created_at,
      p.last_seen_at,
      (p.last_seen_at IS NOT NULL AND p.last_seen_at > (now() - interval '5 minutes')) AS is_online
    FROM profile_likes pl
    LEFT JOIN user_presence_latest p
      ON p.user_id = pl.from_user_id
    WHERE pl.to_user_id = ${toUserId}
      AND pl.status = 'pending_hidden'
      AND pl.created_at <= (now() - ((${promoteAfterHours}::text || ' hours')::interval))
      AND NOT EXISTS (
        SELECT 1
        FROM matches m
        WHERE m.user1_id = LEAST(pl.from_user_id, ${toUserId})
          AND m.user2_id = GREATEST(pl.from_user_id, ${toUserId})
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE (b.blocker_user_id = ${toUserId} AND b.blocked_user_id = pl.from_user_id)
           OR (b.blocker_user_id = pl.from_user_id AND b.blocked_user_id = ${toUserId})
      )
    ORDER BY pl.created_at DESC
    LIMIT 200
  `;

  if (!candidates?.length) {
    return { promoted: 0, promotedLikeIds: [] };
  }

  const sorted = [...candidates].sort((a, b) => {
    const aScore = scoreCandidate({
      createdAt: a.created_at,
      isOnline: a.is_online,
    });
    const bScore = scoreCandidate({
      createdAt: b.created_at,
      isOnline: b.is_online,
    });
    if (aScore === bScore) {
      // deterministic tiebreaker
      return Number(b.id) - Number(a.id);
    }
    return bScore - aScore;
  });

  const toPromote = sorted.slice(0, promoteCount);
  const ids = toPromote
    .map((r) => Number(r.id))
    .filter((x) => Number.isFinite(x));

  if (!ids.length) {
    return { promoted: 0, promotedLikeIds: [] };
  }

  // Promote in one statement.
  await sql(
    `UPDATE profile_likes
     SET status = 'surfaced', pending_hidden = false, surfaced_at = NOW()
     WHERE id = ANY($1::int[])`,
    [ids],
  );

  return { promoted: ids.length, promotedLikeIds: ids };
}

export async function expireInboundLikeOnPass({ viewerId, passedUserId }) {
  const cfg = await getLikeThrottleConfig();
  if (!cfg.expireHiddenOnPass) return { expired: 0 };

  // If the person you passed had liked you (hidden or surfaced), expire it.
  const rows = await sql`
    UPDATE profile_likes
    SET status = 'expired', expired_at = NOW()
    WHERE from_user_id = ${passedUserId}
      AND to_user_id = ${viewerId}
      AND status IN ('pending_hidden','surfaced')
    RETURNING id
  `;

  return { expired: rows?.length || 0 };
}

export async function getInboundBoostCandidates({ viewerId }) {
  const cfg = await getLikeThrottleConfig();
  const n = Math.max(0, cfg.inboundBoostCount);
  if (n <= 0) return [];

  // People who liked me but are still hidden should be eligible in my discovery feed.
  // Avoid showing them too frequently by checking feed_impressions.
  const rows = await sql`
    SELECT
      pl.from_user_id AS user_id
    FROM profile_likes pl
    WHERE pl.to_user_id = ${viewerId}
      AND pl.status IN ('pending_hidden','surfaced')
      AND NOT EXISTS (
        SELECT 1
        FROM profile_passes pp
        WHERE pp.from_user_id = ${viewerId}
          AND pp.to_user_id = pl.from_user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM matches m
        WHERE m.user1_id = LEAST(pl.from_user_id, ${viewerId})
          AND m.user2_id = GREATEST(pl.from_user_id, ${viewerId})
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE (b.blocker_user_id = ${viewerId} AND b.blocked_user_id = pl.from_user_id)
           OR (b.blocker_user_id = pl.from_user_id AND b.blocked_user_id = ${viewerId})
      )
      AND NOT EXISTS (
        SELECT 1
        FROM feed_impressions fi
        WHERE fi.viewer_id = ${viewerId}
          AND fi.viewed_user_id = pl.from_user_id
          AND fi.seen_at > (now() - ((${cfg.impressionCooldownHours}::text || ' hours')::interval))
      )
    ORDER BY pl.created_at DESC
    LIMIT ${n}
  `;

  return (rows || [])
    .map((r) => Number(r?.user_id))
    .filter((x) => Number.isFinite(x));
}
