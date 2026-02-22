import sql from "@/app/api/utils/sql";
import { notifyWaitlistForCandidate } from "@/app/api/utils/notifyWaitlist";
import { ensurePhotosApproved } from "@/app/api/utils/photoModeration";

const AUTO_APPROVE_AFTER_MS = 3500;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    // Auto-approve (hybrid flow): after a short delay, treat pending selfies as approved
    // unless an admin already reviewed it.
    try {
      await sql`
        UPDATE user_profiles
        SET is_verified = true,
            verification_status = 'approved',
            updated_at = NOW()
        WHERE user_id = ${userId}
          AND is_verified = false
          AND verification_status = 'pending'
          AND verification_reviewed_at IS NULL
          AND verification_submitted_at IS NOT NULL
          AND verification_submitted_at <= NOW() - (${AUTO_APPROVE_AFTER_MS}::int * INTERVAL '1 millisecond')
      `;
    } catch (e) {
      console.error("[VERIFY] auto-approve update failed", e);
    }

    const profile = await sql`
      SELECT 
        up.*,
        u.email
      FROM user_profiles up
      INNER JOIN users u ON up.user_id = u.id
      WHERE up.user_id = ${userId}
    `;

    if (profile.length === 0) {
      return Response.json({ profile: null });
    }

    return Response.json({ profile: profile[0] });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return Response.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const {
      userId,
      displayName,
      age,
      gender,
      bio,
      photos,
      location,
      preferences,
      lat,
      lng,
      phoneNumber,
    } = body || {};

    if (!userId) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    // Apple UGC safety: if the client is attempting to save photos, validate them.
    if (Array.isArray(photos) && photos.length > 0) {
      const mod = await ensurePhotosApproved({
        userId: Number(userId),
        imageUrls: photos,
        purpose: "profile_photo",
      });

      if (!mod?.ok) {
        return Response.json(
          { error: mod?.error || "Photo rejected" },
          { status: 400 },
        );
      }
    }

    const phoneTrimmed =
      typeof phoneNumber === "string" ? phoneNumber.trim().slice(0, 50) : null;

    // IMPORTANT: treat omitted fields as NULL so we don't overwrite existing profile values
    // when doing partial updates (ex: saving location coordinates).
    const photosJson = Array.isArray(photos) ? JSON.stringify(photos) : null;
    const prefsJson =
      preferences && typeof preferences === "object"
        ? JSON.stringify(preferences)
        : null;

    const latNum =
      lat === null || lat === undefined || lat === "" ? null : Number(lat);
    const lngNum =
      lng === null || lng === undefined || lng === "" ? null : Number(lng);

    if (latNum !== null && !Number.isFinite(latNum)) {
      return Response.json({ error: "Invalid lat" }, { status: 400 });
    }
    if (lngNum !== null && !Number.isFinite(lngNum)) {
      return Response.json({ error: "Invalid lng" }, { status: 400 });
    }

    // Upsert profile
    // NOTE: preferences are merged on update (existing || new)
    const result = await sql`
      INSERT INTO user_profiles (user_id, display_name, age, gender, bio, photos, location, preferences, lat, lng, phone_number, updated_at)
      VALUES (
        ${userId},
        ${displayName || ""},
        ${age ?? null},
        ${gender ?? null},
        ${bio || ""},
        COALESCE(${photosJson}::jsonb, '[]'::jsonb),
        ${location || ""},
        COALESCE(${prefsJson}::jsonb, '{}'::jsonb),
        ${latNum},
        ${lngNum},
        ${phoneTrimmed},
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
        lat = COALESCE(${latNum}, user_profiles.lat),
        lng = COALESCE(${lngNum}, user_profiles.lng),
        phone_number = COALESCE(${phoneTrimmed}, user_profiles.phone_number),
        updated_at = NOW()
      RETURNING *
    `;

    // Fire the waitlist notifications when a user becomes "available" (approved + visible + has coords).
    try {
      await notifyWaitlistForCandidate({ candidateUserId: Number(userId) });
    } catch (e) {
      console.error("[PUSH][WAITLIST] notify error", e);
    }

    return Response.json({ profile: result[0] });
  } catch (error) {
    console.error("Error updating profile:", error);
    return Response.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
