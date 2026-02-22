import sql from "@/app/api/utils/sql";

function safeString(v) {
  if (v == null) return "";
  return String(v);
}

function parsePhotos(raw) {
  if (Array.isArray(raw)) {
    return raw.filter((x) => typeof x === "string" && x.trim().length > 0);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (x) => typeof x === "string" && x.trim().length > 0,
        );
      }
    } catch {
      // ignore
    }
  }
  return [];
}

function parsePrefs(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore
    }
  }
  return {};
}

function pickPhotoFromKey(sectionKey, photos) {
  const key = safeString(sectionKey).toLowerCase().trim();
  if (!photos.length) return null;

  if (key === "photo:hero") {
    return photos[0] || null;
  }

  const m = key.match(/^photo:(\d+)$/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) {
      // Heuristic:
      // - hero photo uses its own key, so photo:1 usually means the first *non-hero* photo
      // - but some older data might be 1-based overall
      const candidates = [n, n - 1];
      for (const idx of candidates) {
        if (idx >= 0 && idx < photos.length) {
          return photos[idx] || null;
        }
      }
    }
  }

  return photos[0] || null;
}

function pickPromptFromKey(sectionKey, prefs) {
  const key = safeString(sectionKey).toLowerCase().trim();
  const m = key.match(/^prompt:(\d+)$/);
  if (!m) return null;

  const idx = Number(m[1]);
  if (!Number.isFinite(idx) || idx < 0) return null;

  const prompts = Array.isArray(prefs?.prompts) ? prefs.prompts : [];
  const p = prompts[idx];
  if (!p || typeof p !== "object") return null;

  const question = typeof p?.question === "string" ? p.question : "";
  const answer = typeof p?.answer === "string" ? p.answer : "";

  if (!question && !answer) return null;
  return { question, answer };
}

export async function GET(request, { params }) {
  try {
    const matchId = Number(params?.matchId);
    if (!Number.isFinite(matchId)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userId = Number(searchParams.get("userId"));
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const matchRows = await sql`
      SELECT id, user1_id, user2_id
      FROM matches
      WHERE id = ${matchId}
        AND (${userId} = user1_id OR ${userId} = user2_id)
      LIMIT 1
    `;

    if (matchRows.length === 0) {
      return Response.json(
        { error: "Match not found (or you don't have access)" },
        { status: 404 },
      );
    }

    const match = matchRows[0];
    const a = Number(match.user1_id);
    const b = Number(match.user2_id);

    // What initiated the chat is the last like that completed the mutual like.
    // If we don't have context, we still return who liked whom.
    const likeRows = await sql`
      SELECT
        pl.from_user_id,
        pl.to_user_id,
        pl.section_type,
        pl.section_key,
        pl.comment_text,
        pl.created_at
      FROM profile_likes pl
      WHERE (pl.from_user_id = ${a} AND pl.to_user_id = ${b})
         OR (pl.from_user_id = ${b} AND pl.to_user_id = ${a})
      ORDER BY pl.created_at DESC
      LIMIT 1
    `;

    if (likeRows.length === 0) {
      return Response.json({ starter: null });
    }

    const like = likeRows[0];
    const fromUserId = Number(like.from_user_id);
    const toUserId = Number(like.to_user_id);

    const profiles = await sql`
      SELECT user_id, display_name, photos, preferences
      FROM user_profiles
      WHERE user_id = ${fromUserId} OR user_id = ${toUserId}
    `;

    const byUserId = new Map();
    for (const row of profiles) {
      byUserId.set(Number(row.user_id), {
        userId: Number(row.user_id),
        displayName: row.display_name || null,
        photos: row.photos,
        preferences: row.preferences,
      });
    }

    const fromProfile = byUserId.get(fromUserId) || null;
    const toProfile = byUserId.get(toUserId) || null;

    const sectionType =
      typeof like.section_type === "string" ? like.section_type : null;
    const sectionKey =
      typeof like.section_key === "string" ? like.section_key : null;

    const commentTextRaw =
      typeof like.comment_text === "string" ? like.comment_text : null;
    const commentText =
      commentTextRaw && commentTextRaw.trim().length
        ? commentTextRaw.trim()
        : null;

    const actionKind = commentText ? "comment" : "like";

    const toPhotos = parsePhotos(toProfile?.photos);
    const toPrefs = parsePrefs(toProfile?.preferences);

    const media = {
      photoUrl: null,
      promptQuestion: null,
      promptAnswer: null,
    };

    if (String(sectionType || "").toLowerCase() === "photo") {
      media.photoUrl = pickPhotoFromKey(sectionKey, toPhotos);
    }

    if (String(sectionType || "").toLowerCase() === "prompt") {
      const prompt = pickPromptFromKey(sectionKey, toPrefs);
      if (prompt) {
        media.promptQuestion = prompt.question || null;
        media.promptAnswer = prompt.answer || null;
      }
    }

    return Response.json({
      starter: {
        matchId,
        actorUserId: fromUserId,
        actorDisplayName: safeString(fromProfile?.displayName || ""),
        targetUserId: toUserId,
        targetDisplayName: safeString(toProfile?.displayName || ""),
        sectionType,
        sectionKey,
        actionKind,
        commentText,
        createdAt: like.created_at,
        ...media,
      },
    });
  } catch (error) {
    console.error("Error fetching match starter:", error);
    return Response.json(
      { error: "Failed to fetch match starter" },
      { status: 500 },
    );
  }
}
