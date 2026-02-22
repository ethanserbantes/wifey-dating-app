import sql from "@/app/api/utils/sql";
import {
  getInboundBoostCandidates,
  ensureSurfacedLikes,
} from "@/app/api/utils/likeThrottle";

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3959; // miles

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function randomizeNearbyLatLng(lat, lng, maxMiles = 25) {
  const safeMax = Number.isFinite(maxMiles) && maxMiles > 0 ? maxMiles : 25;
  const dMiles = 1 + Math.random() * Math.max(1, safeMax - 1);
  const bearing = Math.random() * 2 * Math.PI;

  // approx conversions
  const dLat = (dMiles / 69) * Math.cos(bearing);
  const dLng =
    (dMiles / (69 * Math.cos((lat * Math.PI) / 180))) * Math.sin(bearing);

  return {
    lat: lat + dLat,
    lng: lng + dLng,
    distanceMiles: dMiles,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const minAgeRaw = searchParams.get("minAge");
    const maxAgeRaw = searchParams.get("maxAge");
    const maxDistanceRaw = searchParams.get("maxDistance");
    const genderRaw = searchParams.get("gender");

    // NEW: height filter (inches)
    const minHeightRaw = searchParams.get("minHeightInches");
    const maxHeightRaw = searchParams.get("maxHeightInches");

    // NEW: optional passport-mode origin point
    const baseLatRaw = searchParams.get("baseLat");
    const baseLngRaw = searchParams.get("baseLng");

    if (!userIdRaw) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const userId = Number(userIdRaw);
    const minAge = minAgeRaw ? Number(minAgeRaw) : 18;
    const maxAge = maxAgeRaw ? Number(maxAgeRaw) : 99;
    const gender = (genderRaw || "all").toLowerCase();

    const maxDistanceNum = maxDistanceRaw ? Number(maxDistanceRaw) : null;
    const maxDistance =
      Number.isFinite(maxDistanceNum) && maxDistanceNum > 0
        ? maxDistanceNum
        : null;

    // Normalize gender terms from the app
    const normalizedGender =
      gender === "women" ? "female" : gender === "men" ? "male" : gender;

    // Load current user's coordinates (if any)
    const me = await sql`
      SELECT lat, lng
      FROM user_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    const meLat = me?.[0]?.lat ?? null;
    const meLng = me?.[0]?.lng ?? null;

    // NEW: allow callers to override the origin coords (passport mode)
    const baseLatNum =
      baseLatRaw === null || baseLatRaw === undefined || baseLatRaw === ""
        ? null
        : Number(baseLatRaw);
    const baseLngNum =
      baseLngRaw === null || baseLngRaw === undefined || baseLngRaw === ""
        ? null
        : Number(baseLngRaw);

    const hasBase =
      Number.isFinite(baseLatNum) &&
      Number.isFinite(baseLngNum) &&
      baseLatNum >= -90 &&
      baseLatNum <= 90 &&
      baseLngNum >= -180 &&
      baseLngNum <= 180;

    const originLat = hasBase ? baseLatNum : meLat;
    const originLng = hasBase ? baseLngNum : meLng;

    // NEW: inbound-like eligibility boost (hidden likes should still be able to appear in the feed)
    let inboundBoostIds = [];
    try {
      inboundBoostIds = await getInboundBoostCandidates({ viewerId: userId });
    } catch (e) {
      console.error("getInboundBoostCandidates error:", e);
      inboundBoostIds = [];
    }

    // Opportunistically run the surfacing job while the user is active.
    // (No cron required, and deterministic based on DB state + config.)
    try {
      await ensureSurfacedLikes(userId);
    } catch (e) {
      console.error("ensureSurfacedLikes (feed) failed:", e);
    }

    const minHeightNum =
      minHeightRaw === null || minHeightRaw === undefined || minHeightRaw === ""
        ? null
        : Number(minHeightRaw);
    const maxHeightNum =
      maxHeightRaw === null || maxHeightRaw === undefined || maxHeightRaw === ""
        ? null
        : Number(maxHeightRaw);

    const hasHeightFilter =
      Number.isFinite(minHeightNum) &&
      Number.isFinite(maxHeightNum) &&
      minHeightNum >= 36 &&
      maxHeightNum <= 84 &&
      minHeightNum < maxHeightNum;

    const minHeightInches = hasHeightFilter ? Math.round(minHeightNum) : null;
    const maxHeightInches = hasHeightFilter ? Math.round(maxHeightNum) : null;

    // NOTE: do NOT interpolate a `sql`... fragment into another sql template.
    // Build the query dynamically and execute with sql(query, values).

    const today = new Date();
    const dayKey = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const seed = `${userId}-${dayKey}-${minAge}-${maxAge}-${normalizedGender}-${maxDistance ?? ""}`;

    // Helper to build the common WHERE clause.
    const baseValues = [];
    let i = 1;

    let baseWhere = `
      FROM users u
      INNER JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id != $${i++}
        AND u.status = 'APPROVED'
        AND up.is_visible = true
        AND jsonb_typeof(COALESCE(up.photos, '[]'::jsonb)) = 'array'
        AND jsonb_array_length(COALESCE(up.photos, '[]'::jsonb)) > 0
        AND up.age >= $${i++}
        AND up.age <= $${i++}
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
            AND (
              (s.user1_id = u.id AND s.user2_id = $1)
              OR (s.user1_id = $1 AND s.user2_id = u.id)
            )
        )
    `;

    baseValues.push(userId);
    baseValues.push(minAge);
    baseValues.push(maxAge);
    baseValues.push(userId);
    baseValues.push(userId);

    if (normalizedGender !== "all") {
      baseWhere += ` AND LOWER(COALESCE(up.gender, '')) = $${i++}`;
      baseValues.push(normalizedGender);
    }

    // Exclude inboundBoostIds from the randomized pool so we don't duplicate.
    if (inboundBoostIds.length) {
      baseWhere += ` AND u.id != ALL($${i++}::int[])`;
      baseValues.push(inboundBoostIds);
    }

    // Deterministic ordering (stable within a day + filter set)
    baseWhere += ` ORDER BY md5(u.id::text || $${i++}) LIMIT 40`;
    baseValues.push(seed);

    // Main pool
    const poolQuery = `
      SELECT 
        u.id,
        up.display_name,
        up.age,
        up.gender,
        up.bio,
        up.photos,
        up.location,
        up.is_verified,
        up.lat,
        up.lng,
        COALESCE(u.screening_state_json->>'is_fake', 'false') = 'true' AS is_fake,
        COALESCE(up.preferences, '{}'::jsonb) AS preferences
      ${baseWhere}
    `;

    let profiles = await sql(poolQuery, baseValues);

    // Inbound boost profiles (keep them at the top, but still apply the same safety filters)
    let boosted = [];
    if (inboundBoostIds.length) {
      const boostValues = [];
      let j = 1;

      let boostWhere = `
        FROM users u
        INNER JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id = ANY($${j++}::int[])
          AND u.id != $${j++}
          AND u.status = 'APPROVED'
          AND up.is_visible = true
          AND jsonb_typeof(COALESCE(up.photos, '[]'::jsonb)) = 'array'
          AND jsonb_array_length(COALESCE(up.photos, '[]'::jsonb)) > 0
          AND up.age >= $${j++}
          AND up.age <= $${j++}
          AND u.id NOT IN (
            SELECT to_user_id FROM profile_likes WHERE from_user_id = $${j++}
          )
          AND u.id NOT IN (
            SELECT to_user_id FROM profile_passes WHERE from_user_id = $${j++}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM matches m
            WHERE m.user1_id = LEAST(u.id, $2)
              AND m.user2_id = GREATEST(u.id, $2)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM user_blocks b
            WHERE (b.blocker_user_id = $2 AND b.blocked_user_id = u.id)
               OR (b.blocker_user_id = u.id AND b.blocked_user_id = $2)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM match_conversation_states s
            WHERE s.active_at IS NOT NULL
              AND s.terminal_state IS NULL
              AND (
                (s.user1_id = u.id AND s.user2_id = $2)
                OR (s.user1_id = $2 AND s.user2_id = u.id)
              )
          )
      `;

      boostValues.push(inboundBoostIds);
      boostValues.push(userId);
      boostValues.push(minAge);
      boostValues.push(maxAge);
      boostValues.push(userId);
      boostValues.push(userId);

      if (normalizedGender !== "all") {
        boostWhere += ` AND LOWER(COALESCE(up.gender, '')) = $${j++}`;
        boostValues.push(normalizedGender);
      }

      boostWhere += ` ORDER BY md5(u.id::text || $${j++}) LIMIT 20`;
      boostValues.push(seed);

      const boostQuery = `
        SELECT 
          u.id,
          up.display_name,
          up.age,
          up.gender,
          up.bio,
          up.photos,
          up.location,
          up.is_verified,
          up.lat,
          up.lng,
          COALESCE(u.screening_state_json->>'is_fake', 'false') = 'true' AS is_fake,
          COALESCE(up.preferences, '{}'::jsonb) AS preferences
        ${boostWhere}
      `;

      boosted = await sql(boostQuery, boostValues);
    }

    // Combine (boosted first)
    if (boosted.length) {
      const boostedIds = new Set(boosted.map((p) => p.id));
      const rest = (profiles || []).filter((p) => !boostedIds.has(p.id));
      profiles = [...boosted, ...rest];
    }

    // NEW: optional height filtering helper (best-effort; keep profiles with unknown height)
    const parseHeightInches = (raw) => {
      try {
        const str = String(raw || "").trim();
        // expected format like: 5'10"
        const m = str.match(/^(\d+)'\s*(\d+)"?$/);
        if (!m) return null;
        const ft = Number(m[1]);
        const inch = Number(m[2]);
        if (!Number.isFinite(ft) || !Number.isFinite(inch)) return null;
        if (ft < 0 || inch < 0 || inch > 11) return null;
        return ft * 12 + inch;
      } catch {
        return null;
      }
    };

    const applyHeightFilter = (arr) => {
      if (!hasHeightFilter) return arr;
      return (arr || []).filter((p) => {
        const hStr = p?.preferences?.basics?.height;
        const inches = parseHeightInches(hStr);
        if (!Number.isFinite(inches)) {
          return true;
        }
        return inches >= minHeightInches && inches <= maxHeightInches;
      });
    };

    // Attach distance (and backfill fake profile coords near the origin, so distance works in demos)
    if (Number.isFinite(originLat) && Number.isFinite(originLng)) {
      const updated = [];

      profiles = profiles.map((p) => {
        const hasCoords = Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
        const isFake = p?.is_fake === true;

        if (!hasCoords && isFake) {
          const seed = randomizeNearbyLatLng(
            originLat,
            originLng,
            maxDistance || 25,
          );
          const next = {
            ...p,
            lat: seed.lat,
            lng: seed.lng,
            distance_miles: seed.distanceMiles,
          };
          updated.push({ userId: p.id, lat: seed.lat, lng: seed.lng });
          return next;
        }

        if (hasCoords) {
          const d = haversineMiles(
            originLat,
            originLng,
            Number(p.lat),
            Number(p.lng),
          );
          return { ...p, distance_miles: d };
        }

        return { ...p, distance_miles: null };
      });

      // Persist coordinates for fake profiles we "placed" near the user.
      for (const row of updated) {
        try {
          await sql`
            UPDATE user_profiles
            SET lat = COALESCE(lat, ${row.lat}),
                lng = COALESCE(lng, ${row.lng}),
                updated_at = NOW()
            WHERE user_id = ${row.userId}
          `;
        } catch (e) {
          console.error("Error saving fake profile coordinates:", e);
        }
      }

      if (maxDistance !== null) {
        // Apply distance filtering when we can compute distance.
        // Keep profiles with unknown distance so the feed doesn't go empty.
        profiles = profiles.filter((p) => {
          const d = p?.distance_miles;
          if (typeof d !== "number" || !Number.isFinite(d)) {
            return true;
          }
          return d <= maxDistance;
        });
      }

      // NEW: apply height filter BEFORE trimming
      profiles = applyHeightFilter(profiles);

      // Trim back down to 20-ish after filtering
      profiles = profiles.slice(0, 20);
    } else {
      // No current-user coords: return as-is, but keep the shape stable.
      profiles = profiles.map((p) => ({ ...p, distance_miles: null }));

      // NEW: apply height filter BEFORE trimming
      profiles = applyHeightFilter(profiles);

      profiles = profiles.slice(0, 20);
    }

    // NEW: write feed impressions for the returned list (best-effort)
    try {
      const ids = (profiles || [])
        .map((p) => Number(p?.id))
        .filter((x) => Number.isFinite(x) && x !== userId);

      if (ids.length) {
        const placeholders = [];
        const values = [];
        let k = 1;

        for (const viewedId of ids) {
          placeholders.push(`($${k++}, $${k++}, NOW())`);
          values.push(userId, viewedId);
        }

        const insertSql = `
          INSERT INTO feed_impressions (viewer_id, viewed_user_id, seen_at)
          VALUES ${placeholders.join(", ")}
        `;

        await sql(insertSql, values);
      }
    } catch (e) {
      console.error("feed_impressions insert error:", e);
    }

    return Response.json({ profiles });
  } catch (error) {
    console.error("Error fetching profile feed:", error);
    return Response.json(
      { error: "Failed to fetch profiles" },
      { status: 500 },
    );
  }
}
