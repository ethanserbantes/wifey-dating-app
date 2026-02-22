import sql from "@/app/api/utils/sql";

function normalizeTier(value) {
  const t = String(value || "")
    .toLowerCase()
    .trim();
  if (t === "committed") return "committed";
  if (t === "serious") return "serious";
  return null;
}

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
      return Response.json({ error: "Invalid match id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));

    const force = body?.force !== false;

    // Preferred payload: pass the two user IDs + their tiers so we can map correctly
    const fakeUserId = Number(body?.fakeUserId);
    const otherUserId = Number(body?.otherUserId);
    const fakeTier = normalizeTier(body?.fakeTier);
    const otherTier = normalizeTier(body?.otherTier);

    // Backwards compatible payload (older admin UI)
    const legacyUser1Tier = normalizeTier(body?.user1Tier);
    const legacyUser2Tier = normalizeTier(body?.user2Tier);

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

    // Map tiers to the correct side (user1/user2)
    let user1Tier = legacyUser1Tier;
    let user2Tier = legacyUser2Tier;

    if (Number.isFinite(fakeUserId) && Number.isFinite(otherUserId)) {
      // Ensure the given users are actually participants.
      const participantsOk =
        (fakeUserId === Number(match.user1_id) ||
          fakeUserId === Number(match.user2_id)) &&
        (otherUserId === Number(match.user1_id) ||
          otherUserId === Number(match.user2_id));

      if (participantsOk) {
        user1Tier =
          fakeUserId === Number(match.user1_id) ? fakeTier : otherTier;
        user2Tier =
          fakeUserId === Number(match.user2_id) ? fakeTier : otherTier;
      }
    }

    // If the match was previously terminal (expired/unavailable), allow admin to force reopen.
    // We keep this behind `force` so it doesn't silently resurrect old matches.
    const stateRows = await sql`
      SELECT *
      FROM match_conversation_states
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const existingState = stateRows?.[0] || null;
    if (existingState?.terminal_state && !force) {
      return Response.json(
        {
          error: "This match is no longer available.",
          code: "TERMINAL",
          terminalState: existingState.terminal_state,
        },
        { status: 409 },
      );
    }

    // Ensure state row exists.
    await sql`
      INSERT INTO match_conversation_states (match_id, user1_id, user2_id)
      VALUES (${matchIdNum}, ${Number(match.user1_id)}, ${Number(match.user2_id)})
      ON CONFLICT (match_id)
      DO UPDATE SET
        updated_at = now(),
        user1_id = EXCLUDED.user1_id,
        user2_id = EXCLUDED.user2_id
    `;

    // Force both consents and activate immediately.
    // Note: we intentionally clear terminal_state/terminal_at so this can be used for testing.
    await sql`
      UPDATE match_conversation_states
      SET
        user1_consented_at = COALESCE(user1_consented_at, now()),
        user2_consented_at = COALESCE(user2_consented_at, now()),
        user1_tier = COALESCE(${user1Tier}, user1_tier),
        user2_tier = COALESCE(${user2Tier}, user2_tier),
        active_at = COALESCE(active_at, now()),
        expires_at = COALESCE(expires_at, now() + interval '7 days'),
        terminal_state = CASE WHEN ${force} THEN NULL ELSE terminal_state END,
        terminal_at = CASE WHEN ${force} THEN NULL ELSE terminal_at END,
        updated_at = now()
      WHERE match_id = ${matchIdNum}
    `;

    const finalRows = await sql`
      SELECT *
      FROM match_conversation_states
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const s = finalRows?.[0] || null;

    return Response.json({
      ok: true,
      matchId: matchIdNum,
      status: {
        isActive: Boolean(s?.active_at) && !s?.terminal_state,
        activeAt: toIsoOrNull(s?.active_at),
        terminalState: s?.terminal_state ? String(s.terminal_state) : null,
        user1Consented: Boolean(s?.user1_consented_at),
        user2Consented: Boolean(s?.user2_consented_at),
        user1Tier: s?.user1_tier ? String(s.user1_tier) : null,
        user2Tier: s?.user2_tier ? String(s.user2_tier) : null,
      },
    });
  } catch (error) {
    console.error("[ADMIN][MATCHES][ACTIVATE_CHAT] Error:", error);
    return Response.json({ error: "Failed to activate chat" }, { status: 500 });
  }
}
