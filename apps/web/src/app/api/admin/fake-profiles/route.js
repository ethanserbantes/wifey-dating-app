import sql from "@/app/api/utils/sql";
import { hash } from "argon2";
import { notifyWaitlistForCandidate } from "@/app/api/utils/notifyWaitlist";

function safeJsonParse(input, fallback) {
  if (!input) return fallback;
  if (typeof input === "object") return input;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function randomFakeEmail() {
  // Unique-ish and readable. Must be unique due to DB constraint.
  const stamp = Date.now();
  const rand = Math.random().toString(16).slice(2, 8);
  return `fake+${stamp}.${rand}@wifey.local`;
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        u.id as user_id,
        u.email,
        u.status,
        u.created_at as user_created_at,
        up.display_name,
        up.age,
        up.gender,
        up.bio,
        up.photos,
        up.location,
        up.preferences,
        up.is_visible,
        up.is_verified,
        up.verification_status,
        up.updated_at as profile_updated_at,
        (
          SELECT COUNT(*)::int
          FROM profile_likes pl
          WHERE pl.to_user_id = u.id
        ) AS likes_count,
        (
          SELECT MAX(pl.created_at)
          FROM profile_likes pl
          WHERE pl.to_user_id = u.id
        ) AS last_like_at
      FROM users u
      INNER JOIN user_profiles up ON up.user_id = u.id
      WHERE COALESCE(u.screening_state_json->>'is_fake', 'false') = 'true'
      ORDER BY up.updated_at DESC NULLS LAST, u.created_at DESC
      LIMIT 500
    `;

    return Response.json({ profiles: rows });
  } catch (error) {
    console.error("[ADMIN][FAKE_PROFILES][GET] Error:", error);
    return Response.json(
      {
        error: "Failed to list fake profiles",
        details:
          process.env.NODE_ENV !== "production"
            ? error?.message || String(error)
            : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const displayName = (body?.displayName || "").trim();
    const age = body?.age ?? null;
    const gender = body?.gender ?? null;
    const bio = body?.bio ?? "";
    const location = body?.location ?? "";
    const isVisible = body?.isVisible ?? true;
    const isVerified = body?.isVerified ?? false;

    const categoryRaw = body?.category;
    const category = typeof categoryRaw === "string" ? categoryRaw.trim() : "";

    // Ensure verification fields are consistent with what Discover expects.
    // Discover currently filters on BOTH is_verified=true AND verification_status='approved'
    // (unless the user is marked fake, but we still keep this consistent).
    const verificationStatus = Boolean(isVerified) ? "approved" : "none";

    const photos = Array.isArray(body?.photos) ? body.photos : [];

    const preferences =
      body?.preferences && typeof body.preferences === "object"
        ? { ...body.preferences }
        : {};

    // Backstop: allow category to be sent as a top-level field.
    if (category) {
      preferences.category = category;
    }

    if (!displayName) {
      return Response.json(
        { error: "Display name is required" },
        { status: 400 },
      );
    }

    const parsedAge =
      age === null || age === undefined || age === "" ? null : Number(age);
    if (parsedAge !== null && !Number.isFinite(parsedAge)) {
      return Response.json({ error: "Invalid age" }, { status: 400 });
    }

    const email = randomFakeEmail();
    const passwordHash = await hash(`fake-${email}-${Date.now()}`);

    const photosJson = JSON.stringify(photos);
    const prefsJson = JSON.stringify(preferences);
    const isFakeJson = JSON.stringify({ is_fake: true });

    // Single-statement create (safer than relying on sql.transaction callback semantics)
    const rows = await sql`
      WITH new_user AS (
        INSERT INTO users (email, password_hash, status, screening_state_json, updated_at)
        VALUES (
          ${email},
          ${passwordHash},
          'APPROVED',
          ${isFakeJson}::jsonb,
          NOW()
        )
        RETURNING id, email, status, created_at, updated_at
      ),
      new_profile AS (
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
        SELECT
          new_user.id,
          ${displayName},
          ${parsedAge},
          ${gender},
          ${bio},
          ${photosJson}::jsonb,
          ${location},
          ${prefsJson}::jsonb,
          ${Boolean(isVisible)},
          ${Boolean(isVerified)},
          ${verificationStatus},
          CASE WHEN ${Boolean(isVerified)} THEN NOW() ELSE NULL END,
          CASE WHEN ${Boolean(isVerified)} THEN NOW() ELSE NULL END,
          NOW()
        FROM new_user
        RETURNING *
      )
      SELECT
        (SELECT row_to_json(new_user) FROM new_user) AS user,
        (SELECT row_to_json(new_profile) FROM new_profile) AS profile
    `;

    const created = rows[0];
    const profile = created?.profile || null;

    const normalized = {
      user: created?.user || null,
      profile: profile
        ? {
            ...profile,
            photos: safeJsonParse(profile.photos, []),
            preferences: safeJsonParse(profile.preferences, {}),
          }
        : null,
    };

    // Best-effort: if a new (fake) profile just became swipeable, notify users who were out of profiles.
    try {
      const newUserId = created?.user?.id;
      if (newUserId != null) {
        await notifyWaitlistForCandidate({
          candidateUserId: Number(newUserId),
        });
      }
    } catch (e) {
      console.error("[PUSH][WAITLIST] notify error (fake-profiles create)", e);
    }

    return Response.json(normalized);
  } catch (error) {
    console.error("[ADMIN][FAKE_PROFILES][POST] Error:", error);
    return Response.json(
      {
        error: "Failed to create fake profile",
        details:
          process.env.NODE_ENV !== "production"
            ? error?.message || String(error)
            : undefined,
      },
      { status: 500 },
    );
  }
}
