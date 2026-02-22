import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    const rows = await sql`
      SELECT user_id, tier, expires_at, created_at, updated_at
      FROM user_subscription_overrides
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ override: null });
    }

    const row = rows[0];

    // If expired, treat as no override.
    if (row.expires_at) {
      const exp = new Date(row.expires_at);
      if (Number.isFinite(exp.getTime()) && exp.getTime() <= Date.now()) {
        return Response.json({ override: null });
      }
    }

    return Response.json({
      override: {
        userId: row.user_id,
        tier: row.tier,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Error reading subscription override:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
