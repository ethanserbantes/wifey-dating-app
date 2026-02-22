export function toAudienceGender(profileGender) {
  const raw = (profileGender ?? "").toString().trim();
  const upper = raw.toUpperCase();

  if (upper === "MALE" || upper === "M" || upper === "MAN") return "MALE";
  if (upper === "FEMALE" || upper === "F" || upper === "WOMAN") return "FEMALE";

  if (raw === "Male") return "MALE";
  if (raw === "Female") return "FEMALE";

  return "ALL";
}

export function normalizeAudienceGender(input) {
  const v = (input || "").toString().trim().toUpperCase();
  if (v === "MALE" || v === "FEMALE" || v === "ALL") return v;
  if (v === "M" || v === "MAN") return "MALE";
  if (v === "F" || v === "WOMAN") return "FEMALE";
  return null;
}
