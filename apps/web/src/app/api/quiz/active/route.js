import sql from "@/app/api/utils/sql";

function toAudienceGender(input) {
  const raw = (input ?? "").toString().trim();
  const upper = raw.toUpperCase();

  // Support older/looser values too.
  if (upper === "MALE" || upper === "M" || upper === "MAN") return "MALE";
  if (upper === "FEMALE" || upper === "F" || upper === "WOMAN") return "FEMALE";

  // Backward compat: UI sometimes sends title-cased strings
  if (raw === "Male") return "MALE";
  if (raw === "Female") return "FEMALE";

  return "ALL";
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desired = toAudienceGender(searchParams.get("gender"));

    let configs = await sql`
      SELECT config_json, version, audience_gender
      FROM quiz_configs
      WHERE is_active = true
        AND audience_gender = ${desired}
      LIMIT 1
    `;

    // IMPORTANT: never cross genders. Only fallback to ALL (legacy).
    if (configs.length === 0 && desired !== "ALL") {
      configs = await sql`
        SELECT config_json, version, audience_gender
        FROM quiz_configs
        WHERE is_active = true
          AND audience_gender = 'ALL'
        LIMIT 1
      `;
    }

    if (configs.length === 0) {
      return Response.json(
        { error: "No active quiz config found" },
        { status: 404 },
      );
    }

    const config = configs[0];

    // Return config without weights, thresholds, or lifetime rules
    const sanitizedConfig = {
      version: config.version,
      audienceGender: config.audience_gender,
      phases: config.config_json.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        questions: phase.questions.map((q) => ({
          id: q.id,
          text: q.text,
          answers: q.answers.map((a) => ({
            id: a.id,
            label: a.label,
          })),
        })),
      })),
    };

    return Response.json({ config: sanitizedConfig });
  } catch (error) {
    console.error("Error fetching active quiz config:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
