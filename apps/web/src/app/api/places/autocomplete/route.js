function mapPredictions(preds) {
  const arr = Array.isArray(preds) ? preds : [];
  return arr
    .map((p) => {
      const placeId = p?.place_id;
      const primary = p?.structured_formatting?.main_text || p?.description;
      const secondary = p?.structured_formatting?.secondary_text || "";
      const description = p?.description || "";

      if (!placeId || !primary) {
        return null;
      }

      return {
        placeId,
        primary,
        secondary,
        description,
      };
    })
    .filter(Boolean);
}

function mapPredictionsNew(suggestions) {
  const arr = Array.isArray(suggestions) ? suggestions : [];
  return arr
    .map((s) => {
      const pp = s?.placePrediction;
      if (!pp) return null;

      const placeId = pp?.placeId;
      const primary =
        pp?.structuredFormat?.mainText?.text || pp?.text?.text || "";
      const secondary = pp?.structuredFormat?.secondaryText?.text || "";
      const description = pp?.text?.text || "";

      if (!placeId || !String(primary || "").trim()) {
        return null;
      }

      return {
        placeId,
        primary,
        secondary,
        description,
      };
    })
    .filter(Boolean);
}

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

export async function GET(request) {
  try {
    // Use a server key for Places web service calls.
    // A browser-restricted (HTTP referrer) key will fail with:
    // "API keys with referrer restrictions cannot be used with this API."
    const serverKey =
      process.env.GOOGLE_MAPS_SERVER_API_KEY ||
      process.env.WIFEY_GOOGLE_API_KEY;

    const url = new URL(request.url);
    const input = String(url.searchParams.get("input") || "").trim();
    const types = String(
      url.searchParams.get("types") || "establishment",
    ).trim();

    if (input.length < 2) {
      return Response.json({ predictions: [] });
    }

    const tryIntegrationFallback = async () => {
      const integrationUrl = `/integrations/google-place-autocomplete/autocomplete/json?input=${encodeURIComponent(
        input,
      )}&radius=500`;

      const resp = await fetch(integrationUrl, { method: "GET" });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `When fetching ${integrationUrl}, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      const json = await resp.json();
      const preds = Array.isArray(json?.predictions) ? json.predictions : [];
      return Response.json({ predictions: mapPredictions(preds) });
    };

    // If we don't have a proper server key, fall back to the built-in integration
    // (no user-managed Google key required).
    if (!serverKey) {
      return await tryIntegrationFallback();
    }

    // Prefer Places API (New). This avoids the legacy Places endpoints that can be
    // disabled on newer Google projects.
    const newUrl = "https://places.googleapis.com/v1/places:autocomplete";
    // Places API (New): only pass includedPrimaryTypes when it's actually a supported value.
    // For our location inputs, the caller typically uses "(cities)".
    const includedPrimaryTypes =
      types && types !== "establishment" ? [types] : undefined;

    const newResp = await fetch(newUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": serverKey,
        // Only request fields we need.
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input,
        includedPrimaryTypes,
      }),
    });

    if (newResp.ok) {
      const json = await readJsonSafely(newResp);
      const suggestions = Array.isArray(json?.suggestions)
        ? json.suggestions
        : [];
      return Response.json({ predictions: mapPredictionsNew(suggestions) });
    }

    // If Places API (New) fails (not enabled, bad key restrictions, etc),
    // try the Anything integration. That keeps the app working even if a user's
    // Google Cloud project isn't set up perfectly.
    const newText = await newResp.text();
    const newJson = await readJsonSafely(
      new Response(newText, { headers: newResp.headers }),
    );
    const newMessage = extractErrorMessage(newJson, newText);
    const newMessageLower = String(newMessage || "").toLowerCase();

    if (
      newMessageLower.includes("referrer") ||
      newMessageLower.includes("not enabled") ||
      newMessageLower.includes("disabled") ||
      newMessageLower.includes("has not been used") ||
      newMessageLower.includes("service is not enabled")
    ) {
      return await tryIntegrationFallback();
    }

    // Last resort: try legacy Places Autocomplete (old endpoint). Some keys/projects
    // still only have the legacy API enabled.
    const legacyUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input,
    )}&types=${encodeURIComponent(types)}&key=${encodeURIComponent(serverKey)}`;

    const legacyResp = await fetch(legacyUrl);
    const legacyJson = await readJsonSafely(legacyResp);
    const legacyStatus = String(legacyJson?.status || "");
    const legacyMessage = String(legacyJson?.error_message || "").trim();

    if (
      legacyResp.ok &&
      (legacyStatus === "OK" || legacyStatus === "ZERO_RESULTS")
    ) {
      return Response.json({
        predictions: mapPredictions(legacyJson?.predictions),
      });
    }

    // If legacy specifically complains about being disabled, the integration is our best bet.
    if (legacyMessage && legacyMessage.toLowerCase().includes("legacyapi")) {
      return await tryIntegrationFallback();
    }

    return Response.json(
      {
        error: "Google Places error",
        status: legacyStatus || "UNKNOWN",
        message: legacyMessage || newMessage || null,
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error in places autocomplete:", error);
    return Response.json({ error: "Failed to search places" }, { status: 500 });
  }
}
