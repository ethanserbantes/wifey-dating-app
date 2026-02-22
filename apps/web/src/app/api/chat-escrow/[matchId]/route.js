import sql from "@/app/api/utils/sql";
import { sendChatStartedPushNotification } from "@/app/api/utils/pushNotifications";

const REQUIRED_CENTS = 3000;
// NEW: Only treat very old chats as "legacy unlocked".
// This prevents new Pre-Chats (where both users have sent 1 message) from bypassing date credits.
const LEGACY_UNLOCK_MATCH_AGE_DAYS = 30;

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

  if (!rows || rows.length === 0) {
    return null;
  }

  return rows[0];
}

async function ensureWalletRow(userIdNum) {
  await sql`
    INSERT INTO date_credit_wallets (user_id)
    VALUES (${userIdNum})
    ON CONFLICT (user_id)
    DO NOTHING
  `;

  const rows = await sql`
    SELECT user_id, balance_cents
    FROM date_credit_wallets
    WHERE user_id = ${userIdNum}
    LIMIT 1
  `;

  return rows?.[0] || { user_id: userIdNum, balance_cents: 0 };
}

async function ensureEscrowRow(matchIdNum, user1Id, user2Id) {
  await sql`
    INSERT INTO match_chat_escrows (match_id, user1_id, user2_id)
    VALUES (${matchIdNum}, ${Number(user1Id)}, ${Number(user2Id)})
    ON CONFLICT (match_id)
    DO UPDATE SET
      updated_at = now(),
      user1_id = EXCLUDED.user1_id,
      user2_id = EXCLUDED.user2_id,
      -- If older data was written with swapped user1/user2 ordering,
      -- keep deposits attached to the same *person* by swapping the columns when needed.
      user1_deposit_cents = CASE
        WHEN match_chat_escrows.user1_id = EXCLUDED.user1_id THEN match_chat_escrows.user1_deposit_cents
        ELSE match_chat_escrows.user2_deposit_cents
      END,
      user2_deposit_cents = CASE
        WHEN match_chat_escrows.user1_id = EXCLUDED.user1_id THEN match_chat_escrows.user2_deposit_cents
        ELSE match_chat_escrows.user1_deposit_cents
      END,
      user1_deposited_at = CASE
        WHEN match_chat_escrows.user1_id = EXCLUDED.user1_id THEN match_chat_escrows.user1_deposited_at
        ELSE match_chat_escrows.user2_deposited_at
      END,
      user2_deposited_at = CASE
        WHEN match_chat_escrows.user1_id = EXCLUDED.user1_id THEN match_chat_escrows.user2_deposited_at
        ELSE match_chat_escrows.user1_deposited_at
      END
  `;

  const rows = await sql`
    SELECT
      match_id,
      user1_id,
      user2_id,
      user1_deposit_cents,
      user2_deposit_cents,
      unlocked_at,
      updated_at
    FROM match_chat_escrows
    WHERE match_id = ${matchIdNum}
    LIMIT 1
  `;

  return rows?.[0] || null;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeTier(value) {
  const t = String(value || "")
    .toLowerCase()
    .trim();
  if (t === "committed") return "committed";
  if (t === "serious") return "serious";
  return null;
}

function commitLimitForTier(tier) {
  // Product rule:
  // - default: 1 active chat credit at a time
  // - Committed: up to 3 (first + two additional)
  return tier === "committed" ? 3 : 1;
}

async function getOverrideTier(userIdNum) {
  if (!Number.isFinite(Number(userIdNum))) return null;

  const rows = await sql`
    SELECT tier, expires_at
    FROM user_subscription_overrides
    WHERE user_id = ${Number(userIdNum)}
    LIMIT 1
  `;

  const row = rows?.[0] || null;
  if (!row) return null;

  const tier = normalizeTier(row?.tier);
  if (!tier) return null;

  // expires_at is optional
  const expiresAt = row?.expires_at ? new Date(row.expires_at) : null;
  if (expiresAt && Number.isFinite(expiresAt.getTime())) {
    if (expiresAt.getTime() <= Date.now()) return null;
  }

  return tier;
}

async function countActiveCommittedChats(userIdNum) {
  // Count how many matches this user has committed $30 to.
  // We only count rows where the match still exists (unmatch deletes matches).
  // IMPORTANT: archived/hidden or blocked chats should NOT count against this limit.
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM match_chat_escrows e
    INNER JOIN matches m ON m.id = e.match_id
    WHERE (
      (e.user1_id = ${userIdNum} AND e.user1_deposit_cents >= ${REQUIRED_CENTS})
      OR
      (e.user2_id = ${userIdNum} AND e.user2_deposit_cents >= ${REQUIRED_CENTS})
    )
    AND NOT EXISTS (
      SELECT 1
      FROM user_match_archives a
      WHERE a.match_id = e.match_id
        AND a.user_id = ${userIdNum}
    )
    AND NOT EXISTS (
      SELECT 1
      FROM user_blocks b
      WHERE (
        b.blocker_user_id = ${userIdNum}
        AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END)
      )
      OR (
        b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END)
        AND b.blocked_user_id = ${userIdNum}
      )
    )
  `;

  return Number(rows?.[0]?.n || 0);
}

// ADD: detect legacy chats that already have real back-and-forth messages.
// If so, we treat the chat as unlocked even if escrow deposits were never created
// (this fixes older accounts that had messages before date credits existed).
async function isLegacyUnlocked(matchIdNum) {
  // NEW: only apply legacy unlock for older matches.
  // Without this, any Pre-Chat where both people send 1 message would become "free".
  try {
    const m = await sql`
      SELECT created_at
      FROM matches
      WHERE id = ${matchIdNum}
      LIMIT 1
    `;

    const createdAt = m?.[0]?.created_at ? new Date(m[0].created_at) : null;
    const isValidDate = createdAt && Number.isFinite(createdAt.getTime());
    if (!isValidDate) {
      return false;
    }

    const cutoffMs =
      Date.now() - LEGACY_UNLOCK_MATCH_AGE_DAYS * 24 * 60 * 60 * 1000;
    const isOld = createdAt.getTime() < cutoffMs;
    if (!isOld) {
      return false;
    }
  } catch (e) {
    console.error("[chat-escrow] legacy match age check failed", e);
    return false;
  }

  const rows = await sql`
    SELECT COUNT(DISTINCT sender_id)::int AS n_senders
    FROM chat_messages cm
    WHERE cm.match_id = ${matchIdNum}
      AND cm.sender_id IS NOT NULL
      AND COALESCE(cm.message_type, 'TEXT') NOT IN (
        'DATE_FEEDBACK',
        'SYSTEM',
        'SYSTEM_HINT',
        'CHAT_CREDIT_REQUIRED'
      )
      AND NOT (LOWER(COALESCE(cm.message_text, '')) LIKE 'start the chat with %')
      AND NOT (
        LOWER(COALESCE(cm.message_text, '')) LIKE '%start with intent%'
        OR LOWER(COALESCE(cm.message_text, '')) LIKE '%date credit%'
        OR LOWER(COALESCE(cm.message_text, '')) LIKE '%unlock%'
        OR LOWER(COALESCE(cm.message_text, '')) LIKE '%$30%'
        OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add a $30%'
        OR LOWER(COALESCE(cm.message_text, '')) LIKE '%add $30%'
      )
  `;

  const n = Number(rows?.[0]?.n_senders || 0);
  return n >= 2; // require both users have spoken
}

function computeStatus({ wallet, legacyUnlocked }) {
  const legacy = Boolean(legacyUnlocked);
  const walletBalance = Number(wallet?.balance_cents || 0);

  // NEW POLICY:
  // Credits are NOT "committed" per match anymore. A user either has a credit
  // in their wallet or they don't.
  const hasCredit = walletBalance >= REQUIRED_CENTS;

  return {
    requiredCents: REQUIRED_CENTS,
    walletBalanceCents: walletBalance,

    // Backwards-compat fields used by older clients.
    myDepositCents: 0,
    otherDepositCents: 0,
    myCommitted: legacy ? true : hasCredit,
    otherCommitted: legacy ? true : hasCredit,
    isMutual: legacy ? true : hasCredit,
    unlockedAt: null,

    legacyUnlocked: legacy,

    tier: null,
    myActiveCommittedCount: 0,
    myCommitLimit: 0,
  };
}

export async function GET(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    const { searchParams } = new URL(request.url);
    const userIdNum = Number(searchParams.get("userId"));

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

    const wallet = await ensureWalletRow(userIdNum);

    // Keep legacy unlock detection for truly old chats.
    const legacyUnlocked = await isLegacyUnlocked(matchIdNum);

    return Response.json({
      status: computeStatus({ wallet, legacyUnlocked }),
    });
  } catch (e) {
    console.error("GET /api/chat-escrow/[matchId] error", e);
    return Response.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    const body = await request.json().catch(() => ({}));
    const userIdNum = Number(body?.userId);

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

    const wallet = await ensureWalletRow(userIdNum);
    const legacyUnlocked = await isLegacyUnlocked(matchIdNum);

    const status = computeStatus({ wallet, legacyUnlocked });

    // Backwards-compatible behavior:
    // - If they don't have a credit, respond 402 so old clients can route to purchase.
    // - If they do, return success but do NOT deduct or attach it to this match.
    if (!status.myCommitted) {
      return Response.json(
        {
          error: "Insufficient date credits",
          code: "INSUFFICIENT_CREDITS",
          status,
        },
        { status: 402 },
      );
    }

    // Best-effort: in the old world we would push the other user when someone committed.
    // We keep this (non-blocking) because it can still be useful as an "I'm ready" nudge.
    try {
      const otherUserIdNum =
        Number(access.user1_id) === Number(userIdNum)
          ? Number(access.user2_id)
          : Number(access.user1_id);

      if (Number.isFinite(otherUserIdNum)) {
        await sendChatStartedPushNotification({
          toUserId: otherUserIdNum,
          fromUserId: userIdNum,
          matchId: matchIdNum,
        });
      }
    } catch (e) {
      console.error("Could not send chat-started push", e);
    }

    return Response.json({ status, alreadyCommitted: true });
  } catch (e) {
    console.error("POST /api/chat-escrow/[matchId] error", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
