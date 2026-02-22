import sql from "@/app/api/utils/sql";
import { requireAdmin, hasRole } from "@/app/api/utils/adminAuth";

function numericIdFromRuntimeId(runtimeId, prefix) {
  if (runtimeId == null) {
    return null;
  }

  const s = String(runtimeId);
  const expectedPrefix = `${prefix}_`;

  if (!s.startsWith(expectedPrefix)) {
    const asNum = Number(s);
    return Number.isFinite(asNum) ? asNum : null;
  }

  const raw = s.slice(expectedPrefix.length);
  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum : null;
}

function toAudienceGender(profileGender) {
  if (profileGender === "Male" || profileGender === "MALE") return "MALE";
  if (profileGender === "Female" || profileGender === "FEMALE") return "FEMALE";
  return "ALL";
}

export async function GET(request, { params }) {
  try {
    const authResult = await requireAdmin(request);
    if (!authResult.ok) return authResult.response;
    if (
      !hasRole(authResult.admin, ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"])
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = params.id;

    const [user] = await sql`
      SELECT id, email, status, screening_phase, cooldown_until, created_at, updated_at
      FROM users WHERE id = ${userId}
    `;

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Engagement totals (received)
    const [{ likes_received }] = await sql`
      SELECT COUNT(*)::int AS likes_received
      FROM profile_likes
      WHERE to_user_id = ${userId}
    `;

    const [{ skips_received }] = await sql`
      SELECT COUNT(*)::int AS skips_received
      FROM profile_passes
      WHERE to_user_id = ${userId}
    `;

    const userWithEngagement = {
      ...user,
      likes_received: typeof likes_received === "number" ? likes_received : 0,
      skips_received: typeof skips_received === "number" ? skips_received : 0,
    };

    const [profile] = await sql`
      SELECT user_id, display_name, age, birthdate, gender, bio, location, photos, preferences,
             is_verified, is_visible, verification_photo_url, verification_status,
             verification_submitted_at, verification_reviewed_at, verified_gender, updated_at
      FROM user_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    // Get screening attempts
    const attempts = await sql`
      SELECT id, quiz_config_version, outcome, started_at, completed_at,
             answers_json, phase_scores_json
      FROM screening_attempts
      WHERE user_id = ${userId}
      ORDER BY started_at DESC
    `;

    // Expand attempt answers into question/answer text so admins can audit user responses.
    let attemptsDetailed = [];
    try {
      const allAnswerEntries = [];

      for (const attempt of attempts || []) {
        const arr = Array.isArray(attempt?.answers_json)
          ? attempt.answers_json
          : [];
        for (const entry of arr) {
          allAnswerEntries.push(entry);
        }
      }

      const qIds = [];
      const aIds = [];
      for (const entry of allAnswerEntries) {
        const qid = numericIdFromRuntimeId(entry?.questionId, "q");
        const aid = numericIdFromRuntimeId(entry?.answerId, "a");
        if (qid != null) qIds.push(qid);
        if (aid != null) aIds.push(aid);
      }

      const uniq = (arr) => [...new Set(arr)].filter((x) => x != null);
      const qIdsUniq = uniq(qIds);
      const aIdsUniq = uniq(aIds);

      const questionRows = qIdsUniq.length
        ? await sql`
            SELECT id, question_text
            FROM question_bank
            WHERE id = ANY(${qIdsUniq})
          `
        : [];

      const answerRows = aIdsUniq.length
        ? await sql`
            SELECT id, question_id, answer_text, weight
            FROM question_answers
            WHERE id = ANY(${aIdsUniq})
          `
        : [];

      const questionTextById = {};
      for (const row of questionRows) {
        questionTextById[row.id] = row.question_text;
      }

      const answerById = {};
      for (const row of answerRows) {
        answerById[row.id] = {
          questionId: row.question_id,
          text: row.answer_text,
          weight: row.weight,
        };
      }

      attemptsDetailed = (attempts || []).map((attempt) => {
        const entries = Array.isArray(attempt?.answers_json)
          ? attempt.answers_json
          : [];
        const answersDetailed = entries.map((entry) => {
          const qid = numericIdFromRuntimeId(entry?.questionId, "q");
          const aid = numericIdFromRuntimeId(entry?.answerId, "a");
          const qbText = qid != null ? questionTextById[qid] : null;
          const ans = aid != null ? answerById[aid] : null;

          return {
            phase: entry?.phase || null,
            questionId: entry?.questionId ?? null,
            questionDbId: qid,
            questionText: qbText,
            answerId: entry?.answerId ?? null,
            answerDbId: aid,
            answerText: ans?.text || null,
            weight: entry?.weight ?? null,
            dbWeight: ans?.weight ?? null,
          };
        });

        return {
          id: attempt.id,
          quiz_config_version: attempt.quiz_config_version,
          outcome: attempt.outcome,
          started_at: attempt.started_at,
          completed_at: attempt.completed_at,
          answersDetailed,
        };
      });
    } catch (e) {
      console.error("attemptsDetailed build error:", e);
      attemptsDetailed = [];
    }

    // Helpful debugging info for the *latest* attempt (so you can see which answers carried weight)
    let latestAttemptDebug = null;
    const latestAttempt = attempts?.[0];
    if (latestAttempt && Array.isArray(latestAttempt.answers_json)) {
      const answers = latestAttempt.answers_json;
      const phase1 = answers.filter((a) => a?.phase === "phase_1");

      const qIds = [];
      const aIds = [];
      for (const a of answers) {
        const qid = numericIdFromRuntimeId(a?.questionId, "q");
        const aid = numericIdFromRuntimeId(a?.answerId, "a");
        if (qid != null) qIds.push(qid);
        if (aid != null) aIds.push(aid);
      }

      const uniq = (arr) => [...new Set(arr)].filter((x) => x != null);
      const qIdsUniq = uniq(qIds);
      const aIdsUniq = uniq(aIds);

      const questionRows = qIdsUniq.length
        ? await sql`
            SELECT id, question_text
            FROM question_bank
            WHERE id = ANY(${qIdsUniq})
          `
        : [];

      const answerRows = aIdsUniq.length
        ? await sql`
            SELECT id, question_id, answer_text, weight
            FROM question_answers
            WHERE id = ANY(${aIdsUniq})
          `
        : [];

      const questionTextById = {};
      for (const row of questionRows) {
        questionTextById[row.id] = row.question_text;
      }

      const answerById = {};
      for (const row of answerRows) {
        answerById[row.id] = {
          questionId: row.question_id,
          text: row.answer_text,
          weight: row.weight,
        };
      }

      const phase1Selections = phase1.map((entry) => {
        const qid = numericIdFromRuntimeId(entry?.questionId, "q");
        const aid = numericIdFromRuntimeId(entry?.answerId, "a");
        const qbText = qid != null ? questionTextById[qid] : null;
        const ans = aid != null ? answerById[aid] : null;

        return {
          questionId: entry?.questionId,
          answerId: entry?.answerId,
          weight: entry?.weight,
          questionText: qbText,
          answerText: ans?.text || null,
          dbWeight: ans?.weight ?? null,
        };
      });

      const phase1NonZero = phase1Selections
        .filter((x) => Number(x?.weight) > 0)
        .slice(0, 50);

      // Pull phase 1 thresholds for this version (best-effort)
      let phase1Rules = null;
      const audience = toAudienceGender(profile?.gender);
      if (latestAttempt.quiz_config_version != null) {
        const rulesRows = await sql`
          SELECT pc.*
          FROM quiz_versions v
          JOIN version_phase_configs pc ON pc.version_id = v.id
          WHERE v.version_number = ${latestAttempt.quiz_config_version}
            AND pc.phase_name = 'phase_1'
            AND v.audience_gender = ${audience}
          LIMIT 1
        `;

        if (rulesRows.length > 0) {
          phase1Rules = {
            serve_count_min: rulesRows[0].serve_count_min,
            serve_count_max: rulesRows[0].serve_count_max,
            fail_if_sum_gte: rulesRows[0].fail_if_sum_gte,
            cooldown_if_sum_gte: rulesRows[0].cooldown_if_sum_gte,
            escalate_if_sum_gte: rulesRows[0].escalate_if_sum_gte,
            escalate_if_any_weight_gte: rulesRows[0].escalate_if_any_weight_gte,
            approve_if_sum_lte: rulesRows[0].approve_if_sum_lte,
          };
        }
      }

      latestAttemptDebug = {
        attemptId: latestAttempt.id,
        outcome: latestAttempt.outcome,
        quizConfigVersion: latestAttempt.quiz_config_version,
        phase1Score: latestAttempt.phase_scores_json?.phase_1 || null,
        phase1Rules,
        phase1NonZero,
        phase1SelectionsCount: phase1Selections.length,
      };
    }

    // Get screening bans
    const screeningBans = await sql`
      SELECT sb.*, a.email as banned_by_email
      FROM screening_bans sb
      LEFT JOIN admin_users a ON sb.banned_by_admin_id = a.id
      WHERE sb.user_id = ${userId}
      ORDER BY sb.created_at DESC
    `;

    // Get behavior bans
    const behaviorBans = await sql`
      SELECT bb.*, a.email as banned_by_email
      FROM behavior_bans bb
      LEFT JOIN admin_users a ON bb.banned_by_admin_id = a.id
      WHERE bb.user_id = ${userId}
      ORDER BY bb.created_at DESC
    `;

    // Get reports about this user
    const reports = await sql`
      SELECT ur.*, 
        reporter.email as reporter_email,
        admin.email as assigned_to_email
      FROM user_reports ur
      LEFT JOIN users reporter ON ur.reporter_user_id = reporter.id
      LEFT JOIN admin_users admin ON ur.assigned_to_admin_id = admin.id
      WHERE ur.reported_user_id = ${userId}
      ORDER BY ur.created_at DESC
    `;

    return Response.json({
      user: userWithEngagement,
      profile: profile || null,
      attempts,
      attemptsDetailed,
      latestAttemptDebug,
      screeningBans,
      behaviorBans,
      reports,
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    return Response.json(
      { error: "Failed to fetch user details" },
      { status: 500 },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const userId = Number(params.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await request.json();

    const isVerified = body?.isVerified;
    const basics = body?.basics;

    const hasIsVerified = typeof isVerified === "boolean";
    const hasBasics = !!basics && typeof basics === "object";

    if (!hasIsVerified && !hasBasics) {
      return Response.json({ error: "Nothing to update" }, { status: 400 });
    }

    const safeStr = (v) => {
      const s = String(v ?? "").trim();
      return s;
    };

    const sanitizedBasics = hasBasics
      ? {
          height: safeStr(basics.height),
          jobTitle: safeStr(basics.jobTitle),
          company: safeStr(basics.company),
          education: safeStr(basics.education),
          lookingFor: safeStr(basics.lookingFor),
          sexuality: safeStr(basics.sexuality),
        }
      : {};

    // Keep a combined work string for older parts of the app.
    const jobTitleTrimmed = safeStr(sanitizedBasics.jobTitle);
    const companyTrimmed = safeStr(sanitizedBasics.company);
    const workCombined =
      jobTitleTrimmed && companyTrimmed
        ? `${jobTitleTrimmed} at ${companyTrimmed}`
        : jobTitleTrimmed
          ? jobTitleTrimmed
          : companyTrimmed
            ? `Works at ${companyTrimmed}`
            : safeStr(basics?.work);

    if (hasBasics) {
      sanitizedBasics.work = workCombined;
    }

    const basicsJson = JSON.stringify(sanitizedBasics);

    const rows = await sql(
      `WITH u AS (
        SELECT id, email
        FROM users
        WHERE id = $1
        LIMIT 1
      ),
      upserted AS (
        INSERT INTO user_profiles (user_id, display_name, is_verified, preferences, updated_at)
        SELECT
          u.id,
          u.email,
          $2,
          CASE
            WHEN $3 THEN jsonb_build_object('basics', $4::jsonb)
            ELSE '{}'::jsonb
          END,
          NOW()
        FROM u
        ON CONFLICT (user_id) DO UPDATE
        SET
          is_verified = CASE WHEN $5 THEN $2 ELSE user_profiles.is_verified END,
          verification_status = CASE
            WHEN $5 THEN CASE WHEN $2 THEN 'approved' ELSE 'rejected' END
            ELSE user_profiles.verification_status
          END,
          verification_reviewed_at = CASE WHEN $5 THEN NOW() ELSE user_profiles.verification_reviewed_at END,
          preferences = CASE
            WHEN $3 THEN
              COALESCE(user_profiles.preferences, '{}'::jsonb)
              || jsonb_build_object(
                'basics',
                COALESCE(user_profiles.preferences->'basics', '{}'::jsonb) || $4::jsonb
              )
            ELSE user_profiles.preferences
          END,
          updated_at = NOW()
        RETURNING user_id, display_name, age, birthdate, gender, bio, location, photos, preferences,
                 is_verified, is_visible, verification_photo_url, verification_status,
                 verification_submitted_at, verification_reviewed_at, verified_gender, updated_at
      )
      SELECT * FROM upserted`,
      [
        userId,
        hasIsVerified ? isVerified : false,
        hasBasics,
        basicsJson,
        hasIsVerified,
      ],
    );

    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ profile: rows[0] });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return Response.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
