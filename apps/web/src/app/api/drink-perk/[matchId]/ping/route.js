import sql from "@/app/api/utils/sql";

async function assertMatchAccess(matchIdNum, userIdNum) {
  const accessRows = await sql`
    SELECT m.id, m.user1_id, m.user2_id
    FROM matches m
    WHERE m.id = ${matchIdNum}
      AND (${userIdNum} = m.user1_id OR ${userIdNum} = m.user2_id)
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE (b.blocker_user_id = ${userIdNum} AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END))
           OR (b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END) AND b.blocked_user_id = ${userIdNum})
      )
    LIMIT 1
  `;

  if (accessRows.length === 0) {
    return null;
  }

  return accessRows[0];
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const userIdNum = Number(body?.userId);
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const accuracyM = body?.accuracyM != null ? Number(body.accuracyM) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: "Invalid location" }, { status: 400 });
    }

    await sql`
      INSERT INTO user_location_latest (user_id, lat, lng, accuracy_m, captured_at)
      VALUES (${userIdNum}, ${lat}, ${lng}, ${accuracyM}, now())
      ON CONFLICT (user_id)
      DO UPDATE SET
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        accuracy_m = EXCLUDED.accuracy_m,
        captured_at = now()
    `;

    // Return the refreshed perk state (GET does the evaluation)
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error pinging location:", error);
    return Response.json({ error: "Failed to ping" }, { status: 500 });
  }
}
