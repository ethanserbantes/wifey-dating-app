import sql from "@/app/api/utils/sql";

function normalizeTier(tier) {
  const t = String(tier || "")
    .toLowerCase()
    .trim();
  if (t === "serious") return "serious";
  if (t === "committed") return "committed";
  if (t === "none" || t === "" || t === "null") return null;
  return null;
}

function parseExpiresAt(expiresAtRaw) {
  if (expiresAtRaw == null || expiresAtRaw === "") return null;
  const dt = new Date(expiresAtRaw);
  if (!Number.isFinite(dt.getTime())) return null;
  // Store as timestamp without tz; we pass a JS Date which the driver will serialize.
  return dt;
}

export async function GET(_request, { params }) {
  try {
    const userId = Number(params.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    const rows = await sql`
      SELECT user_id, tier, expires_at, created_by_admin_id, created_at, updated_at
      FROM user_subscription_overrides
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const row = rows?.[0] || null;
    if (!row) {
      return Response.json({ override: null });
    }

    return Response.json({
      override: {
        userId: row.user_id,
        tier: row.tier,
        expiresAt: row.expires_at,
        createdByAdminId: row.created_by_admin_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Error fetching subscription override:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const userId = Number(params.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const tier = normalizeTier(body?.tier);
    const expiresAt = parseExpiresAt(body?.expiresAt);

    // Optional (admin panel can pass it, but we don't require it)
    const createdByAdminIdRaw = body?.createdByAdminId;
    const createdByAdminId = Number(createdByAdminIdRaw);
    const createdByAdminIdSafe = Number.isFinite(createdByAdminId)
      ? createdByAdminId
      : null;

    if (!tier) {
      // Treat as "clear override"
      await sql`
        DELETE FROM user_subscription_overrides
        WHERE user_id = ${userId}
      `;
      return Response.json({ success: true, override: null });
    }

    const rows = await sql`
      INSERT INTO user_subscription_overrides (user_id, tier, expires_at, created_by_admin_id, created_at, updated_at)
      VALUES (${userId}, ${tier}, ${expiresAt}, ${createdByAdminIdSafe}, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET tier = EXCLUDED.tier,
          expires_at = EXCLUDED.expires_at,
          created_by_admin_id = COALESCE(EXCLUDED.created_by_admin_id, user_subscription_overrides.created_by_admin_id),
          updated_at = NOW()
      RETURNING user_id, tier, expires_at, created_by_admin_id, created_at, updated_at
    `;

    return Response.json({
      success: true,
      override: {
        userId: rows[0].user_id,
        tier: rows[0].tier,
        expiresAt: rows[0].expires_at,
        createdByAdminId: rows[0].created_by_admin_id,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error("Error updating subscription override:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const userId = Number(params.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    await sql`
      DELETE FROM user_subscription_overrides
      WHERE user_id = ${userId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting subscription override:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
