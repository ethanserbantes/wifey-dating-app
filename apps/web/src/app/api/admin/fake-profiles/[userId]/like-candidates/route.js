import sql from "@/app/api/utils/sql";

function safeJsonParse(input, fallback) {
  if (!input) return fallback;
  if (typeof input === "object") return input;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

export async function GET(request, { params: { userId } }) {
  try {
    const fakeId = Number(userId);
    if (!Number.isFinite(fakeId)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get("search") || "").trim();

    // Ensure this is a fake profile
    const check = await sql`
      SELECT id
      FROM users
      WHERE id = ${fakeId}
        AND COALESCE(screening_state_json->>'is_fake', 'false') = 'true'
      LIMIT 1
    `;

    if (check.length === 0) {
      return Response.json(
        { error: "Fake profile not found" },
        { status: 404 },
      );
    }

    const limit = 20;

    let query = `
      SELECT
        u.id,
        u.email,
        -- Prefer the in-app profile name, but fall back to auth_users.name if onboarding wasn't completed.
        COALESCE(NULLIF(up.display_name, ''), NULLIF(au.name, '')) AS display_name,
        up.age,
        up.gender,
        up.photos,
        (pl.id IS NOT NULL) AS liked_by_fake,
        m.id AS match_id,
        (pl_user.id IS NOT NULL) AS liked_fake_by_user,
        (pp_user.id IS NOT NULL) AS passed_fake_by_user
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN auth_users au ON au.email = u.email
      LEFT JOIN profile_likes pl
        ON pl.from_user_id = $1
       AND pl.to_user_id = u.id
      LEFT JOIN matches m
        ON m.user1_id = LEAST($1, u.id)
       AND m.user2_id = GREATEST($1, u.id)
      LEFT JOIN profile_likes pl_user
        ON pl_user.from_user_id = u.id
       AND pl_user.to_user_id = $1
      LEFT JOIN profile_passes pp_user
        ON pp_user.from_user_id = u.id
       AND pp_user.to_user_id = $1
      WHERE u.id <> $1
        AND COALESCE(u.screening_state_json->>'is_fake', 'false') <> 'true'
    `;

    const params = [fakeId];
    let paramIndex = 2;

    // Allow searching by id, email, or name
    const numericId = search && /^\d+$/.test(search) ? Number(search) : null;

    if (search) {
      query += ` AND (
        u.email ILIKE $${paramIndex}
        OR COALESCE(up.display_name, '') ILIKE $${paramIndex}
        OR COALESCE(au.name, '') ILIKE $${paramIndex}
      `;
      params.push(`%${search}%`);
      paramIndex++;

      if (Number.isFinite(numericId)) {
        query += ` OR u.id = $${paramIndex}`;
        params.push(numericId);
        paramIndex++;
      }

      query += ` )`;
    }

    // Better UX:
    // - when searching, order A→Z
    // - when not searching, show most recent users first
    if (search) {
      query += `
        ORDER BY COALESCE(NULLIF(up.display_name, ''), NULLIF(au.name, ''), u.email) ASC
      `;
    } else {
      query += `
        ORDER BY u.created_at DESC
      `;
    }

    query += `
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const rows = await sql(query, params);

    const users = (rows || []).map((r) => ({
      ...r,
      liked_by_fake: Boolean(r?.liked_by_fake),
      liked_fake_by_user: Boolean(r?.liked_fake_by_user),
      passed_fake_by_user: Boolean(r?.passed_fake_by_user),
      photos: safeJsonParse(r?.photos, []),
    }));

    return Response.json({ users });
  } catch (error) {
    console.error("[ADMIN][FAKE_PROFILES][LIKE_CANDIDATES][GET] Error:", error);
    return Response.json(
      { error: "Failed to load like candidates" },
      { status: 500 },
    );
  }
}
