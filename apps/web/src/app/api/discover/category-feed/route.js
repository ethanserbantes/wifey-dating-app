import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const categoryRaw = searchParams.get("category");
    const limitRaw = searchParams.get("limit");

    if (!userIdRaw) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const category = String(categoryRaw || "").trim();
    if (!category) {
      return Response.json({ error: "Category required" }, { status: 400 });
    }

    const limitNum = limitRaw ? Number(limitRaw) : 30;
    const limit = Number.isFinite(limitNum)
      ? Math.max(1, Math.min(60, limitNum))
      : 30;

    // This feed is strictly for browsing categories.
    // IMPORTANT RULE: only show ACTIVE female users in that category.
    // NOTE: fake profiles are admin-controlled and should be eligible even if they
    // don't have full verification metadata populated.
    const values = [];
    let i = 1;

    let query = `
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
      WHERE u.id != $${i++}
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
        AND NULLIF(TRIM(COALESCE(up.preferences->>'category', '')), '') IS NOT NULL
        AND LOWER(TRIM(up.preferences->>'category')) = LOWER($${i++})
        AND u.id NOT IN (
          SELECT to_user_id FROM profile_likes WHERE from_user_id = $1
        )
        AND u.id NOT IN (
          SELECT to_user_id FROM profile_passes WHERE from_user_id = $1
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
      ORDER BY RANDOM()
      LIMIT $${i++}
    `;

    values.push(userId);
    values.push(category);
    values.push(limit);

    const profiles = await sql(query, values);

    return Response.json({ profiles });
  } catch (error) {
    console.error("[DISCOVER] category feed error:", error);
    return Response.json(
      { error: "Failed to fetch category feed" },
      { status: 500 },
    );
  }
}
