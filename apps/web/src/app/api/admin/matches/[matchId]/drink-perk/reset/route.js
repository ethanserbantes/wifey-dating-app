import sql from "@/app/api/utils/sql";

// Dev-only helper: reset the Drink on Us state for a match so you can re-test.
// This clears handshake sessions + credits, and moves match_drink_perks back to ARMED (if a date exists) or LOCKED.
export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const matchRows = await sql`
      SELECT id
      FROM matches
      WHERE id = ${matchIdNum}
      LIMIT 1
    `;

    if (!matchRows || matchRows.length === 0) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const dateRows = await sql`
      SELECT date_status
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const dateStatus = String(dateRows?.[0]?.date_status || "none");
    const hasDatePlan = dateStatus !== "none" && dateStatus !== "expired";

    const nextState = hasDatePlan ? "ARMED" : "LOCKED";

    await sql.transaction((txn) => [
      txn`
        DELETE FROM drink_handshake_sessions
        WHERE match_id = ${matchIdNum}
      `,
      txn`
        DELETE FROM drink_credits
        WHERE match_id = ${matchIdNum}
      `,
      txn`
        INSERT INTO match_drink_perks (match_id, state, together_since, ready_at, redeemed_at, updated_at)
        VALUES (${matchIdNum}, ${nextState}, NULL, NULL, NULL, now())
        ON CONFLICT (match_id)
        DO UPDATE SET
          state = EXCLUDED.state,
          together_since = NULL,
          ready_at = NULL,
          redeemed_at = NULL,
          updated_at = now()
      `,
    ]);

    return Response.json({
      ok: true,
      matchId: matchIdNum,
      state: nextState,
      hasDatePlan,
    });
  } catch (error) {
    console.error("[ADMIN][DRINK][RESET] Error:", error);
    return Response.json(
      { error: "Failed to reset drink perk" },
      { status: 500 },
    );
  }
}
