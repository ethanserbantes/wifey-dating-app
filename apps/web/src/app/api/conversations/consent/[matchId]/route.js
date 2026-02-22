import sql from "@/app/api/utils/sql";
import {
  DATE_CREDIT_REQUIRED_CENTS,
  ensureWalletRows,
  getWalletBalanceCents,
} from "@/app/api/utils/dateCredits";

function normalizeTier(value) {
  const t = String(value || "")
    .toLowerCase()
    .trim();
  if (t === "committed") return "committed";
  if (t === "serious") return "serious";
  return null;
}

function consentLimitForTier(tier) {
  // Product rule:
  // - default: 1 active chat
  // - committed: up to 3 active chats
  return tier === "committed" ? 3 : 1;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function assertMatchAccess(matchIdNum, userIdNum) {
  const rows = await sql`
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

  return rows?.[0] || null;
}

async function ensureStateRow(matchIdNum, user1Id, user2Id) {
  await sql`
    INSERT INTO match_conversation_states (match_id, user1_id, user2_id)
    VALUES (${matchIdNum}, ${Number(user1Id)}, ${Number(user2Id)})
    ON CONFLICT (match_id)
    DO UPDATE SET
      updated_at = now(),
      user1_id = EXCLUDED.user1_id,
      user2_id = EXCLUDED.user2_id
  `;

  const rows = await sql`
    SELECT *
    FROM match_conversation_states
    WHERE match_id = ${matchIdNum}
    LIMIT 1
  `;

  return rows?.[0] || null;
}

async function countActiveChats(userIdNum) {
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM match_conversation_states s
    INNER JOIN matches m ON m.id = s.match_id
    WHERE s.active_at IS NOT NULL
      AND s.terminal_state IS NULL
      AND (s.user1_id = ${userIdNum} OR s.user2_id = ${userIdNum})
      -- IMPORTANT: archived/hidden chats should NOT count against active chat limits.
      AND NOT EXISTS (
        SELECT 1
        FROM user_match_archives a
        WHERE a.match_id = s.match_id
          AND a.user_id = ${userIdNum}
      )
  `;

  return Number(rows?.[0]?.n || 0);
}

function computeConsentStatus({
  access,
  state,
  userIdNum,
  tier,
  myActiveCount,
}) {
  const isUser1 = Number(access?.user1_id) === Number(userIdNum);

  const myConsentedAt = isUser1
    ? state?.user1_consented_at
    : state?.user2_consented_at;
  const otherConsentedAt = isUser1
    ? state?.user2_consented_at
    : state?.user1_consented_at;

  const myConsented = Boolean(myConsentedAt);
  const otherConsented = Boolean(otherConsentedAt);

  const terminalState = state?.terminal_state
    ? String(state.terminal_state)
    : null;

  const activeAt = state?.active_at;
  const isActive = Boolean(activeAt) && !terminalState;

  const decisionExpiresAt = state?.decision_expires_at;
  const secondsRemaining = decisionExpiresAt
    ? Math.max(
        0,
        Math.floor((new Date(decisionExpiresAt).getTime() - Date.now()) / 1000),
      )
    : null;

  const limit = consentLimitForTier(tier);

  return {
    tier: tier || null,
    myActiveChatCount: Number(myActiveCount || 0),
    myActiveChatLimit: Number(limit),

    myConsented,
    otherConsented,
    isActive,

    terminalState,
    terminalAt: toIsoOrNull(state?.terminal_at),

    decisionStartedForUserId: state?.decision_started_for_user_id ?? null,
    decisionExpiresAt: toIsoOrNull(decisionExpiresAt),
    decisionSecondsRemaining: secondsRemaining,

    activeAt: toIsoOrNull(activeAt),
  };
}

export async function GET(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    const { searchParams } = new URL(request.url);
    const userIdNum = Number(searchParams.get("userId"));
    const clientTier = normalizeTier(searchParams.get("tier"));

    if (!Number.isFinite(matchIdNum) || !Number.isFinite(userIdNum)) {
      return Response.json(
        { error: "Match ID and User ID required" },
        { status: 400 },
      );
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const effectiveTier = clientTier;

    const state = await ensureStateRow(
      matchIdNum,
      access.user1_id,
      access.user2_id,
    );
    const myActiveCount = await countActiveChats(userIdNum);

    return Response.json({
      status: computeConsentStatus({
        access,
        state,
        userIdNum,
        tier: effectiveTier,
        myActiveCount,
      }),
    });
  } catch (e) {
    console.error("GET /api/conversations/consent/[matchId] error", e);
    return Response.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    const body = await request.json().catch(() => ({}));
    const userIdNum = Number(body?.userId);
    const clientTier = normalizeTier(body?.tier);

    if (!Number.isFinite(matchIdNum) || !Number.isFinite(userIdNum)) {
      return Response.json(
        { error: "Match ID and User ID required" },
        { status: 400 },
      );
    }

    const access = await assertMatchAccess(matchIdNum, userIdNum);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const effectiveTier = clientTier;

    // Ensure state exists
    let state = await ensureStateRow(
      matchIdNum,
      access.user1_id,
      access.user2_id,
    );

    if (state?.terminal_state) {
      return Response.json(
        {
          error: "This match is no longer available.",
          code: "NO_LONGER_AVAILABLE",
        },
        { status: 410 },
      );
    }

    // If already active, idempotent
    if (state?.active_at) {
      const myActiveCount = await countActiveChats(userIdNum);
      return Response.json({
        status: computeConsentStatus({
          access,
          state,
          userIdNum,
          tier: effectiveTier,
          myActiveCount,
        }),
        alreadyActive: true,
      });
    }

    // If decision timer expired, close it as expired (neutral terminal state)
    if (
      state?.decision_expires_at &&
      new Date(state.decision_expires_at).getTime() <= Date.now()
    ) {
      await sql`
        UPDATE match_conversation_states
        SET terminal_state = 'expired',
            terminal_at = now(),
            updated_at = now()
        WHERE match_id = ${matchIdNum}
          AND terminal_state IS NULL
          AND active_at IS NULL
      `;

      return Response.json(
        {
          error: "This match is no longer available.",
          code: "EXPIRED",
        },
        { status: 410 },
      );
    }

    // Enforce active-chat limits for the CURRENT user.
    // IMPORTANT: reaching the limit should NOT destroy/hide the match. We just block activation.
    const myLimit = consentLimitForTier(effectiveTier);
    const myActiveCount = await countActiveChats(userIdNum);

    if (myActiveCount >= myLimit) {
      return Response.json(
        {
          error: "You are already at your active chat limit.",
          code: "ACTIVE_CHAT_LIMIT",
          status: computeConsentStatus({
            access,
            state,
            userIdNum,
            tier: effectiveTier,
            myActiveCount,
          }),
        },
        { status: 409 },
      );
    }

    // Set my consent
    const isUser1 = Number(access?.user1_id) === Number(userIdNum);

    if (isUser1) {
      await sql`
        UPDATE match_conversation_states
        SET user1_consented_at = COALESCE(user1_consented_at, now()),
            user1_tier = COALESCE(${effectiveTier}, user1_tier),
            updated_at = now()
        WHERE match_id = ${matchIdNum}
      `;
    } else {
      await sql`
        UPDATE match_conversation_states
        SET user2_consented_at = COALESCE(user2_consented_at, now()),
            user2_tier = COALESCE(${effectiveTier}, user2_tier),
            updated_at = now()
        WHERE match_id = ${matchIdNum}
      `;
    }

    // Reload
    const rows = await sql`
      SELECT * FROM match_conversation_states WHERE match_id = ${matchIdNum} LIMIT 1
    `;
    state = rows?.[0] || state;

    const both =
      Boolean(state?.user1_consented_at) && Boolean(state?.user2_consented_at);

    if (both && !state?.active_at) {
      // Activation gate: enforce BOTH users' active-chat limits using the tiers each user provided.
      const user1Tier = normalizeTier(state?.user1_tier);
      const user2Tier = normalizeTier(state?.user2_tier);
      const user1Limit = consentLimitForTier(user1Tier);
      const user2Limit = consentLimitForTier(user2Tier);
      const user1ActiveCount = await countActiveChats(Number(access.user1_id));
      const user2ActiveCount = await countActiveChats(Number(access.user2_id));

      if (user1ActiveCount >= user1Limit || user2ActiveCount >= user2Limit) {
        return Response.json(
          {
            error: "A user is at their active chat limit.",
            code: "ACTIVE_CHAT_LIMIT",
            blockedUserId:
              user1ActiveCount >= user1Limit
                ? Number(access.user1_id)
                : Number(access.user2_id),
          },
          { status: 409 },
        );
      }

      // NEW: date credit gate.
      // Users can view matches + send pre-chats without credits, but starting an
      // active chat requires a date credit.
      const user1IdNum = Number(access.user1_id);
      const user2IdNum = Number(access.user2_id);

      await ensureWalletRows([user1IdNum, user2IdNum]);

      const [user1Balance, user2Balance] = await Promise.all([
        getWalletBalanceCents(user1IdNum),
        getWalletBalanceCents(user2IdNum),
      ]);

      const missingUserIds = [];
      if (Number(user1Balance) < DATE_CREDIT_REQUIRED_CENTS) {
        missingUserIds.push(user1IdNum);
      }
      if (Number(user2Balance) < DATE_CREDIT_REQUIRED_CENTS) {
        missingUserIds.push(user2IdNum);
      }

      if (missingUserIds.length > 0) {
        // Do NOT activate. Keep the consent timestamps so the chat auto-starts
        // as soon as the missing user(s) buy a credit.
        const myActiveCountAfter = await countActiveChats(userIdNum);

        return Response.json(
          {
            error: "Date credit required to start an active chat.",
            code: "DATE_CREDIT_REQUIRED",
            requiredCents: DATE_CREDIT_REQUIRED_CENTS,
            missingUserIds,
            status: computeConsentStatus({
              access,
              state,
              userIdNum,
              tier: effectiveTier,
              myActiveCount: myActiveCountAfter,
            }),
          },
          { status: 402 },
        );
      }

      // Activate
      await sql`
        UPDATE match_conversation_states
        SET active_at = now(),
            expires_at = now() + interval '7 days',
            updated_at = now()
        WHERE match_id = ${matchIdNum}
          AND active_at IS NULL
          AND terminal_state IS NULL
      `;

      // NOTE: We no longer force-close other pre-chats here.
      // The app hides other matches/pre-chats in the UI while the user is at their chat limit,
      // and the limit enforcement above prevents starting more active chats.

      // Reload again
      const rows2 = await sql`
        SELECT * FROM match_conversation_states WHERE match_id = ${matchIdNum} LIMIT 1
      `;
      state = rows2?.[0] || state;
    }

    const finalMyActiveCount = await countActiveChats(userIdNum);

    return Response.json({
      status: computeConsentStatus({
        access,
        state,
        userIdNum,
        tier: effectiveTier,
        myActiveCount: finalMyActiveCount,
      }),
    });
  } catch (e) {
    console.error("POST /api/conversations/consent/[matchId] error", e);
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}
