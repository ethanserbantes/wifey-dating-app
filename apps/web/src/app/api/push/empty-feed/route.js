import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();

    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId must be a number" },
        { status: 400 },
      );
    }

    const radiusMilesRaw = body?.radiusMiles;
    const radiusMilesNum =
      radiusMilesRaw == null ? null : Number(radiusMilesRaw);
    const radiusMiles =
      Number.isFinite(radiusMilesNum) && radiusMilesNum > 0
        ? Math.min(500, Math.max(1, Math.round(radiusMilesNum)))
        : 50;

    // Prefer explicit coords from the client, else use profile coords, else last known location.
    const latFromBody = body?.lat;
    const lngFromBody = body?.lng;

    const latNum =
      latFromBody === null || latFromBody === undefined || latFromBody === ""
        ? null
        : Number(latFromBody);
    const lngNum =
      lngFromBody === null || lngFromBody === undefined || lngFromBody === ""
        ? null
        : Number(lngFromBody);

    let lat = Number.isFinite(latNum) ? latNum : null;
    let lng = Number.isFinite(lngNum) ? lngNum : null;

    if (lat === null || lng === null) {
      const rows = await sql`
        SELECT lat, lng
        FROM user_profiles
        WHERE user_id = ${userId}
        LIMIT 1
      `;
      const row = rows?.[0];
      const lat2 = row?.lat;
      const lng2 = row?.lng;
      lat = Number.isFinite(lat2) ? Number(lat2) : lat;
      lng = Number.isFinite(lng2) ? Number(lng2) : lng;
    }

    // Fallback: if the user hasn't set profile coords yet, use last captured location.
    if (lat === null || lng === null) {
      const locRows = await sql`
        SELECT lat, lng
        FROM user_location_latest
        WHERE user_id = ${userId}
        LIMIT 1
      `;
      const loc = locRows?.[0];
      const lat3 = loc?.lat;
      const lng3 = loc?.lng;
      lat = Number.isFinite(lat3) ? Number(lat3) : lat;
      lng = Number.isFinite(lng3) ? Number(lng3) : lng;
    }

    await sql`
      INSERT INTO feed_waitlist (user_id, lat, lng, radius_miles, created_at, notified_at)
      VALUES (${userId}, ${lat}, ${lng}, ${radiusMiles}, NOW(), NULL)
      ON CONFLICT (user_id) DO UPDATE
      SET lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          radius_miles = EXCLUDED.radius_miles,
          created_at = NOW(),
          notified_at = NULL
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[PUSH][EMPTY_FEED][POST] Error:", error);
    return Response.json(
      { error: "Failed to register empty-feed notification" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();

    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId must be a number" },
        { status: 400 },
      );
    }

    await sql`
      DELETE FROM feed_waitlist
      WHERE user_id = ${userId}
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[PUSH][EMPTY_FEED][DELETE] Error:", error);
    return Response.json(
      { error: "Failed to clear empty-feed notification" },
      { status: 500 },
    );
  }
}
