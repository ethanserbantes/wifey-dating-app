import sql from "@/app/api/utils/sql";

export async function recordMatchDateEvent({
  matchId,
  actorUserId,
  eventType,
  occurredAt,
  meta,
}) {
  try {
    const matchIdNum = Number(matchId);
    if (!Number.isFinite(matchIdNum)) {
      throw new Error("matchId is required");
    }

    const actorIdNumRaw = actorUserId == null ? null : Number(actorUserId);
    const actorIdNum = Number.isFinite(actorIdNumRaw) ? actorIdNumRaw : null;

    const type = String(eventType || "").trim();
    if (!type) {
      throw new Error("eventType is required");
    }

    const metaObj = meta && typeof meta === "object" ? meta : {};
    const metaJson = JSON.stringify(metaObj);

    const when = occurredAt ? new Date(occurredAt) : null;
    const occurredAtValue = when && !Number.isNaN(when.getTime()) ? when : null;

    if (occurredAtValue) {
      await sql`
        INSERT INTO match_date_events (match_id, actor_user_id, event_type, occurred_at, meta)
        VALUES (${matchIdNum}, ${actorIdNum}, ${type}, ${occurredAtValue}, ${metaJson}::jsonb)
      `;
    } else {
      await sql`
        INSERT INTO match_date_events (match_id, actor_user_id, event_type, meta)
        VALUES (${matchIdNum}, ${actorIdNum}, ${type}, ${metaJson}::jsonb)
      `;
    }
  } catch (error) {
    // Important: date events should never break core flows.
    console.error("[DATE_EVENTS] Failed to record event", error);
  }
}
