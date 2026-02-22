async function readJsonSafely(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(jsonOrNull, textOrNull) {
  const msg =
    jsonOrNull?.error?.message ||
    jsonOrNull?.message ||
    jsonOrNull?.error_message ||
    null;
  const text = String(textOrNull || "").trim();
  return String(msg || text || "").trim();
}

function normalizeLatLng(lat, lng) {
  const latNum = typeof lat === "number" ? lat : Number(lat);
  const lngNum = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return null;
  }
  // Basic sanity bounds
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return null;
  }
  return { lat: latNum, lng: lngNum };
}

export async function GET(request) {
  try {
    const serverKey =
      process.env.GOOGLE_MAPS_SERVER_API_KEY ||
      process.env.WIFEY_GOOGLE_API_KEY;

    const url = new URL(request.url);
    const placeId = String(url.searchParams.get("placeId") || "").trim();

    if (!placeId) {
      return Response.json({ error: "placeId required" }, { status: 400 });
    }

    if (!serverKey) {
      return Response.json(
        {
          error: "Google Places key not configured",
          message:
            "Missing server-side Google key (GOOGLE_MAPS_SERVER_API_KEY or WIFEY_GOOGLE_API_KEY)",
        },
        { status: 400 },
      );
    }

    // Prefer Places API (New)
    const newUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(
      placeId,
    )}`;

    const newResp = await fetch(newUrl, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": serverKey,
        "X-Goog-FieldMask": "location,displayName,formattedAddress",
      },
    });

    if (newResp.ok) {
      const json = await readJsonSafely(newResp);
      const loc = json?.location;
      const coords = normalizeLatLng(loc?.latitude, loc?.longitude);

      if (!coords) {
        return Response.json(
          { error: "Place details missing location" },
          { status: 400 },
        );
      }

      const displayName = String(json?.displayName?.text || "").trim();
      const formatted = String(json?.formattedAddress || "").trim();
      const label = displayName || formatted || placeId;

      return Response.json({
        placeId,
        label,
        lat: coords.lat,
        lng: coords.lng,
      });
    }

    // Fallback: legacy Place Details API (some projects still use it)
    const newText = await newResp.text();
    const newJson = await readJsonSafely(
      new Response(newText, { headers: newResp.headers }),
    );
    const newMessage = extractErrorMessage(newJson, newText);

    const legacyUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      placeId,
    )}&fields=geometry,name,formatted_address&key=${encodeURIComponent(
      serverKey,
    )}`;

    const legacyResp = await fetch(legacyUrl);
    const legacyJson = await readJsonSafely(legacyResp);

    if (legacyResp.ok) {
      const status = String(legacyJson?.status || "");
      const result = legacyJson?.result;

      if (status === "OK" && result) {
        const coords = normalizeLatLng(
          result?.geometry?.location?.lat,
          result?.geometry?.location?.lng,
        );

        if (!coords) {
          return Response.json(
            { error: "Place details missing location" },
            { status: 400 },
          );
        }

        const name = String(result?.name || "").trim();
        const formatted = String(result?.formatted_address || "").trim();
        const label = name || formatted || placeId;

        return Response.json({
          placeId,
          label,
          lat: coords.lat,
          lng: coords.lng,
        });
      }

      const errMsg = String(legacyJson?.error_message || "").trim();
      return Response.json(
        {
          error: "Google Place Details error",
          status,
          message: errMsg || newMessage || null,
        },
        { status: 400 },
      );
    }

    return Response.json(
      {
        error: "Failed to fetch place details",
        message: newMessage || null,
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error in places details:", error);
    return Response.json(
      { error: "Failed to get place details" },
      { status: 500 },
    );
  }
}
