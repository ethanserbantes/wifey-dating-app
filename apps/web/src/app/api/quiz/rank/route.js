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

function parseUserId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.trunc(n);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = parseUserId(searchParams.get("userId"));
    const audienceGender = normalizeAudienceGender(searchParams.get("gender"));

    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    // Default to FEMALE to match the primary use-case for the pass screen.
    const audienceToUse = audienceGender || "FEMALE";

    const rows = await sql(
      `
      WITH me AS (
        SELECT
          id,
          status,
          created_at,
          screening_state_json,
          (COALESCE(screening_state_json->>'is_fake', 'false') = 'true') AS is_fake
        FROM users
        WHERE id = $1
        LIMIT 1
      ),
      completed AS (
        SELECT
          sa.id,
          sa.user_id,
          sa.outcome,
          sa.completed_at,
          sa.quiz_config_version,
          v.audience_gender
        FROM screening_attempts sa
        LEFT JOIN quiz_versions v
          ON v.version_number = sa.quiz_config_version
        WHERE sa.outcome IS NOT NULL
          AND sa.outcome <> 'IN_PROGRESS'
          AND sa.completed_at IS NOT NULL
          AND (($2::text = 'ALL') OR (v.audience_gender = $2::text))
      ),
      latest_completed AS (
        SELECT DISTINCT ON (c.user_id)
          c.user_id,
          c.outcome,
          c.completed_at,
          c.id AS attempt_id
        FROM completed c
        ORDER BY c.user_id, c.completed_at DESC, c.id DESC
      ),
      approved_first AS (
        SELECT DISTINCT ON (c.user_id)
          c.user_id,
          c.completed_at,
          c.id AS attempt_id
        FROM completed c
        WHERE c.outcome = 'APPROVED'
        ORDER BY c.user_id, c.completed_at ASC, c.id ASC
      ),
      my_status AS (
        SELECT * FROM latest_completed WHERE user_id = $1
      ),
      my_pass AS (
        SELECT * FROM approved_first WHERE user_id = $1
      ),
      totals AS (
        SELECT COUNT(*)::int AS total_count FROM latest_completed
      ),
      passed AS (
        SELECT COUNT(*)::int AS passed_count FROM approved_first
      ),
      rank_calc AS (
        SELECT
          (
            SELECT COUNT(*)::int
            FROM approved_first af, my_pass mp
            WHERE (af.completed_at < mp.completed_at)
               OR (af.completed_at = mp.completed_at AND af.attempt_id <= mp.attempt_id)
          ) AS rank
      )
      SELECT
        $2::text AS audience_gender,
        (SELECT total_count FROM totals) AS total_count,
        (SELECT passed_count FROM passed) AS passed_count,
        -- If the user has screening attempts, use those.
        -- Otherwise, fall back to users.status (useful for admin-approved / fake profiles).
        COALESCE(
          (SELECT outcome FROM my_status),
          CASE
            WHEN (SELECT status FROM me) = 'APPROVED' AND (SELECT is_fake FROM me) = true THEN 'APPROVED'
            ELSE NULL
          END
        ) AS my_outcome,
        COALESCE(
          (SELECT completed_at FROM my_pass),
          CASE
            WHEN (SELECT status FROM me) = 'APPROVED' AND (SELECT is_fake FROM me) = true THEN (SELECT created_at FROM me)
            ELSE NULL
          END
        ) AS passed_at,
        (SELECT rank FROM rank_calc) AS rank
      `,
      [userId, audienceToUse],
    );

    const row = rows?.[0] || {};

    const totalCount = Number(row.total_count) || 0;
    const passedCount = Number(row.passed_count) || 0;
    const rank = row.rank == null ? null : Number(row.rank);
    const myOutcome = row.my_outcome || null;

    return Response.json({
      audienceGender: row.audience_gender || audienceToUse,
      userId,
      totalCount,
      passedCount,
      isApproved: myOutcome === "APPROVED",
      rank,
      passedAt: row.passed_at ? new Date(row.passed_at).toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching quiz rank:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
