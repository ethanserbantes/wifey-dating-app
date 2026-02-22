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
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    // Ensure this is a fake profile
    const check = await sql`
      SELECT id
      FROM users
      WHERE id = ${id}
        AND COALESCE(screening_state_json->>'is_fake', 'false') = 'true'
      LIMIT 1
    `;

    if (check.length === 0) {
      return Response.json(
        { error: "Fake profile not found" },
        { status: 404 },
      );
    }

    const rows = await sql`
      SELECT
        pl.id,
        pl.from_user_id,
        pl.to_user_id,
        pl.section_type,
        pl.section_key,
        pl.comment_text,
        pl.created_at,

        u.email AS from_email,
        up.display_name AS from_display_name,
        up.age AS from_age,
        up.photos AS from_photos,

        m.id AS match_id,
        m.created_at AS match_created_at
      FROM profile_likes pl
      INNER JOIN users u ON u.id = pl.from_user_id
      LEFT JOIN user_profiles up ON up.user_id = pl.from_user_id
      LEFT JOIN matches m
        ON m.user1_id = LEAST(pl.from_user_id, pl.to_user_id)
       AND m.user2_id = GREATEST(pl.from_user_id, pl.to_user_id)
      WHERE pl.to_user_id = ${id}
      ORDER BY pl.created_at DESC
      LIMIT 200
    `;

    const likes = (rows || []).map((r) => ({
      ...r,
      from_photos: safeJsonParse(r.from_photos, []),
    }));

    return Response.json({ likes });
  } catch (error) {
    console.error("[ADMIN][FAKE_PROFILES][LIKES][GET] Error:", error);
    return Response.json(
      { error: "Failed to load likes for fake profile" },
      { status: 500 },
    );
  }
}
