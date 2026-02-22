import sql from "@/app/api/utils/sql";

function normalizeGender(value) {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (!raw) return "all";
  if (raw === "women") return "female";
  if (raw === "men") return "male";
  if (raw === "everyone") return "all";
  if (raw === "female" || raw === "male") return raw;
  if (raw === "all") return "all";
  return "all";
}

function normalizeTier(value) {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (raw === "committed") return "committed";
  if (raw === "serious") return "serious";
  return null;
}

function clampInt(n, min, max, fallback) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function parsePgIntArray(value) {
  // Neon can return int[] as JS array *or* as string like "{1,2,3}".
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n));
}

function buildIntArraySql(ids, startIndex) {
  // Returns { expr, values } where expr is a SQL snippet (no user input) like:
  // - "'{}'::int[]" (for empty)
  // - "ARRAY[$4,$5]::int[]" (for non-empty)
  if (!Array.isArray(ids) || ids.length === 0) {
    return { expr: "'{}'::int[]", values: [] };
  }

  const placeholders = ids.map((_, idx) => `$${startIndex + idx}`);
  return { expr: `ARRAY[${placeholders.join(",")} ]::int[]`, values: ids };
}

function buildInListSql(ids, startIndex) {
  // Returns { inExpr, orderExpr, values }
  // - inExpr: "$1,$2,$3" for use in "IN (...)"
  // - orderExpr: "CASE u.id WHEN $1 THEN 1 WHEN $2 THEN 2 ... END" to preserve ordering
  if (!Array.isArray(ids) || ids.length === 0) {
    return { inExpr: "NULL", orderExpr: "1", values: [] };
  }

  const placeholders = ids.map((_, idx) => `$${startIndex + idx}`);
  const inExpr = placeholders.join(",");

  const cases = ids
    .map((_, idx) => `WHEN $${startIndex + idx} THEN ${idx + 1}`)
    .join(" ");
  const orderExpr = `CASE u.id ${cases} ELSE ${ids.length + 1} END`;

  return { inExpr, orderExpr, values: ids };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const genderRaw = searchParams.get("gender");
    const limitRaw = searchParams.get("limit");
    const tierRaw = searchParams.get("tier");

    if (!userIdRaw) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const limit = clampInt(limitRaw, 1, 50, 10);

    const normalizedGender = normalizeGender(genderRaw);

    // Tier semantics:
    // - Serious: 5 Standouts every 24 hours
    // - Committed: more Standouts every 24 hours
    const inferredTier = limit <= 5 ? "serious" : "committed";
    const normalizedTier = normalizeTier(tierRaw) || inferredTier;

    const seriousDailyCount = 5;
    const committedDailyCount = 40;
    const dailyCount =
      normalizedTier === "committed" ? committedDailyCount : seriousDailyCount;
    const returnLimit = Math.min(limit, dailyCount);

    // 1) If we already generated a set in the last 24 hours, reuse it.
    const existingRows = await sql(
      `
        SELECT user_ids
        FROM discover_standout_sets
        WHERE viewer_user_id = $1
          AND gender = $2
          AND tier = $3
          AND refreshed_at > now() - interval '24 hours'
      `,
      [userId, normalizedGender, normalizedTier],
    );

    const existing = existingRows?.[0] || null;
    let userIds = parsePgIntArray(existing?.user_ids);

    if (!userIds || userIds.length === 0) {
      // 2) Generate a new set.
      // IMPORTANT: Standouts should work even when there are few/no verified profiles.
      // We still *prefer* verified profiles, but we no longer hard-require verification.

      const values = [];
      let i = 1;

      let candidatesQuery = `
        WITH candidates AS (
          SELECT
            u.id,
            COALESCE(up.is_verified, false) AS is_verified,
            COUNT(pl.id) FILTER (WHERE pl.created_at >= now() - interval '14 days')::int AS likes_recent
          FROM users u
          INNER JOIN user_profiles up ON u.id = up.user_id
          LEFT JOIN profile_likes pl ON pl.to_user_id = u.id
          WHERE u.id != $${i++}
            AND u.status = 'APPROVED'
            AND up.is_visible = true
            AND u.id NOT IN (
              SELECT to_user_id FROM profile_likes WHERE from_user_id = $${i++}
            )
            AND u.id NOT IN (
              SELECT to_user_id FROM profile_passes WHERE from_user_id = $${i++}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM matches m
              WHERE m.user1_id = LEAST(u.id, $1)
                AND m.user2_id = GREATEST(u.id, $1)
            )
            AND NOT EXISTS (
              SELECT 1
              FROM user_blocks b
              WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = u.id)
                 OR (b.blocker_user_id = u.id AND b.blocked_user_id = $1)
            )
            AND NOT EXISTS (
              SELECT 1
              FROM match_conversation_states s
              WHERE s.active_at IS NOT NULL
                AND s.terminal_state IS NULL
                AND (s.user1_id = u.id OR s.user2_id = u.id)
            )
      `;

      values.push(userId);
      values.push(userId);
      values.push(userId);

      if (normalizedGender !== "all") {
        candidatesQuery += ` AND LOWER(COALESCE(up.gender, '')) = $${i++}`;
        values.push(normalizedGender);
      }

      candidatesQuery += `
          GROUP BY u.id, up.is_verified
        )
        SELECT id
        FROM candidates
        ORDER BY is_verified DESC, likes_recent DESC, RANDOM()
        LIMIT $${i++}
      `;

      values.push(dailyCount);

      const picked = await sql(candidatesQuery, values);
      userIds = (picked || [])
        .map((r) => r?.id)
        .filter((x) => Number.isFinite(Number(x)))
        .map((x) => Number(x));

      // Ensure we always have an array (even if no candidates).
      if (!Array.isArray(userIds)) {
        userIds = [];
      }

      // Upsert the new set.
      // IMPORTANT: avoid passing JS arrays as a single SQL parameter (neon can be picky).
      const arr = buildIntArraySql(userIds, 4);
      await sql(
        `
          INSERT INTO discover_standout_sets (viewer_user_id, gender, tier, refreshed_at, user_ids)
          VALUES ($1, $2, $3, now(), ${arr.expr})
          ON CONFLICT (viewer_user_id, gender, tier)
          DO UPDATE SET refreshed_at = now(), user_ids = EXCLUDED.user_ids
        `,
        [userId, normalizedGender, normalizedTier, ...arr.values],
      );
    }

    // 3) Hydrate profiles in the stored order.
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return Response.json({ profiles: [], refresh_window_hours: 24 });
    }

    const hydrateSqlParts = buildInListSql(userIds, 1);
    const hydrate = await sql(
      `
        SELECT
          u.id,
          up.display_name,
          up.age,
          up.gender,
          up.bio,
          up.photos,
          up.location,
          up.is_verified,
          COALESCE(up.preferences, '{}'::jsonb) AS preferences
        FROM users u
        INNER JOIN user_profiles up ON u.id = up.user_id
        WHERE u.status = 'APPROVED'
          AND up.is_visible = true
          AND u.id IN (${hydrateSqlParts.inExpr})
          AND NOT EXISTS (
            SELECT 1
            FROM match_conversation_states s
            WHERE s.active_at IS NOT NULL
              AND s.terminal_state IS NULL
              AND (s.user1_id = u.id OR s.user2_id = u.id)
          )
        ORDER BY ${hydrateSqlParts.orderExpr} ASC
        LIMIT $${userIds.length + 1}
      `,
      [...hydrateSqlParts.values, returnLimit],
    );

    return Response.json({ profiles: hydrate, refresh_window_hours: 24 });
  } catch (error) {
    console.error("[DISCOVER] standouts error:", error);

    const payload = {
      error: "Failed to fetch standouts",
      details: String(error?.message || error),
    };

    // NOTE: We intentionally avoid Response.json here because some runtimes
    // can swallow bodies on 500s; returning a plain Response is the most reliable.
    return new Response(JSON.stringify(payload), {
      status: 500,
      headers: {
        "content-type": "application/json",
      },
    });
  }
}
