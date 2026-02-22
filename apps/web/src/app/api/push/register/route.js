import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();

    const userId = Number(body?.userId);
    const expoPushToken =
      typeof body?.expoPushToken === "string" ? body.expoPushToken.trim() : "";
    const platform =
      typeof body?.platform === "string"
        ? body.platform.trim().slice(0, 50)
        : null;

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId must be a number" },
        { status: 400 },
      );
    }

    if (!expoPushToken) {
      return Response.json(
        { error: "expoPushToken is required" },
        { status: 400 },
      );
    }

    // Upsert by token (a device can change users during testing; keep it sane).
    await sql`
      INSERT INTO user_push_tokens (user_id, expo_push_token, platform, updated_at)
      VALUES (${userId}, ${expoPushToken}, ${platform}, NOW())
      ON CONFLICT (expo_push_token) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          platform = COALESCE(EXCLUDED.platform, user_push_tokens.platform),
          updated_at = NOW()
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[PUSH][REGISTER] Error:", error);
    return Response.json(
      { error: "Failed to register push token" },
      { status: 500 },
    );
  }
}
