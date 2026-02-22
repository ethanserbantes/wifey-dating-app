import sql from "@/app/api/utils/sql";

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

function getVisionApiKey() {
  // We re-use your existing server-side Google key(s). In many setups, Vision is enabled
  // in the same GCP project. If it's not enabled / key is restricted, the endpoint will 4xx.
  const key =
    process.env.WIFEY_GOOGLE_API_KEY ||
    process.env.WIFEY_GOOGLE_API_KEY_1 ||
    process.env.GOOGLE_VISION_API_KEY;

  return key ? String(key).trim() : null;
}

// NEW: detect the common “Vision API disabled / not enabled / restricted” cases.
function isVisionServiceUnavailableError(message) {
  const m = String(message || "").toLowerCase();
  if (!m) return false;

  return (
    m.includes("photo moderation is not configured") ||
    m.includes("accessnotconfigured") ||
    m.includes("service_disabled") ||
    (m.includes("vision.googleapis.com") && m.includes("has not been used")) ||
    (m.includes("google vision") && m.includes("disabled")) ||
    m.includes("the service is currently unavailable") ||
    m.includes("api has not been used")
  );
}

function normalizeLikelihood(value) {
  if (value == null) return null;
  const v = String(value).trim().toUpperCase();
  if (!v) return null;
  return v;
}

function likelihoodScore(likelihood) {
  // Google uses: UNKNOWN, VERY_UNLIKELY, UNLIKELY, POSSIBLE, LIKELY, VERY_LIKELY
  // We'll map to 0..5.
  const v = normalizeLikelihood(likelihood);
  if (!v) return 0;
  if (v === "VERY_UNLIKELY") return 1;
  if (v === "UNLIKELY") return 2;
  if (v === "POSSIBLE") return 3;
  if (v === "LIKELY") return 4;
  if (v === "VERY_LIKELY") return 5;
  return 0; // UNKNOWN
}

function decideFromSafeSearch(safeSearch, purpose) {
  const adult = likelihoodScore(safeSearch?.adult);
  const racy = likelihoodScore(safeSearch?.racy);
  const violence = likelihoodScore(safeSearch?.violence);

  // NOTE: We intentionally do NOT block "POSSIBLE".
  // Vision SafeSearch can be noisy for normal swimsuit / gym / fashion photos.
  // Policy:
  // - Only hard-reject on VERY_LIKELY VIOLENCE.
  // - "RACY" alone should NEVER hard-reject (bikinis / lingerie / gym pics often flag as VERY_LIKELY racy).
  // - For profile photos specifically, we treat VERY_LIKELY ADULT as "review" (not reject) to reduce false positives.
  //   (Verification selfies still reject VERY_LIKELY ADULT.)
  const p = String(purpose || "")
    .trim()
    .toLowerCase();
  const isProfilePhoto = p === "profile_photo";
  const isVerification = p === "verification_photo";

  const rejectThreshold = 5; // VERY_LIKELY
  const reviewThreshold = 4; // LIKELY

  // Hard rejects
  if (violence >= rejectThreshold) {
    return "reject";
  }

  // Adult VERY_LIKELY: allow as "review" for profile photos (bikini false positives), but still reject for verification.
  if (adult >= rejectThreshold) {
    return isProfilePhoto ? "review" : "reject";
  }

  // Everything else becomes "review" if it is at least LIKELY.
  // IMPORTANT: racy VERY_LIKELY should be "review", not "reject".
  if (
    adult >= reviewThreshold ||
    violence >= reviewThreshold ||
    racy >= reviewThreshold
  ) {
    return "review";
  }

  return "approve";
}

async function callGoogleVisionSafeSearch({ imageUrl }) {
  const key = getVisionApiKey();
  if (!key) {
    throw new Error(
      "Photo moderation is not configured (missing WIFEY_GOOGLE_API_KEY).",
    );
  }

  const payload = {
    requests: [
      {
        image: { source: { imageUri: String(imageUrl) } },
        features: [{ type: "SAFE_SEARCH_DETECTION" }],
      },
    ],
  };

  const url = `${VISION_ENDPOINT}?key=${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    // Try to capture Google’s structured error so we can detect “API disabled”.
    let extra = "";
    try {
      extra = await resp.text();
    } catch {
      // ignore
    }

    throw new Error(
      `When calling Google Vision, the response was [${resp.status}] ${resp.statusText} ${extra}`,
    );
  }

  const json = await resp.json();
  const annotation = json?.responses?.[0]?.safeSearchAnnotation;

  return {
    raw: json,
    safeSearch: annotation || {},
  };
}

export async function moderatePhotoWithGoogleVision({
  userId,
  imageUrl,
  purpose,
}) {
  const url = String(imageUrl || "").trim();
  if (!url) {
    return {
      ok: false,
      error: "imageUrl is required",
    };
  }

  try {
    const { raw, safeSearch } = await callGoogleVisionSafeSearch({
      imageUrl: url,
    });

    const safeSearchClean = {
      adult: normalizeLikelihood(safeSearch?.adult),
      racy: normalizeLikelihood(safeSearch?.racy),
      violence: normalizeLikelihood(safeSearch?.violence),
      spoof: normalizeLikelihood(safeSearch?.spoof),
      medical: normalizeLikelihood(safeSearch?.medical),
    };

    const decision = decideFromSafeSearch(safeSearchClean, purpose);

    try {
      await sql`
        INSERT INTO photo_moderation_events (
          user_id,
          image_url,
          decision,
          provider,
          safe_search,
          raw_response
        )
        VALUES (
          ${Number.isFinite(Number(userId)) ? Number(userId) : null},
          ${url},
          ${decision},
          'google_vision',
          ${JSON.stringify(safeSearchClean)}::jsonb,
          ${JSON.stringify(raw || {})}::jsonb
        )
      `;
    } catch (e) {
      console.error("[MODERATION] Could not record moderation event", e);
      // Not fatal
    }

    return {
      ok: true,
      decision,
      safeSearch: safeSearchClean,
      moderationSkipped: false,
    };
  } catch (e) {
    // NEW: If Vision is not enabled / misconfigured, don't block signup.
    // We record a "review" event so you can still audit what was uploaded.
    const message = e?.message || "Moderation failed";

    if (isVisionServiceUnavailableError(message)) {
      try {
        await sql`
          INSERT INTO photo_moderation_events (
            user_id,
            image_url,
            decision,
            provider,
            safe_search,
            raw_response
          )
          VALUES (
            ${Number.isFinite(Number(userId)) ? Number(userId) : null},
            ${url},
            'review',
            'google_vision',
            ${JSON.stringify({})}::jsonb,
            ${JSON.stringify({ error: message, purpose: purpose || null })}::jsonb
          )
        `;
      } catch (dbErr) {
        console.error(
          "[MODERATION] Could not record fallback moderation event",
          dbErr,
        );
      }

      return {
        ok: true,
        decision: "review",
        safeSearch: {},
        moderationSkipped: true,
      };
    }

    console.error("[MODERATION] Vision moderation failed", e);
    return {
      ok: false,
      error: message,
    };
  }
}

export async function ensurePhotosApproved({ userId, imageUrls, purpose }) {
  const list = Array.isArray(imageUrls)
    ? imageUrls
        .filter((x) => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  const p = String(purpose || "")
    .trim()
    .toLowerCase();
  const allowReview = p === "profile_photo" || p === "verification_photo";

  for (const url of list) {
    const result = await moderatePhotoWithGoogleVision({
      userId,
      imageUrl: url,
      purpose,
    });

    if (!result?.ok) {
      return { ok: false, error: result?.error || "Moderation failed" };
    }

    // NEW: if moderation is temporarily unavailable/misconfigured, allow the photo
    // (but it will be recorded as "review" in photo_moderation_events).
    if (result?.moderationSkipped) {
      continue;
    }

    // Align backend gating with mobile gating:
    // - Always allow "approve".
    // - Allow "review" for profile + verification photos to reduce false positives (ex: bikinis).
    const decision = String(result?.decision || "").toLowerCase();
    const isOk =
      decision === "approve" || (allowReview && decision === "review");

    if (!isOk) {
      return {
        ok: false,
        error:
          decision === "review"
            ? "Photo needs review. Please upload a different photo."
            : "Photo was rejected. Please upload a different photo.",
        decision: result.decision,
        safeSearch: result.safeSearch,
      };
    }
  }

  return { ok: true };
}
