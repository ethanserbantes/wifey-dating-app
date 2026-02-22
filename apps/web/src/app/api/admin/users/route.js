import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const gender = (searchParams.get("gender") || "").trim();
    const hasProfile = (searchParams.get("hasProfile") || "").trim(); // "yes" | "no" | ""
    const verified = (searchParams.get("verified") || "").trim(); // "yes" | "no" | ""
    const ageMinRaw = (searchParams.get("ageMin") || "").trim();
    const ageMaxRaw = (searchParams.get("ageMax") || "").trim();

    const ageMin = ageMinRaw ? Number(ageMinRaw) : null;
    const ageMax = ageMaxRaw ? Number(ageMaxRaw) : null;

    const page = parseInt(searchParams.get("page") || "1");

    const sortByRaw = (searchParams.get("sortBy") || "created_at").trim();
    const sortDirRaw = (searchParams.get("sortDir") || "desc").trim();

    const sortDir = sortDirRaw.toLowerCase() === "asc" ? "ASC" : "DESC";

    const limit = 50;
    const offset = (page - 1) * limit;

    const sortByMap = {
      created_at: "u.created_at",
      email: "u.email",
      name: "up.display_name",
      age: "up.age",
      // engagement sorts are handled separately (slower)
      likes_received: "likes_received",
      skips_received: "skips_received",
      like_ratio: "like_ratio",
    };

    const sortExpr = sortByMap[sortByRaw] || sortByMap.created_at;
    const sortsByEngagement = [
      "likes_received",
      "skips_received",
      "like_ratio",
    ].includes(sortByRaw);

    const params = [];
    let paramIndex = 1;

    // Build the shared WHERE clause once so count + list stay in sync
    let whereSql = " WHERE 1=1";

    if (search) {
      whereSql += ` AND (u.email ILIKE $${paramIndex} OR COALESCE(up.display_name, '') ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereSql += ` AND u.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (gender) {
      whereSql += ` AND up.gender = $${paramIndex}`;
      params.push(gender);
      paramIndex++;
    }

    if (hasProfile === "yes") {
      whereSql += ` AND up.user_id IS NOT NULL`;
    } else if (hasProfile === "no") {
      whereSql += ` AND up.user_id IS NULL`;
    }

    if (verified === "yes") {
      whereSql += ` AND up.is_verified = TRUE`;
    } else if (verified === "no") {
      whereSql += ` AND (up.is_verified IS NULL OR up.is_verified = FALSE)`;
    }

    if (Number.isFinite(ageMin)) {
      whereSql += ` AND up.age >= $${paramIndex}`;
      params.push(ageMin);
      paramIndex++;
    }

    if (Number.isFinite(ageMax)) {
      whereSql += ` AND up.age <= $${paramIndex}`;
      params.push(ageMax);
      paramIndex++;
    }

    // Faster path for normal sorts (created_at / email / name / age):
    // - limit/offset is applied BEFORE counting likes/skips
    // - likes/skips are computed only for the 50 visible rows
    let listQuery;
    let listParams;

    if (!sortsByEngagement) {
      listQuery = `
        WITH base AS (
          SELECT
            u.id,
            u.email,
            u.status,
            u.screening_phase,
            u.cooldown_until,
            u.created_at,
            u.updated_at,
            up.display_name,
            up.age,
            up.gender,
            up.is_verified
          FROM users u
          LEFT JOIN user_profiles up ON up.user_id = u.id
          ${whereSql}
          ORDER BY ${sortExpr} ${sortDir} NULLS LAST, u.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        )
        SELECT
          base.*,
          COALESCE(l.likes_received, 0)::int AS likes_received,
          COALESCE(p.skips_received, 0)::int AS skips_received,
          CASE
            WHEN (COALESCE(l.likes_received, 0) + COALESCE(p.skips_received, 0)) = 0 THEN 0
            ELSE ROUND(
              COALESCE(l.likes_received, 0)::numeric /
              (COALESCE(l.likes_received, 0) + COALESCE(p.skips_received, 0))::numeric,
              4
            )
          END AS like_ratio
        FROM base
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS likes_received
          FROM profile_likes pl
          WHERE pl.to_user_id = base.id
        ) l ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS skips_received
          FROM profile_passes pp
          WHERE pp.to_user_id = base.id
        ) p ON TRUE
      `;

      listParams = [...params, limit, offset];
    } else {
      // Slower path (engagement sort) - keep the previous aggregated approach.
      // This avoids incorrect sorting when the admin chooses to sort by likes/skips/ratio.
      listQuery = `
        SELECT
          u.id,
          u.email,
          u.status,
          u.screening_phase,
          u.cooldown_until,
          u.created_at,
          u.updated_at,
          up.display_name,
          up.age,
          up.gender,
          up.is_verified,
          COALESCE(l.likes_received, 0)::int AS likes_received,
          COALESCE(p.skips_received, 0)::int AS skips_received,
          CASE
            WHEN (COALESCE(l.likes_received, 0) + COALESCE(p.skips_received, 0)) = 0 THEN 0
            ELSE ROUND(
              COALESCE(l.likes_received, 0)::numeric /
              (COALESCE(l.likes_received, 0) + COALESCE(p.skips_received, 0))::numeric,
              4
            )
          END AS like_ratio
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN (
          SELECT to_user_id, COUNT(*) AS likes_received
          FROM profile_likes
          GROUP BY to_user_id
        ) l ON l.to_user_id = u.id
        LEFT JOIN (
          SELECT to_user_id, COUNT(*) AS skips_received
          FROM profile_passes
          GROUP BY to_user_id
        ) p ON p.to_user_id = u.id
        ${whereSql}
        ORDER BY ${sortExpr} ${sortDir} NULLS LAST, u.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      listParams = [...params, limit, offset];
    }

    const users = await sql(listQuery, listParams);

    // Count query (no engagement joins; it only counts matching users)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      ${whereSql}
    `;

    const [{ total }] = await sql(countQuery, params);

    return Response.json({
      users,
      total: parseInt(total),
      page,
      limit,
      sortBy: sortByRaw,
      sortDir: sortDir.toLowerCase(),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return Response.json(
      { error: "Failed to fetch users" },
      {
        status: 500,
      },
    );
  }
}
