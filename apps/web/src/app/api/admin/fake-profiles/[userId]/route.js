import sql from "@/app/api/utils/sql";
import { notifyWaitlistForCandidate } from "@/app/api/utils/notifyWaitlist";

export async function PATCH(request, { params: { userId } }) {
  try {
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const body = await request.json();

    const displayName = body?.displayName;
    const age = body?.age;
    const gender = body?.gender;
    const bio = body?.bio;
    const location = body?.location;
    const isVisible = body?.isVisible;
    const isVerified = body?.isVerified;

    const categoryRaw = body?.category;
    const category = typeof categoryRaw === "string" ? categoryRaw.trim() : "";

    const isVerifiedBool = typeof isVerified === "boolean" ? isVerified : null;
    const verificationStatusForInsert =
      isVerifiedBool === true ? "approved" : "none";

    const photos = Array.isArray(body?.photos) ? body.photos : null;

    const preferencesRaw =
      body?.preferences && typeof body.preferences === "object"
        ? { ...body.preferences }
        : null;

    const preferences = preferencesRaw;

    // Backstop: allow category to be sent as a top-level field.
    if (preferences && category) {
      preferences.category = category;
    }

    // Ensure this user is actually marked as fake
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

    // NOTE: keep these as plain json strings so we can safely cast with ::jsonb in SQL.
    const photosJson = photos ? JSON.stringify(photos) : null;
    const prefsJson = preferences ? JSON.stringify(preferences) : null;

    // Single-statement update (avoid relying on sql.transaction callback semantics)
    const rows = await sql`
      WITH upserted AS (
        INSERT INTO user_profiles (
          user_id,
          display_name,
          age,
          gender,
          bio,
          photos,
          location,
          preferences,
          is_visible,
          is_verified,
          verification_status,
          verification_submitted_at,
          verification_reviewed_at,
          updated_at
        )
        VALUES (
          ${id},
          ${displayName ?? ""},
          ${age ?? null},
          ${gender ?? null},
          ${bio ?? ""},
          ${photosJson ?? "[]"}::jsonb,
          ${location ?? ""},
          ${prefsJson ?? "{}"}::jsonb,
          ${typeof isVisible === "boolean" ? isVisible : true},
          ${typeof isVerified === "boolean" ? isVerified : false},
          ${verificationStatusForInsert},
          CASE WHEN ${typeof isVerified === "boolean" && isVerified} THEN NOW() ELSE NULL END,
          CASE WHEN ${typeof isVerified === "boolean" && isVerified} THEN NOW() ELSE NULL END,
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET
          display_name = COALESCE(${displayName ?? null}, user_profiles.display_name),
          age = COALESCE(${age ?? null}, user_profiles.age),
          gender = COALESCE(${gender ?? null}, user_profiles.gender),
          bio = COALESCE(${bio ?? null}, user_profiles.bio),
          photos = COALESCE(${photosJson}::jsonb, user_profiles.photos),
          location = COALESCE(${location ?? null}, user_profiles.location),
          preferences = COALESCE(user_profiles.preferences, '{}'::jsonb) || COALESCE(${prefsJson}::jsonb, '{}'::jsonb),
          is_visible = COALESCE(${typeof isVisible === "boolean" ? isVisible : null}, user_profiles.is_visible),
          is_verified = COALESCE(${isVerifiedBool}, user_profiles.is_verified),
          verification_status = COALESCE(
            CASE
              WHEN ${isVerifiedBool} IS TRUE THEN 'approved'
              WHEN ${isVerifiedBool} IS FALSE THEN 'none'
              ELSE NULL
            END,
            user_profiles.verification_status
          ),
          verification_submitted_at = CASE
            WHEN ${isVerifiedBool} IS TRUE THEN COALESCE(user_profiles.verification_submitted_at, NOW())
            WHEN ${isVerifiedBool} IS FALSE THEN NULL
            ELSE user_profiles.verification_submitted_at
          END,
          verification_reviewed_at = CASE
            WHEN ${isVerifiedBool} IS TRUE THEN NOW()
            WHEN ${isVerifiedBool} IS FALSE THEN NULL
            ELSE user_profiles.verification_reviewed_at
          END,
          updated_at = NOW()
        RETURNING *
      ),
      updated_user AS (
        UPDATE users
        SET status = 'APPROVED', updated_at = NOW()
        WHERE id = ${id}
          AND COALESCE(screening_state_json->>'is_fake', 'false') = 'true'
        RETURNING id
      )
      SELECT (SELECT row_to_json(upserted) FROM upserted) AS profile
    `;

    // Best-effort: when a fake profile gets updated (often the moment it becomes swipeable),
    // notify users who are currently out of profiles.
    try {
      await notifyWaitlistForCandidate({ candidateUserId: id });
    } catch (e) {
      console.error("[PUSH][WAITLIST] notify error (fake-profiles update)", e);
    }

    return Response.json({ profile: rows[0]?.profile || null });
  } catch (error) {
    console.error("[ADMIN][FAKE_PROFILES][PATCH] Error:", error);
    return Response.json(
      { error: "Failed to update fake profile" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params: { userId } }) {
  try {
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    // Only delete fake users
    const rows = await sql`
      DELETE FROM users
      WHERE id = ${id}
        AND COALESCE(screening_state_json->>'is_fake', 'false') = 'true'
      RETURNING id
    `;

    if (rows.length === 0) {
      return Response.json(
        { error: "Fake profile not found" },
        { status: 404 },
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN][FAKE_PROFILES][DELETE] Error:", error);
    return Response.json(
      { error: "Failed to delete fake profile" },
      { status: 500 },
    );
  }
}
