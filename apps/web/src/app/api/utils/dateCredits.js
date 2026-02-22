import sql from "@/app/api/utils/sql";

export const DATE_CREDIT_REQUIRED_CENTS = 3000;

async function ensureWalletRow(userIdNum) {
  if (!Number.isFinite(Number(userIdNum))) return;
  await sql`
    INSERT INTO date_credit_wallets (user_id)
    VALUES (${Number(userIdNum)})
    ON CONFLICT (user_id) DO NOTHING
  `;
}

export async function ensureWalletRows(userIds) {
  const ids = Array.isArray(userIds)
    ? userIds.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : [];
  if (!ids.length) return;

  // Insert rows one by one to keep SQL simple/portable.
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await ensureWalletRow(id);
  }
}

export async function getWalletBalanceCents(userIdNum) {
  const id = Number(userIdNum);
  if (!Number.isFinite(id)) return 0;

  await ensureWalletRow(id);

  const rows = await sql`
    SELECT balance_cents
    FROM date_credit_wallets
    WHERE user_id = ${id}
    LIMIT 1
  `;

  return Number(rows?.[0]?.balance_cents || 0);
}

/**
 * Spend exactly one date credit ($30) for a given (userId, matchId, reason).
 *
 * Idempotent: if a SPEND ledger row already exists for this user+match+reason,
 * we do nothing.
 */
export async function spendOneDateCreditForMatch({
  userId,
  matchId,
  reason,
  meta,
}) {
  const userIdNum = Number(userId);
  const matchIdNum = matchId == null ? null : Number(matchId);
  const reasonStr = String(reason || "").trim() || "unknown";

  if (!Number.isFinite(userIdNum)) {
    return { ok: false, error: "Invalid userId" };
  }

  // matchId is optional, but usually present.
  const hasMatchId = matchIdNum != null && Number.isFinite(matchIdNum);

  await ensureWalletRow(userIdNum);

  // NOTE: we keep this as a single SQL statement so we can't accidentally
  // decrement without ledger (or vice versa).
  const rows = await sql(
    `
      WITH already AS (
        SELECT 1 AS exists
        FROM date_credit_ledger
        WHERE user_id = $1
          AND action = 'SPEND'
          AND (
            ($2::int IS NOT NULL AND match_id = $2::int)
            OR ($2::int IS NULL AND match_id IS NULL)
          )
          AND COALESCE(meta->>'reason','') = $3
        LIMIT 1
      ),
      ins AS (
        INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
        SELECT
          $1,
          $2::int,
          'SPEND',
          $4::int,
          jsonb_build_object(
            'reason', $3,
            'meta', $5::jsonb
          )
        WHERE NOT EXISTS (SELECT 1 FROM already)
        RETURNING 1 AS inserted
      ),
      upd AS (
        UPDATE date_credit_wallets
        SET balance_cents = balance_cents - $4::int,
            updated_at = now()
        WHERE user_id = $1
          AND balance_cents >= $4::int
          AND EXISTS (SELECT 1 FROM ins)
        RETURNING balance_cents
      )
      SELECT
        EXISTS (SELECT 1 FROM ins) AS did_insert_ledger,
        EXISTS (SELECT 1 FROM upd) AS did_debit_wallet,
        COALESCE((SELECT balance_cents FROM upd LIMIT 1), (SELECT balance_cents FROM date_credit_wallets WHERE user_id = $1 LIMIT 1)) AS balance_cents
    `,
    [
      userIdNum,
      hasMatchId ? matchIdNum : null,
      reasonStr,
      DATE_CREDIT_REQUIRED_CENTS,
      JSON.stringify(meta || {}),
    ],
  );

  const r = rows?.[0] || null;

  return {
    ok: true,
    didInsertLedger: Boolean(r?.did_insert_ledger),
    didDebitWallet: Boolean(r?.did_debit_wallet),
    balanceCents: Number(r?.balance_cents || 0),
  };
}

export async function spendDateCreditsForUsers({
  userIds,
  matchId,
  reason,
  meta,
}) {
  const ids = Array.isArray(userIds)
    ? userIds.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : [];

  const uniq = Array.from(new Set(ids));
  if (!uniq.length) return { ok: true, results: [] };

  const results = [];
  for (const uid of uniq) {
    // eslint-disable-next-line no-await-in-loop
    const res = await spendOneDateCreditForMatch({
      userId: uid,
      matchId,
      reason,
      meta,
    });
    results.push({ userId: uid, ...res });
  }

  return { ok: true, results };
}
