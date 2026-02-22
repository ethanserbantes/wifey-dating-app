import sql from "@/app/api/utils/sql";

function parseUserId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.trunc(n);
}

function dateHistoryLabelFromCount(count) {
  const n = Number(count);
  const c = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;

  if (c === 0) return "0 dates on Wifey";
  if (c <= 2) return "1–2 dates";
  if (c <= 5) return "3–5 dates";
  return "5+ dates";
}

function followThroughLabelFromRate({ completedCount, missedCount }) {
  const completed = Number.isFinite(Number(completedCount))
    ? Math.max(0, Math.trunc(Number(completedCount)))
    : 0;
  const missed = Number.isFinite(Number(missedCount))
    ? Math.max(0, Math.trunc(Number(missedCount)))
    : 0;

  const total = completed + missed;

  // Not enough signal.
  if (total < 2) {
    return "Not enough data yet";
  }

  const rate = completed / total;

  if (rate >= 0.8) return "Shows up consistently";
  if (rate >= 0.4) return "Occasionally cancels";
  return "Rarely follows through";
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = parseUserId(searchParams.get("userId"));

    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    // Use match_date_events for durable history (supports follow-through).
    const rows = await sql(
      `
      WITH my_matches AS (
        SELECT id
        FROM matches
        WHERE user1_id = $1 OR user2_id = $1
      )
      SELECT
        COUNT(*) FILTER (WHERE e.event_type = 'DATE_COMPLETED')::int AS completed_count,
        COUNT(*) FILTER (WHERE e.event_type IN ('DATE_EXPIRED', 'DATE_CANCELED', 'DATE_DECLINED'))::int AS missed_count
      FROM match_date_events e
      JOIN my_matches mm ON mm.id = e.match_id
      `,
      [userId],
    );

    const row = rows?.[0] || {};

    const completedCount = Number(row.completed_count) || 0;
    const missedCount = Number(row.missed_count) || 0;

    const dateHistoryLabel = dateHistoryLabelFromCount(completedCount);
    const followThroughLabel = followThroughLabelFromRate({
      completedCount,
      missedCount,
    });

    return Response.json({
      userId,
      dateHistoryLabel,
      followThroughLabel,
      // These are safe to keep for debugging / future tuning; the UI only shows labels.
      completedCount,
      missedCount,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[DATING_INSIGHTS] Error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
