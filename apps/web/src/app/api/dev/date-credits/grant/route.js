import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    // Safety: dev-only.
    // NOTE: In Anything, NODE_ENV can be "production" even on dev previews.
    // Use the platform ENV flag instead.
    const env = String(process.env.ENV || "").toLowerCase();
    if (env === "production") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const userIdNum = Number(body?.userId);
    const amountCentsNum = Number(body?.amountCents);

    if (!Number.isFinite(userIdNum) || !Number.isFinite(amountCentsNum)) {
      return Response.json(
        { error: "userId and amountCents required" },
        { status: 400 },
      );
    }

    const safeAmount = Math.max(0, Math.round(amountCentsNum));

    await sql`
      INSERT INTO date_credit_wallets (user_id, balance_cents)
      VALUES (${userIdNum}, ${safeAmount})
      ON CONFLICT (user_id)
      DO UPDATE SET balance_cents = date_credit_wallets.balance_cents + ${safeAmount},
                    updated_at = now()
    `;

    try {
      await sql`
        INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
        VALUES (${userIdNum}, NULL, 'DEV_GRANT', ${safeAmount}, '{}'::jsonb)
      `;
    } catch (e) {
      console.error("Failed to write date_credit_ledger", e);
    }

    const rows = await sql`
      SELECT user_id, balance_cents
      FROM date_credit_wallets
      WHERE user_id = ${userIdNum}
      LIMIT 1
    `;

    return Response.json({ wallet: rows?.[0] || null });
  } catch (e) {
    console.error("POST /api/dev/date-credits/grant error", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
