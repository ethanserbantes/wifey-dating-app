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

export async function GET(request) {
  try {
    // In some runtimes, request.url can be a relative path (e.g. "/api/...") which
    // would throw with `new URL(request.url)`. Fall back to a safe base.
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url);
    } catch (e) {
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

    // Fallback: if the client passes email (or userId is stale), map email → users.id.
    // This helps when the mobile app has an old cached id or different auth source.
    if (email) {
      const rows = await sql`
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER(${email})
        LIMIT 1
      `;
      const idFromEmail = rows?.[0]?.id;
      if (Number.isFinite(idFromEmail)) {
        // Prefer the email lookup (it’s the most stable identifier).
        userId = Number(idFromEmail);
      }
    }

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "User ID (or email) required" },
        { status: 400 },
      );
    }

    // Likes tab = "they liked me".
    // We exclude:
    // - people I already liked
    // - anyone I'm already matched with
    // - anyone I've blocked (or who blocked me)
    //
    // NOTE: We intentionally DO NOT exclude people I previously passed here.
    // If someone likes you after you passed them, we still show it so you can reconsider.
    const rows = await sql`
      SELECT 
        u.id,
        COALESCE(NULLIF(up.display_name, ''), NULLIF(au.name, ''), u.email) AS display_name,
        up.age,
        up.gender,
        up.bio,
        COALESCE(up.photos, '[]'::jsonb) AS photos,
        up.location,
        pl.created_at as liked_at,
        (pp.id IS NOT NULL) AS passed_by_me
      FROM profile_likes pl
      INNER JOIN users u ON pl.from_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN auth_users au ON au.email = u.email
      LEFT JOIN profile_passes pp
        ON pp.from_user_id = ${userId}
       AND pp.to_user_id = pl.from_user_id
      WHERE pl.to_user_id = ${userId}
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
    }));

    return Response.json({ likes, resolvedUserId: userId });
  } catch (error) {
    console.error("Error fetching likes:", error);
    return Response.json({ error: "Failed to fetch likes" }, { status: 500 });
  }
}
