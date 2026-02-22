export function normalizePreferences(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function normalizePhotos(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getProfileView(selectedUser) {
  if (!selectedUser) {
    return null;
  }

  const profile = selectedUser?.profile || null;
  const prefs = normalizePreferences(profile?.preferences);

  const photos = normalizePhotos(profile?.photos);

  const videos = Array.isArray(prefs?.media?.videos) ? prefs.media.videos : [];
  const prompts = Array.isArray(prefs?.prompts) ? prefs.prompts : [];
  const interests = Array.isArray(prefs?.interests) ? prefs.interests : [];

  const bio = String(profile?.bio || "").trim();
  const location = String(profile?.location || "").trim();
  const displayName = String(profile?.display_name || "").trim();

  return {
    profile,
    prefs,
    photos,
    videos,
    prompts,
    interests,
    bio,
    location,
    displayName,
  };
}
