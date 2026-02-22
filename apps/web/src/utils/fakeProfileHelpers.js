export function emptyDraft() {
  return {
    userId: null,
    displayName: "",
    age: "",
    gender: "female",
    location: "",
    bio: "",
    isVisible: true,
    isVerified: false,
    photos: [],
    preferences: {
      // Category powers Discover > Browse by Category.
      // Stored at preferences.category (not inside basics).
      category: "",
      basics: {
        height: "",
        work: "",
        education: "",
        // lookingFor removed from fake profile setup
      },
      interests: [],
      prompts: [],
      media: {
        videos: [],
      },
    },
    // Admin-only convenience fields (safe to ignore elsewhere)
    likesCount: 0,
    lastLikeAt: null,
  };
}

export function normalizeProfileRow(row) {
  const photos = Array.isArray(row?.photos)
    ? row.photos
    : row?.photos
      ? JSON.parse(row.photos)
      : [];

  const preferences =
    row?.preferences && typeof row.preferences === "object"
      ? row.preferences
      : row?.preferences
        ? JSON.parse(row.preferences)
        : {};

  const merged = emptyDraft();

  const mergedPreferences = {
    ...merged.preferences,
    ...preferences,
    basics: {
      ...merged.preferences.basics,
      ...(preferences?.basics || {}),
    },
    media: {
      ...merged.preferences.media,
      ...(preferences?.media || {}),
      videos: Array.isArray(preferences?.media?.videos)
        ? preferences.media.videos
        : merged.preferences.media.videos,
    },
    interests: Array.isArray(preferences?.interests)
      ? preferences.interests
      : merged.preferences.interests,
    prompts: Array.isArray(preferences?.prompts)
      ? preferences.prompts
      : merged.preferences.prompts,
  };

  return {
    ...merged,
    userId: row.user_id,
    displayName: row.display_name || "",
    age: row.age ?? "",
    gender: row.gender || "female",
    location: row.location || "",
    bio: row.bio || "",
    isVisible: row.is_visible ?? true,
    isVerified: row.is_verified ?? false,
    photos,
    preferences: mergedPreferences,
    likesCount: Number.isFinite(Number(row?.likes_count))
      ? Number(row.likes_count)
      : 0,
    lastLikeAt: row?.last_like_at || null,
  };
}
