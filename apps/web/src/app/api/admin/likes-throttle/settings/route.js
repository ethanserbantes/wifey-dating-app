import sql from "@/app/api/utils/sql";
import { getLikeThrottleConfig } from "@/app/api/utils/likeThrottle";

export async function GET() {
  try {
    const rows = await sql`
      SELECT config_json, updated_at
      FROM like_throttle_settings
      WHERE id = 1
      LIMIT 1
    `;

    const configJson = rows?.[0]?.config_json || {};
    const updatedAt = rows?.[0]?.updated_at || null;

    // Also return the normalized/effective config so the UI shows what actually applies.
    const effective = await getLikeThrottleConfig();

    return Response.json({ config: configJson, effective, updatedAt });
  } catch (e) {
    console.error("GET /api/admin/likes-throttle/settings error:", e);
    return Response.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const next = body?.config;

    if (!next || typeof next !== "object") {
      return Response.json(
        { error: "config object required" },
        { status: 400 },
      );
    }

    await sql`
      INSERT INTO like_throttle_settings (id, config_json, updated_at)
      VALUES (1, ${JSON.stringify(next)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
      SET config_json = EXCLUDED.config_json,
          updated_at = NOW()
    `;

    const effective = await getLikeThrottleConfig();

    return Response.json({ success: true, effective });
  } catch (e) {
    console.error("PUT /api/admin/likes-throttle/settings error:", e);
    return Response.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
