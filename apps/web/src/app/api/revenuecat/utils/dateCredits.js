import sql from "@/app/api/utils/sql";

export const REQUIRED_CENTS = 3000;

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply a single date-credit purchase idempotently.
 *
 * Idempotency keys:
 * - revenuecatEventId stored as meta.revenuecat_event_id
 * - transactionId stored as meta.revenuecat_transaction_id
 */
export async function applyDateCreditPurchase({
  userId,
  revenuecatEventId,
  transactionId,
  rawEvent,
  productId,
}) {
  const uid = safeNumber(userId);
  if (!Number.isFinite(uid)) {
    throw new Error("applyDateCreditPurchase requires a numeric userId");
  }

  // Ensure wallet exists
  await sql`
    INSERT INTO date_credit_wallets (user_id)
    VALUES (${uid})
    ON CONFLICT (user_id)
    DO NOTHING
  `;

  // Normalize/cast-able values for SQL.
  const eventIdText =
    revenuecatEventId != null ? String(revenuecatEventId) : null;
  const txnIdText = transactionId != null ? String(transactionId) : null;
  const productIdText = productId != null ? String(productId) : null;

  // Ledger insert + wallet increment as one atomic statement.
  // Build meta JSON in JavaScript to avoid Neon parameter type inference
  // issues with jsonb_build_object.
  const meta = JSON.stringify({
    source: "revenuecat",
    revenuecat_event_id: eventIdText,
    revenuecat_transaction_id: txnIdText,
    product_id: productIdText,
    raw: rawEvent || {},
  });

  // Check for idempotency — was this event or transaction already applied?
  let alreadyExists = false;

  if (eventIdText) {
    const existsCheck = await sql(
      `SELECT 1 AS exists FROM date_credit_ledger
       WHERE user_id = $1
         AND action = 'PURCHASE'
         AND (meta->>'revenuecat_event_id') = $2
       LIMIT 1`,
      [uid, eventIdText],
    );
    if (existsCheck?.length) alreadyExists = true;
  }

  if (!alreadyExists && txnIdText) {
    const existsCheck = await sql(
      `SELECT 1 AS exists FROM date_credit_ledger
       WHERE user_id = $1
         AND action = 'PURCHASE'
         AND (meta->>'revenuecat_transaction_id') = $2
       LIMIT 1`,
      [uid, txnIdText],
    );
    if (existsCheck?.length) alreadyExists = true;
  }

  // Also check if the client-side claim already applied this transaction
  // (the claim endpoint stores the same transaction id under a different key).
  if (!alreadyExists && txnIdText) {
    const existsCheck = await sql(
      `SELECT 1 AS exists FROM date_credit_ledger
       WHERE user_id = $1
         AND action = 'PURCHASE'
         AND (meta->>'client_transaction_id') = $2
       LIMIT 1`,
      [uid, txnIdText],
    );
    if (existsCheck?.length) alreadyExists = true;
  }

  if (alreadyExists) {
    return { ok: true, alreadyApplied: true };
  }

  // Apply: insert ledger entry + update wallet
  await sql.transaction([
    sql(
      `INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
       VALUES ($1, NULL, 'PURCHASE', $2, $3::jsonb)`,
      [uid, REQUIRED_CENTS, meta],
    ),
    sql`
      UPDATE date_credit_wallets
      SET balance_cents = balance_cents + ${REQUIRED_CENTS},
          updated_at = now()
      WHERE user_id = ${uid}
    `,
  ]);

  return { ok: true, alreadyApplied: false };
}
