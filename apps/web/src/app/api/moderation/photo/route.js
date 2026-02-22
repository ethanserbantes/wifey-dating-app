import { moderatePhotoWithGoogleVision } from "@/app/api/utils/photoModeration";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const userId = body?.userId;
    const imageUrl = body?.imageUrl;
    const purpose = body?.purpose;

    const result = await moderatePhotoWithGoogleVision({
      userId,
      imageUrl,
      purpose,
    });

    if (!result?.ok) {
      return Response.json(
        { error: result?.error || "Moderation failed" },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      decision: result.decision,
      safeSearch: result.safeSearch,
      // NEW: if Vision is disabled/misconfigured, we won't block uploads.
      moderationSkipped: !!result.moderationSkipped,
    });
  } catch (e) {
    console.error("[MODERATION] /api/moderation/photo error", e);
    return Response.json({ error: "Moderation failed" }, { status: 500 });
  }
}
