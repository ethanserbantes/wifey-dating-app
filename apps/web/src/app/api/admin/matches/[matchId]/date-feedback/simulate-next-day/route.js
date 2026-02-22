import sql from "@/app/api/utils/sql";
import { recordMatchDateEvent } from "@/app/api/utils/dateEvents";

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const hoursAgoRaw = Number(body?.hoursAgo);
    const hoursAgo = Number.isFinite(hoursAgoRaw) ? hoursAgoRaw : 13;

    // Default: wipe any existing date feedback for this match so both users get prompted again.
    const resetExisting = body?.resetExisting !== false;

    const matchRows = await sql`
      SELECT id, user1_id, user2_id
      FROM matches
      WHERE id = ${matchIdNum}
      LIMIT 1
    `;

    const match = matchRows?.[0] || null;
    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const nowMs = Date.now();
    const dateStart = new Date(nowMs - hoursAgo * 60 * 60 * 1000);
    // A 60 minute date window is enough for our "next day prompt" logic.
    const dateEnd = new Date(dateStart.getTime() + 60 * 60 * 1000);

    const txn = [];

    txn.push(sql`
      INSERT INTO match_date_plans (match_id, date_status, date_start, date_end, updated_at)
      VALUES (${matchIdNum}, 'unlocked', ${dateStart}, ${dateEnd}, now())
      ON CONFLICT (match_id)
      DO UPDATE SET
        date_start = EXCLUDED.date_start,
        date_end = EXCLUDED.date_end,
        date_status = CASE
          WHEN match_date_plans.date_status = 'none' THEN EXCLUDED.date_status
          ELSE match_date_plans.date_status
        END,
        updated_at = now()
      RETURNING match_id, date_status, date_start, date_end
    `);

    if (resetExisting) {
      txn.push(sql`
        DELETE FROM chat_messages
        WHERE match_id = ${matchIdNum}
          AND message_type = 'DATE_FEEDBACK'
      `);
    }

    const results = await sql.transaction(txn);
    const planRow = results?.[0]?.[0] || null;

    if (planRow && String(planRow.date_status || "") === "unlocked") {
      recordMatchDateEvent({
        matchId: matchIdNum,
        actorUserId: null,
        eventType: "DATE_COMPLETED",
        occurredAt: planRow.date_end
          ? new Date(planRow.date_end).toISOString()
          : new Date().toISOString(),
        meta: { source: "admin_simulate_next_day" },
      });
    }

    return Response.json({
      ok: true,
      matchId: matchIdNum,
      resetExisting,
      datePlan: planRow
        ? {
            matchId: Number(planRow.match_id),
            dateStatus: String(planRow.date_status || ""),
            dateStart: toIsoOrNull(planRow.date_start),
            dateEnd: toIsoOrNull(planRow.date_end),
          }
        : null,
    });
  } catch (error) {
    console.error("[ADMIN][DATE_FEEDBACK][SIMULATE_NEXT_DAY] Error:", error);
    return Response.json(
      { error: "Failed to simulate next-day prompt" },
      { status: 500 },
    );
  }
}
