import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");

    if (!userIdRaw) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, email, status, cooldown_until, screening_phase, updated_at, created_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const u = rows[0];

    return Response.json({
      user: {
        id: u.id,
        email: u.email,
        status: u.status,
        screeningPhase: u.screening_phase,
        cooldownUntil: u.cooldown_until,
        updatedAt: u.updated_at,
        createdAt: u.created_at,
      },
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return Response.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
