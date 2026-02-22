export async function moderatePhoto({ userId, imageUrl, purpose }) {
  const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!url) {
    return { ok: false, error: "Missing image url" };
  }

  try {
    const baseURL = process.env.EXPO_PUBLIC_BASE_URL || "";
    const endpoint = baseURL ? `${baseURL}/api/moderation/photo` : "/api/moderation/photo";
    
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: Number.isFinite(Number(userId)) ? Number(userId) : null,
        imageUrl: url,
        purpose: purpose ? String(purpose) : null,
      }),
    });

    if (!resp.ok) {
      let extra = "";
      try {
        const j = await resp.json();
        if (j?.error) extra = String(j.error);
      } catch {
        // ignore
      }

      throw new Error(
        extra ||
          `When calling /api/moderation/photo, the response was [${resp.status}] ${resp.statusText}`,
      );
    }

    const json = await resp.json();
    return {
      ok: true,
      decision: json?.decision || null,
      safeSearch: json?.safeSearch || null,
      moderationSkipped: !!json?.moderationSkipped,
    };
  } catch (e) {
    console.error("[MODERATION] moderatePhoto error", e);
    return { ok: false, error: e?.message || "Moderation failed" };
  }
}

export function isDecisionAllowed(
  decision,
  moderationSkipped = false,
  purpose = null,
) {
  // If the server had to skip moderation (Vision API disabled / misconfigured),
  // don't block the user during signup/profile edits.
  if (moderationSkipped) {
    return true;
  }

  const d = String(decision || "").toLowerCase();
  const p = String(purpose || "").toLowerCase();

  // By default we only allow "approve".
  // BUT: SafeSearch false positives happen a lot for normal selfies/swimsuit/fashion.
  // For our two user-facing flows, we allow "review" (it still gets recorded server-side).
  const allowReview = p === "profile_photo" || p === "verification_photo";

  if (d === "approve") {
    return true;
  }

  if (allowReview && d === "review") {
    return true;
  }

  return false;
}
