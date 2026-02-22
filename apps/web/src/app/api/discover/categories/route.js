import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");

    if (!userIdRaw) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    // IMPORTANT RULE:
    // Only show categories that have at least 1 ACTIVE female user.
    // In this codebase, we treat "active" as:
    // - users.status = APPROVED
    // - user_profiles.is_visible = true
    // - user_profiles.is_verified = true AND verification_status = 'approved'
    // - user_profiles.gender = female
    // Category is stored as preferences.category.

    const rows = await sql`
      WITH females AS (
        SELECT
          u.id AS user_id,
          up.photos,
          LOWER(COALESCE(up.gender, '')) AS gender,
          NULLIF(TRIM(COALESCE(up.preferences->>'category', '')), '') AS category
        FROM users u
        INNER JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id != ${userId}
          AND u.status = 'APPROVED'
          AND up.is_visible = true
          AND LOWER(COALESCE(up.gender, '')) = 'female'
          AND (
            (
              up.is_verified = true
              AND up.verification_status = 'approved'
            )
            OR COALESCE(u.screening_state_json->>'is_fake', 'false') = 'true'
          )
      ),
      counts AS (
        SELECT category, COUNT(*)::int AS count
        FROM females
        WHERE category IS NOT NULL
        GROUP BY category
      ),
      covers AS (
        SELECT DISTINCT ON (category)
          category,
          user_id AS cover_user_id,
          (photos->>0) AS cover_photo_url
        FROM females
        WHERE category IS NOT NULL
        ORDER BY category, RANDOM()
      ),
      meta AS (
        SELECT name, emoji
        FROM profile_categories
        WHERE is_active = true
      )
      SELECT
        c.category,
        c.count,
        v.cover_user_id,
        v.cover_photo_url,
        m.emoji
      FROM counts c
      INNER JOIN covers v USING (category)
      LEFT JOIN meta m
        ON LOWER(TRIM(c.category)) = LOWER(TRIM(m.name))
      ORDER BY c.count DESC, c.category ASC
    `;

    return Response.json({ categories: rows });
  } catch (error) {
    console.error("[DISCOVER] categories error:", error);
    return Response.json(
      { error: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}
