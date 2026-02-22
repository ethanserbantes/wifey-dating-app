import sql from "@/app/api/utils/sql";

function normalizeAudienceGender(value) {
  const v = String(value || "")
    .toUpperCase()
    .trim();
  if (v === "FEMALE" || v === "MALE" || v === "ALL") {
    return v;
  }
  return null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const audienceGender = normalizeAudienceGender(searchParams.get("gender"));

    // We default to FEMALE because this endpoint is primarily used for the
    // "women passed" share card.
    const audienceToUse = audienceGender || "FEMALE";

    // We count unique users with a completed attempt (outcome != IN_PROGRESS).
    // If a user has multiple attempts, we take their most recent completed outcome.
    const rows = await sql(
      `
      WITH latest_completed AS (
        SELECT DISTINCT ON (sa.user_id)
          sa.user_id,
          sa.outcome,
          sa.quiz_config_version
        FROM screening_attempts sa
        WHERE sa.outcome IS NOT NULL
          AND sa.outcome <> 'IN_PROGRESS'
        ORDER BY sa.user_id,
                 sa.completed_at DESC NULLS LAST,
                 sa.id DESC
      )
      SELECT
        COALESCE(SUM(CASE WHEN lc.outcome = 'APPROVED' THEN 1 ELSE 0 END), 0)::int AS passed_count,
        COUNT(*)::int AS total_count
      FROM latest_completed lc
      LEFT JOIN quiz_versions v
        ON v.version_number = lc.quiz_config_version
      WHERE ($1::text = 'ALL') OR (v.audience_gender = $1::text)
      `,
      [audienceToUse],
    );

    const passedCount = rows?.[0]?.passed_count ?? 0;
    const totalCount = rows?.[0]?.total_count ?? 0;

    return Response.json({
      audienceGender: audienceToUse,
      passedCount,
      totalCount,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching quiz stats:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
