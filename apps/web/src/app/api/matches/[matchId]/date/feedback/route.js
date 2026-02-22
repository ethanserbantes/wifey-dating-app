import sql from "@/app/api/utils/sql";

async function assertMatchAccess(matchIdNum, userIdNum) {
  const accessRows = await sql`
    SELECT
      m.id,
      m.user1_id,
      m.user2_id,
      CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END AS other_user_id
    FROM matches m
    WHERE m.id = ${matchIdNum}
      AND (${userIdNum} = m.user1_id OR ${userIdNum} = m.user2_id)
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE (b.blocker_user_id = ${userIdNum} AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END))
           OR (b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END) AND b.blocked_user_id = ${userIdNum})
      )
    LIMIT 1
  `;

  return accessRows?.[0] || null;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeKey(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.toUpperCase() : null;
}

function assertOneOf(key, allowed, label) {
  if (!key || !allowed.includes(key)) {
    const msg = `${label} invalid`;
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
  }
}

export async function GET(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userIdNum = Number(searchParams.get("userId"));
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const rows = await sql`
      SELECT id, message_text, created_at
      FROM chat_messages
      WHERE match_id = ${matchIdNum}
        AND sender_id = ${userIdNum}
        AND message_type = 'DATE_FEEDBACK'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const r = rows?.[0] || null;
    let parsed = null;
    if (r?.message_text) {
      try {
        parsed = JSON.parse(String(r.message_text));
      } catch {
        parsed = null;
      }
    }

    return Response.json({
      feedback: r
        ? {
            id: Number(r.id),
            createdAt: toIsoOrNull(r.created_at),
            data: parsed,
          }
        : null,
    });
  } catch (error) {
    console.error("[DATE_FEEDBACK_GET] Error:", error);
    return Response.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const userIdNum = Number(body?.userId);

    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const archiveForUser = async () => {
      try {
        await sql`
          INSERT INTO user_match_archives (match_id, user_id, reason)
          VALUES (${matchIdNum}, ${userIdNum}, 'date_review_submitted')
          ON CONFLICT (match_id, user_id)
          DO UPDATE SET
            archived_at = now(),
            reason = EXCLUDED.reason
        `;
      } catch (e) {
        console.error("[DATE_FEEDBACK_POST] Could not archive match", e);
      }
    };

    // Prevent duplicates
    const existing = await sql`
      SELECT id
      FROM chat_messages
      WHERE match_id = ${matchIdNum}
        AND sender_id = ${userIdNum}
        AND message_type = 'DATE_FEEDBACK'
      LIMIT 1
    `;

    if (existing?.length) {
      await archiveForUser();
      return Response.json({ ok: true, alreadySubmitted: true });
    }

    // NEW schema (4 questions)
    const timeSpent = normalizeKey(body?.timeSpent);
    const engagement = normalizeKey(body?.engagement);
    const goAgain = normalizeKey(body?.goAgain);
    const noReason = normalizeKey(body?.noReason);

    const TIME_SPENT = ["LT_10", "MIN10_30", "MIN30_90", "MIN90_PLUS"];
    const ENGAGEMENT = ["YES", "SOMEWHAT", "NO"];
    const GO_AGAIN = ["YES", "MAYBE", "NO"];
    const NO_REASON = [
      "NO_CONNECTION",
      "CONVO_DIDNT_FLOW",
      "NOT_ALIGNED",
      "UNCOMFORTABLE",
    ];

    assertOneOf(timeSpent, TIME_SPENT, "timeSpent");
    assertOneOf(engagement, ENGAGEMENT, "engagement");
    assertOneOf(goAgain, GO_AGAIN, "goAgain");

    const needsFollowup = goAgain === "NO";
    if (needsFollowup) {
      assertOneOf(noReason, NO_REASON, "noReason");
    }

    const payload = {
      type: "date_feedback",
      version: 2,
      matchId: matchIdNum,
      fromUserId: userIdNum,
      toUserId: Number(access.other_user_id),
      createdAt: new Date().toISOString(),

      timeSpent,
      engagement,
      goAgain,
      noReason: needsFollowup ? noReason : null,
    };

    await sql`
      INSERT INTO chat_messages (match_id, sender_id, message_text, message_type, is_read)
      VALUES (${matchIdNum}, ${userIdNum}, ${JSON.stringify(payload)}, 'DATE_FEEDBACK', true)
    `;

    // NEW: move this thread to Hidden/Archived for the reviewer.
    await archiveForUser();

    // If the user said they were uncomfortable, create a user report for admins.
    if (needsFollowup && noReason === "UNCOMFORTABLE") {
      const reportedUserId = Number(access.other_user_id);

      const prior = await sql`
        SELECT COUNT(*)::int AS n
        FROM user_reports
        WHERE reported_user_id = ${reportedUserId}
          AND created_at > (now() - interval '30 days')
      `;

      const priorCount = Number(prior?.[0]?.n) || 0;
      const status = priorCount >= 2 ? "INVESTIGATING" : "PENDING";

      const descriptionObj = {
        matchId: matchIdNum,
        timeSpent,
        engagement,
        goAgain,
        noReason,
        priorReportsLast30Days: priorCount,
        source: "date_feedback",
      };

      await sql`
        INSERT INTO user_reports (reporter_user_id, reported_user_id, report_type, description, status)
        VALUES (${userIdNum}, ${reportedUserId}, 'OTHER', ${JSON.stringify(descriptionObj)}, ${status})
      `;
    }

    return Response.json({ ok: true, archived: true });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const message =
      status === 400 ? String(error?.message || "Invalid") : "Failed to submit";
    console.error("[DATE_FEEDBACK_POST] Error:", error);
    return Response.json({ error: message }, { status });
  }
}
