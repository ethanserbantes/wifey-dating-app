import sql from "@/app/api/utils/sql";

/**
 * POST /api/drink-perk/[matchId]/verify/confirm
 *
 * Scanner submits the token from QR code.
 * Server validates: token exists, unused, not expired, correct match, scanner ≠ issuer.
 * On success: marks date_verified, processes partial refund.
 */

async function assertMatchAccess(matchIdNum, userIdNum) {
  const rows = await sql`
    SELECT m.id, m.user1_id, m.user2_id,
      CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END AS other_user_id
    FROM matches m
    WHERE m.id = ${matchIdNum}
      AND (${userIdNum} = m.user1_id OR ${userIdNum} = m.user2_id)
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_user_id = ${userIdNum} AND b.blocked_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END))
           OR (b.blocker_user_id = (CASE WHEN m.user1_id = ${userIdNum} THEN m.user2_id ELSE m.user1_id END) AND b.blocked_user_id = ${userIdNum})
      )
    LIMIT 1
  `;
  return rows?.[0] || null;
}

async function creditRefundToUser(userIdNum, matchIdNum, amountCents) {
  // Insert a ledger entry and credit the wallet
  await sql`
    INSERT INTO date_credit_wallets (user_id, balance_cents)
    VALUES (${userIdNum}, 0)
    ON CONFLICT (user_id) DO NOTHING
  `;

  await sql`
    INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
    VALUES (
      ${userIdNum},
      ${matchIdNum},
      'REFUND',
      ${amountCents},
      ${JSON.stringify({ reason: "date_verified", source: "qr_verify" })}::jsonb
    )
  `;

  await sql`
    UPDATE date_credit_wallets
    SET balance_cents = balance_cents + ${amountCents},
        updated_at = now()
    WHERE user_id = ${userIdNum}
  `;
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json();
    const scannerUserId = Number(body?.userId);
    const token = String(body?.token || "").trim();

    if (!Number.isFinite(scannerUserId)) {
      return Response.json({ error: "userId required" }, { status: 400 });
    }
    if (!token) {
      return Response.json({ error: "token required" }, { status: 400 });
    }

    // Verify scanner has access to match
    const access = await assertMatchAccess(matchIdNum, scannerUserId);
    if (!access) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    // Check date plan
    const dateRows = await sql`
      SELECT match_id, date_status, date_verified, refund_amount_cents
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;
    const datePlan = dateRows?.[0] || null;
    if (!datePlan) {
      return Response.json({ error: "No date plan found" }, { status: 400 });
    }

    if (datePlan.date_verified) {
      return Response.json(
        {
          error: "Date already verified",
          code: "ALREADY_VERIFIED",
          verified: true,
        },
        { status: 409 },
      );
    }

    // Find and validate token
    const tokenRows = await sql`
      SELECT id, match_id, issuer_user_id, token, expires_at, used_at
      FROM date_verify_tokens
      WHERE token = ${token}
      LIMIT 1
    `;
    const tokenRow = tokenRows?.[0] || null;

    if (!tokenRow) {
      return Response.json(
        { error: "Invalid or expired code", code: "INVALID_TOKEN" },
        { status: 400 },
      );
    }

    if (tokenRow.used_at) {
      return Response.json(
        { error: "This code has already been used", code: "TOKEN_USED" },
        { status: 400 },
      );
    }

    const expiresAt = new Date(tokenRow.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      return Response.json(
        {
          error: "This code has expired. Ask them to generate a new one.",
          code: "TOKEN_EXPIRED",
        },
        { status: 400 },
      );
    }

    if (Number(tokenRow.match_id) !== matchIdNum) {
      return Response.json(
        { error: "Code doesn't match this date", code: "WRONG_MATCH" },
        { status: 400 },
      );
    }

    if (Number(tokenRow.issuer_user_id) === scannerUserId) {
      return Response.json(
        { error: "You can't scan your own code", code: "SELF_SCAN" },
        { status: 400 },
      );
    }

    // All good — mark token as used, verify date, process refunds
    const issuerId = Number(tokenRow.issuer_user_id);
    const refundCents = Number(datePlan.refund_amount_cents) || 1000;

    // Mark token used
    await sql`
      UPDATE date_verify_tokens
      SET used_at = now(), used_by_user_id = ${scannerUserId}
      WHERE id = ${Number(tokenRow.id)}
    `;

    // Mark date as verified
    await sql`
      UPDATE match_date_plans
      SET date_verified = true,
          verified_at = now(),
          verification_method = 'qr',
          updated_at = now()
      WHERE match_id = ${matchIdNum}
    `;

    // Credit refund to both users
    await creditRefundToUser(issuerId, matchIdNum, refundCents);
    await creditRefundToUser(scannerUserId, matchIdNum, refundCents);

    // Also complete the drink perk if not already redeemed
    try {
      await sql`
        UPDATE match_drink_perks
        SET state = 'REDEEMED',
            redeemed_at = now(),
            updated_at = now()
        WHERE match_id = ${matchIdNum}
          AND state != 'REDEEMED'
      `;
    } catch (e) {
      console.error("Could not update drink perk state", e);
    }

    // System message in chat
    try {
      await sql`
        INSERT INTO chat_messages (match_id, sender_id, message_text, is_read)
        VALUES (${matchIdNum}, NULL, ${"✅ Date verified — $" + (refundCents / 100).toFixed(0) + " credit returned to both of you!"}, true)
      `;
    } catch (e) {
      console.error("Could not insert verification system message", e);
    }

    return Response.json({
      ok: true,
      verified: true,
      verificationMethod: "qr",
      refundAmountCents: refundCents,
      refundAmountDisplay: "$" + (refundCents / 100).toFixed(0),
    });
  } catch (e) {
    console.error("POST /api/drink-perk/[matchId]/verify/confirm error", e);
    return Response.json({ error: "Verification failed" }, { status: 500 });
  }
}
