import sql from "@/app/api/utils/sql";

export async function GET() {
  console.log("[ANALYTICS] Starting analytics fetch...");
  try {
    // Total users
    console.log("[ANALYTICS] Fetching total users...");
    const totalUsersResult = await sql`
      SELECT COUNT(*) as total FROM users
    `;
    console.log("[ANALYTICS] Total users result:", totalUsersResult);

    // Users by status
    console.log("[ANALYTICS] Fetching users by status...");
    const usersByStatusResult = await sql`
      SELECT status, COUNT(*) as count 
      FROM users 
      GROUP BY status
    `;
    console.log("[ANALYTICS] Users by status result:", usersByStatusResult);

    // New users today
    console.log("[ANALYTICS] Fetching new users today...");
    const newUsersTodayResult = await sql`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE created_at >= CURRENT_DATE
    `;
    console.log("[ANALYTICS] New users today result:", newUsersTodayResult);

    // New users this week
    console.log("[ANALYTICS] Fetching new users this week...");
    const newUsersWeekResult = await sql`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    `;
    console.log("[ANALYTICS] New users this week result:", newUsersWeekResult);

    // Active sessions (users with sessions that haven't expired)
    console.log("[ANALYTICS] Fetching active sessions...");
    const activeSessionsResult = await sql`
      SELECT COUNT(DISTINCT "userId") as count 
      FROM auth_sessions 
      WHERE expires > NOW()
    `;
    console.log("[ANALYTICS] Active sessions result:", activeSessionsResult);

    // Total screening bans
    console.log("[ANALYTICS] Fetching screening bans...");
    const screeningBansResult = await sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_permanent THEN 1 ELSE 0 END) as permanent,
        SUM(CASE WHEN expires_at > NOW() OR is_permanent THEN 1 ELSE 0 END) as active
      FROM screening_bans
    `;
    console.log("[ANALYTICS] Screening bans result:", screeningBansResult);

    // Total behavior bans
    console.log("[ANALYTICS] Fetching behavior bans...");
    const behaviorBansResult = await sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_permanent THEN 1 ELSE 0 END) as permanent,
        SUM(CASE WHEN expires_at > NOW() OR is_permanent THEN 1 ELSE 0 END) as active
      FROM behavior_bans
    `;
    console.log("[ANALYTICS] Behavior bans result:", behaviorBansResult);

    // Support tickets stats
    console.log("[ANALYTICS] Fetching support tickets...");
    const supportTicketsResult = await sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved
      FROM support_tickets
    `;
    console.log("[ANALYTICS] Support tickets result:", supportTicketsResult);

    // User reports stats
    console.log("[ANALYTICS] Fetching user reports...");
    const userReportsResult = await sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'INVESTIGATING' THEN 1 ELSE 0 END) as investigating,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved
      FROM user_reports
    `;
    console.log("[ANALYTICS] User reports result:", userReportsResult);

    // Total attempts
    console.log("[ANALYTICS] Fetching total attempts...");
    const totalResult = await sql`
      SELECT COUNT(*) as total FROM screening_attempts
    `;
    console.log("[ANALYTICS] Total result:", totalResult);

    // Outcome breakdown
    console.log("[ANALYTICS] Fetching outcome breakdown...");
    const outcomeResult = await sql`
      SELECT outcome, COUNT(*) as count 
      FROM screening_attempts 
      WHERE outcome != 'IN_PROGRESS'
      GROUP BY outcome
    `;
    console.log("[ANALYTICS] Outcome result:", outcomeResult);

    // Phase failure analysis
    console.log("[ANALYTICS] Fetching phase failures...");
    const phaseFailureResult = await sql`
      SELECT 
        CAST(SUBSTRING(answers_json->-1->>'phase' FROM 'phase_([0-9]+)') AS INTEGER) as failed_phase,
        COUNT(*) as count
      FROM screening_attempts
      WHERE outcome IN ('FAILED', 'COOLDOWN', 'LIFETIME_INELIGIBLE')
        AND jsonb_array_length(answers_json) > 0
        AND answers_json->-1->>'phase' IS NOT NULL
      GROUP BY failed_phase
      ORDER BY failed_phase
    `;
    console.log("[ANALYTICS] Phase failure result:", phaseFailureResult);

    // Most common answers
    console.log("[ANALYTICS] Fetching answer frequencies...");
    const answerFrequencyResult = await sql`
      SELECT 
        answer->>'questionId' as question_id,
        answer->>'answerId' as answer_id,
        COUNT(*) as count
      FROM screening_attempts,
      jsonb_array_elements(answers_json) as answer
      GROUP BY question_id, answer_id
      ORDER BY count DESC
      LIMIT 20
    `;
    console.log("[ANALYTICS] Answer frequency result:", answerFrequencyResult);

    // Recent attempts
    console.log("[ANALYTICS] Fetching recent attempts...");
    const recentResult = await sql`
      SELECT 
        sa.id,
        sa.user_id,
        u.email,
        sa.outcome,
        sa.started_at,
        sa.completed_at
      FROM screening_attempts sa
      JOIN users u ON sa.user_id = u.id
      ORDER BY sa.started_at DESC
      LIMIT 50
    `;
    console.log("[ANALYTICS] Recent attempts result:", recentResult);

    // Cooldown users
    console.log("[ANALYTICS] Fetching cooldown users...");
    const cooldownUsersResult = await sql`
      SELECT 
        u.id,
        u.email,
        u.cooldown_until,
        u.created_at,
        sa.completed_at as last_attempt_at,
        sa.outcome as last_outcome
      FROM users u
      LEFT JOIN LATERAL (
        SELECT outcome, completed_at
        FROM screening_attempts
        WHERE user_id = u.id
        ORDER BY started_at DESC
        LIMIT 1
      ) sa ON true
      WHERE u.cooldown_until IS NOT NULL
        AND u.cooldown_until > NOW()
    `;
    console.log("[ANALYTICS] Cooldown users result:", cooldownUsersResult);

    // ==========================
    // NEW analytics
    // ==========================

    // Pass rate by gender (based on each user's latest completed attempt)
    console.log("[ANALYTICS] Fetching pass rate by gender...");
    const passRateByGenderResult = await sql`
      WITH latest AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          outcome,
          completed_at
        FROM screening_attempts
        WHERE outcome != 'IN_PROGRESS'
          AND completed_at IS NOT NULL
        ORDER BY user_id, completed_at DESC
      )
      SELECT
        COALESCE(up.verified_gender, up.gender, 'UNKNOWN') AS gender,
        COUNT(*) AS total,
        SUM(CASE WHEN latest.outcome = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN latest.outcome = 'FAILED' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN latest.outcome = 'COOLDOWN' THEN 1 ELSE 0 END) AS cooldown,
        SUM(CASE WHEN latest.outcome = 'LIFETIME_INELIGIBLE' THEN 1 ELSE 0 END) AS lifetime_ineligible
      FROM latest
      LEFT JOIN user_profiles up ON up.user_id = latest.user_id
      GROUP BY COALESCE(up.verified_gender, up.gender, 'UNKNOWN')
      ORDER BY total DESC
    `;
    console.log(
      "[ANALYTICS] Pass rate by gender result:",
      passRateByGenderResult,
    );

    // Fail reason distribution (best-effort inference)
    console.log("[ANALYTICS] Fetching fail reason distribution...");
    const failReasonsResult = await sql`
      WITH base AS (
        SELECT
          outcome,
          CASE
            WHEN (answers_json->-1->>'phase') LIKE 'phase_%' THEN (answers_json->-1->>'phase')
            ELSE NULL
          END AS phase,
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(answers_json) a
            WHERE COALESCE((a->>'weight')::int, 0) >= 999999
          ) AS has_hard_weight
        FROM screening_attempts
        WHERE outcome IN ('FAILED', 'COOLDOWN', 'LIFETIME_INELIGIBLE')
      )
      SELECT
        outcome,
        CASE
          WHEN outcome = 'LIFETIME_INELIGIBLE' AND has_hard_weight THEN 'hard_weight'
          WHEN outcome = 'LIFETIME_INELIGIBLE' THEN 'lifetime_rule'
          WHEN outcome = 'FAILED' THEN 'phase_threshold'
          WHEN outcome = 'COOLDOWN' THEN 'phase_threshold'
          ELSE 'unknown'
        END AS reason,
        phase,
        COUNT(*) AS count
      FROM base
      GROUP BY outcome, reason, phase
      ORDER BY count DESC
    `;
    console.log("[ANALYTICS] Fail reasons result:", failReasonsResult);

    // Question-level dropoff (best-effort)
    console.log("[ANALYTICS] Fetching question-level dropoff...");
    const questionDropoffResult = await sql`
      WITH expanded AS (
        SELECT
          sa.id AS attempt_id,
          sa.outcome,
          CASE
            WHEN (ans.answer->>'questionId') ~ '^[0-9]+$'
              THEN (ans.answer->>'questionId')::int
            ELSE NULL
          END AS question_id,
          ans.ord::int AS ord,
          jsonb_array_length(sa.answers_json) AS total_answers
        FROM screening_attempts sa,
          jsonb_array_elements(sa.answers_json) WITH ORDINALITY AS ans(answer, ord)
        WHERE jsonb_array_length(sa.answers_json) > 0
      ),
      expanded_filtered AS (
        SELECT * FROM expanded WHERE question_id IS NOT NULL
      ),
      answered AS (
        SELECT question_id, COUNT(DISTINCT attempt_id) AS attempts_answered
        FROM expanded_filtered
        GROUP BY question_id
      ),
      next_after AS (
        SELECT question_id, COUNT(DISTINCT attempt_id) AS attempts_with_next
        FROM expanded_filtered
        WHERE ord < total_answers
        GROUP BY question_id
      ),
      last_question_fail AS (
        SELECT
          CASE
            WHEN (answers_json->-1->>'questionId') ~ '^[0-9]+$'
              THEN (answers_json->-1->>'questionId')::int
            ELSE NULL
          END AS question_id,
          COUNT(*) AS fail_last_question_count
        FROM screening_attempts
        WHERE outcome IN ('FAILED', 'COOLDOWN', 'LIFETIME_INELIGIBLE')
          AND jsonb_array_length(answers_json) > 0
        GROUP BY question_id
      )
      SELECT
        qb.id,
        qb.question_text,
        COALESCE(a.attempts_answered, 0) AS attempts_answered,
        COALESCE(n.attempts_with_next, 0) AS attempts_with_next,
        CASE
          WHEN COALESCE(a.attempts_answered, 0) = 0 THEN 0
          ELSE ROUND(
            (1 - (COALESCE(n.attempts_with_next, 0)::numeric / a.attempts_answered)) * 100,
            1
          )
        END AS dropoff_percent,
        COALESCE(l.fail_last_question_count, 0) AS fail_last_question_count
      FROM question_bank qb
      LEFT JOIN answered a ON a.question_id = qb.id
      LEFT JOIN next_after n ON n.question_id = qb.id
      LEFT JOIN last_question_fail l ON l.question_id = qb.id
      WHERE qb.is_active = true
      ORDER BY dropoff_percent DESC, attempts_answered DESC
      LIMIT 50
    `;
    console.log("[ANALYTICS] Question dropoff result:", questionDropoffResult);

    // ==========================
    // NEW: Unmatch analytics
    // ==========================
    console.log("[ANALYTICS] Fetching unmatch reasons...");
    const unmatchReasonCountsResult = await sql`
      SELECT
        reason_code,
        COUNT(*)::int AS count
      FROM match_unmatch_events
      WHERE created_at >= (now() - interval '30 days')
      GROUP BY reason_code
      ORDER BY count DESC
    `;

    const unmatchRecentResult = await sql`
      SELECT
        e.id,
        e.match_id,
        e.actor_user_id,
        ua.email AS actor_email,
        e.other_user_id,
        uo.email AS other_email,
        e.reason_code,
        e.reason_text,
        e.created_at
      FROM match_unmatch_events e
      LEFT JOIN users ua ON ua.id = e.actor_user_id
      LEFT JOIN users uo ON uo.id = e.other_user_id
      ORDER BY e.created_at DESC
      LIMIT 50
    `;

    console.log("[ANALYTICS] Building response...");
    const response = {
      users: {
        total: parseInt(totalUsersResult[0].total),
        byStatus: usersByStatusResult.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        newToday: parseInt(newUsersTodayResult[0].count),
        newThisWeek: parseInt(newUsersWeekResult[0].count),
        activeSessions: parseInt(activeSessionsResult[0].count),
      },
      bans: {
        screening: {
          total: parseInt(screeningBansResult[0].total || 0),
          permanent: parseInt(screeningBansResult[0].permanent || 0),
          active: parseInt(screeningBansResult[0].active || 0),
        },
        behavior: {
          total: parseInt(behaviorBansResult[0].total || 0),
          permanent: parseInt(behaviorBansResult[0].permanent || 0),
          active: parseInt(behaviorBansResult[0].active || 0),
        },
      },
      supportTickets: {
        total: parseInt(supportTicketsResult[0].total || 0),
        open: parseInt(supportTicketsResult[0].open || 0),
        inProgress: parseInt(supportTicketsResult[0].in_progress || 0),
        resolved: parseInt(supportTicketsResult[0].resolved || 0),
      },
      userReports: {
        total: parseInt(userReportsResult[0].total || 0),
        pending: parseInt(userReportsResult[0].pending || 0),
        investigating: parseInt(userReportsResult[0].investigating || 0),
        resolved: parseInt(userReportsResult[0].resolved || 0),
      },
      screening: {
        total: parseInt(totalResult[0].total),
        outcomes: outcomeResult.reduce((acc, row) => {
          acc[row.outcome] = parseInt(row.count);
          return acc;
        }, {}),
        phaseFailures: phaseFailureResult
          .filter((row) => row.failed_phase !== null)
          .map((row) => ({
            phase: row.failed_phase,
            count: parseInt(row.count),
          })),
        answerFrequency: answerFrequencyResult.map((row) => ({
          questionId: row.question_id,
          answerId: row.answer_id,
          count: parseInt(row.count),
        })),
        recentAttempts: recentResult,
        cooldownUsers: cooldownUsersResult.map((row) => ({
          id: row.id,
          email: row.email,
          cooldownUntil: row.cooldown_until,
          createdAt: row.created_at,
          lastAttemptAt: row.last_attempt_at,
          lastOutcome: row.last_outcome,
        })),
        passRateByGender: passRateByGenderResult.map((row) => {
          const total = parseInt(row.total || 0);
          const approved = parseInt(row.approved || 0);
          const passRate = total > 0 ? Math.round((approved / total) * 100) : 0;

          return {
            gender: row.gender,
            total,
            approved,
            passRate,
            failed: parseInt(row.failed || 0),
            cooldown: parseInt(row.cooldown || 0),
            lifetimeIneligible: parseInt(row.lifetime_ineligible || 0),
          };
        }),

        // {{ NEW }}
        failReasons: failReasonsResult.map((row) => ({
          outcome: row.outcome,
          reason: row.reason,
          phase: row.phase,
          count: parseInt(row.count || 0),
        })),

        // {{ NEW }}
        questionDropoff: questionDropoffResult.map((row) => ({
          questionId: row.id,
          questionText: row.question_text,
          attemptsAnswered: parseInt(row.attempts_answered || 0),
          attemptsWithNext: parseInt(row.attempts_with_next || 0),
          dropoffPercent: Number(row.dropoff_percent || 0),
          failLastQuestionCount: parseInt(row.fail_last_question_count || 0),
        })),
      },
      unmatches: {
        last30DaysByReason: unmatchReasonCountsResult.map((row) => ({
          reasonCode: row.reason_code,
          count: parseInt(row.count || 0),
        })),
        recent: unmatchRecentResult.map((row) => ({
          id: row.id,
          matchId: row.match_id,
          actorUserId: row.actor_user_id,
          actorEmail: row.actor_email,
          otherUserId: row.other_user_id,
          otherEmail: row.other_email,
          reasonCode: row.reason_code,
          reasonText: row.reason_text,
          createdAt: row.created_at,
        })),
      },
    };

    console.log("[ANALYTICS] Response ready, returning...");
    return Response.json(response);
  } catch (error) {
    console.error("[ANALYTICS] Error fetching analytics:", error);
    console.error("[ANALYTICS] Error stack:", error.stack);
    return Response.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
