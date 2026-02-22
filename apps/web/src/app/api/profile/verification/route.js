import sql from "@/app/api/utils/sql";
import { moderatePhotoWithGoogleVision } from "@/app/api/utils/photoModeration";

export async function POST(request) {
  try {
    const body = await request.json();
    const userIdNum = Number(body?.userId);
    const verificationPhotoUrl = String(
      body?.verificationPhotoUrl || "",
    ).trim();

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    if (!verificationPhotoUrl) {
      return Response.json(
        { error: "verificationPhotoUrl is required" },
        { status: 400 },
      );
    }

    // UGC safety: moderate before accepting/storing the selfie URL.
    // IMPORTANT: We allow "review" for verification selfies (false positives happen),
    // but we still hard-reject "reject".
    const mod = await moderatePhotoWithGoogleVision({
      userId: userIdNum,
      imageUrl: verificationPhotoUrl,
      purpose: "verification_photo",
    });

    if (!mod?.ok) {
      return Response.json(
        { error: mod?.error || "Moderation failed" },
        { status: 500 },
      );
    }

    if (!mod?.moderationSkipped && String(mod?.decision) === "reject") {
      return Response.json(
        {
          error:
            "That photo looks like it might be adult or unsafe content. Please take a different selfie.",
        },
        { status: 400 },
      );
    }

    // Upsert the profile and mark verification as pending.
    // NOTE: In our hybrid flow, we *still* start as pending; the server will auto-approve
    // after a short delay unless an admin manually denies.
    const rows = await sql`
      INSERT INTO user_profiles (
        user_id,
        display_name,
        verification_photo_url,
        verification_status,
        verification_submitted_at,
        verification_reviewed_at,
        is_verified,
        updated_at
      )
      VALUES (
        ${userIdNum},
        '',
        ${verificationPhotoUrl},
        'pending',
        NOW(),
        NULL,
        false,
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE
      SET verification_photo_url = EXCLUDED.verification_photo_url,
          verification_status = 'pending',
          verification_submitted_at = NOW(),
          verification_reviewed_at = NULL,
          is_verified = false,
          updated_at = NOW()
      RETURNING *
    `;

    return Response.json({
      profile: rows?.[0] || null,
      moderation: {
        decision: mod?.decision || null,
        safeSearch: mod?.safeSearch || null,
        moderationSkipped: !!mod?.moderationSkipped,
      },
    });
  } catch (error) {
    console.error("Error submitting verification photo:", error);
    return Response.json(
      { error: "Failed to submit verification photo" },
      { status: 500 },
    );
  }
}
