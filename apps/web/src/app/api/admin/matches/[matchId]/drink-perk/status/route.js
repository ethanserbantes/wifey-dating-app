import sql from "@/app/api/utils/sql";

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function getPushDebugForUsers(userIds) {
  const ids = (userIds || []).map((x) => Number(x)).filter(Number.isFinite);
  if (ids.length === 0) return {};

  const tokenCounts = await sql`
    SELECT user_id, COUNT(*)::int AS count
    FROM user_push_tokens
    WHERE user_id = ANY(${ids})
    GROUP BY user_id
  `;

  const prefsRows = await sql`
    SELECT user_id, enable_all, mute_all, announcements
    FROM user_notification_preferences
    WHERE user_id = ANY(${ids})
  `;

  const byUser = {};

  for (const id of ids) {
    byUser[id] = {
      tokenCount: 0,
      prefs: {
        enableAll: true,
        muteAll: false,
        announcements: true,
      },
    };
  }

  for (const row of tokenCounts || []) {
    const uid = Number(row.user_id);
    if (!Number.isFinite(uid)) continue;
    if (!byUser[uid]) byUser[uid] = {};
    byUser[uid].tokenCount = Number(row.count) || 0;
  }

  for (const row of prefsRows || []) {
    const uid = Number(row.user_id);
    if (!Number.isFinite(uid)) continue;
    if (!byUser[uid]) byUser[uid] = {};
    byUser[uid].prefs = {
      enableAll: row.enable_all !== false,
      muteAll: row.mute_all === true,
      announcements: row.announcements !== false,
    };
  }

  return byUser;
}

// Admin/dev helper: inspect the current drink perk state for a match.
export async function GET(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

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

    const perkRows = await sql`
      SELECT match_id, state, together_since, ready_at, redeemed_at, updated_at
      FROM match_drink_perks
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const perk = perkRows?.[0] || null;

    const creditRows = await sql`
      SELECT id, token, unlocked_at, expires_at, redeemed_at
      FROM drink_credits
      WHERE match_id = ${matchIdNum}
      ORDER BY id DESC
      LIMIT 1
    `;

    const credit = creditRows?.[0]
      ? {
          id: Number(creditRows[0].id),
          token: String(creditRows[0].token || ""),
          unlockedAt: toIsoOrNull(creditRows[0].unlocked_at),
          expiresAt: toIsoOrNull(creditRows[0].expires_at),
          redeemedAt: toIsoOrNull(creditRows[0].redeemed_at),
        }
      : null;

    const sessionRows = await sql`
      SELECT id, initiator_user_id, responder_user_id, responder_confirmed_at, expires_at, completed_at
      FROM drink_handshake_sessions
      WHERE match_id = ${matchIdNum}
        AND completed_at IS NULL
        AND expires_at > now()
      ORDER BY id DESC
      LIMIT 1
    `;

    const s = sessionRows?.[0] || null;

    const dateRows = await sql`
      SELECT date_status
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const dateStatus = String(dateRows?.[0]?.date_status || "none");
    const hasDatePlan = dateStatus !== "none" && dateStatus !== "expired";

    const user1Id = Number(match.user1_id);
    const user2Id = Number(match.user2_id);
    const pushDebug = await getPushDebugForUsers([user1Id, user2Id]);

    return Response.json({
      ok: true,
      match: {
        matchId: matchIdNum,
        user1Id,
        user2Id,
      },
      date: { hasDatePlan, dateStatus },
      perk: perk
        ? {
            state: String(perk.state || "LOCKED"),
            togetherSince: toIsoOrNull(perk.together_since),
            readyAt: toIsoOrNull(perk.ready_at),
            redeemedAt: toIsoOrNull(perk.redeemed_at),
            updatedAt: toIsoOrNull(perk.updated_at),
          }
        : null,
      handshake: {
        active: Boolean(s),
        session: s
          ? {
              id: Number(s.id),
              initiatorUserId: Number(s.initiator_user_id),
              responderUserId:
                s.responder_user_id != null
                  ? Number(s.responder_user_id)
                  : null,
              responderConfirmedAt: toIsoOrNull(s.responder_confirmed_at),
              expiresAt: toIsoOrNull(s.expires_at),
            }
          : null,
      },
      credit,
      pushDebug: {
        [user1Id]: pushDebug?.[user1Id] || null,
        [user2Id]: pushDebug?.[user2Id] || null,
      },
    });
  } catch (error) {
    console.error("[ADMIN][DRINK][STATUS] Error:", error);
    return Response.json(
      { error: "Failed to load drink status" },
      { status: 500 },
    );
  }
}
