import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = Number(body?.userId);
    const platform = body?.platform ? String(body.platform).slice(0, 40) : null;

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "userId required" }, { status: 400 });
    }

    await sql`
      INSERT INTO user_presence_latest (user_id, last_seen_at, platform, updated_at)
      VALUES (${userId}, now(), ${platform}, now())
      ON CONFLICT (user_id)
      DO UPDATE SET
        last_seen_at = EXCLUDED.last_seen_at,
        platform = EXCLUDED.platform,
        updated_at = EXCLUDED.updated_at
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error updating presence:", error);
    return Response.json(
      { error: "Failed to update presence" },
      { status: 500 },
    );
  }
}
