import sql from "@/app/api/utils/sql";
import argon2 from "argon2";
import { getToken } from "@auth/core/jwt";
import { verifyOtpApiTokenFromRequest } from "@/app/api/utils/otpApiToken";

const REQUIRED_CENTS = 3000;
const CREDIT_PRODUCT_IDS = new Set([
  "date_credit_pro",
  "dating_credit_pro",
  "date_credit_1",
]);

const MAX_CREDITS_DISPLAY = 3;

function normalizeProductId(raw) {
  const s = safeStr(raw);
  if (!s) return "";
  // Some App Store Connect setups use full bundle-style ids like:
  //   com.example.app.date_credit_pro
  // We accept those by reducing to the trailing segment.
  const parts = s
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  const tail = parts.length ? parts[parts.length - 1] : s;
  return tail || s;
}

function isAllowedProductId(raw) {
  const s = safeStr(raw);
  if (!s) return false;
  if (CREDIT_PRODUCT_IDS.has(s)) return true;

  const normalized = normalizeProductId(s);
  return CREDIT_PRODUCT_IDS.has(normalized);
}

async function getWalletStatus(userId) {
  const rows = await sql`
    SELECT balance_cents
    FROM date_credit_wallets
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const balanceCents = Number(rows?.[0]?.balance_cents || 0);
  const rawCredits = Math.floor(balanceCents / REQUIRED_CENTS);
  const credits = Math.max(0, Math.min(MAX_CREDITS_DISPLAY, rawCredits));

  return { balanceCents, credits, maxCredits: MAX_CREDITS_DISPLAY };
}

function safeStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

function looksLikeAppleTransactionId(raw) {
  const s = safeStr(raw);
  // Accept any reasonable non-empty string. StoreKit 1 uses numeric ids,
  // StoreKit 2 / sandbox can produce UUIDs or alphanumeric strings.
  // We just reject obviously bogus values (too short or empty).
  if (s.length < 4) return false;
  return /^[a-zA-Z0-9._-]+$/.test(s);
}

async function resolveUserForClaim(request) {
  // 1) Try NextAuth token from cookies (admin/web auth)
  try {
    const authUrl = process.env.AUTH_URL || "";
    const jwt = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: authUrl.startsWith("https"),
    });

    const email = jwt?.email;
    if (email && typeof email === "string") {
      return { mode: "nextauth", email };
    }
  } catch (e) {
    console.warn(
      "[DATE_CREDITS][CLAIM] NextAuth token parse failed:",
      e?.message,
    );
  }

  // 2) Try OTP API token (mobile OTP auth — primary user auth path)
  const otp = verifyOtpApiTokenFromRequest(request);
  const userId = Number(otp?.userId);
  if (Number.isFinite(userId)) {
    return { mode: "otp", userId };
  }

  return null;
}

export async function POST(request) {
  try {
    const resolved = await resolveUserForClaim(request);
    if (!resolved) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const productIdRaw = safeStr(body.productId);
    const transactionId = safeStr(body.transactionId);

    if (!productIdRaw || !isAllowedProductId(productIdRaw)) {
      return Response.json({ error: "Invalid productId" }, { status: 400 });
    }

    const productId = normalizeProductId(productIdRaw) || productIdRaw;

    if (!transactionId) {
      return Response.json(
        { error: "transactionId is required" },
        { status: 400 },
      );
    }

    if (!looksLikeAppleTransactionId(transactionId)) {
      return Response.json({ error: "Invalid transactionId" }, { status: 400 });
    }

    let userId = null;

    if (resolved.email) {
      const email = resolved.email;

      // Ensure / fetch the legacy user row for this email.
      // (Same behavior as /api/users/ensure, but we need the id here.)
      const randomPassword = `${email}:${Date.now()}:${Math.random()}`;
      const passwordHash = await argon2.hash(randomPassword);

      const ensured = await sql`
        INSERT INTO users (email, password_hash, updated_at)
        VALUES (${email}, ${passwordHash}, NOW())
        ON CONFLICT (email) DO UPDATE
        SET updated_at = NOW()
        RETURNING id
      `;

      userId = Number(ensured?.[0]?.id);
      if (!Number.isFinite(userId)) {
        return Response.json(
          { error: "Could not resolve user" },
          { status: 500 },
        );
      }
    } else {
      userId = Number(resolved.userId);

      // Ensure the user exists
      const rows = await sql`
        SELECT id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `;
      if (!rows?.length) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Ensure wallet exists.
    await sql`
      INSERT INTO date_credit_wallets (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id)
      DO NOTHING
    `;

    // Idempotency (global): if we've already applied this transaction id anywhere, do nothing.
    // Check both client_transaction_id (from this endpoint) and revenuecat_transaction_id
    // (from the webhook), since both can fire for the same purchase.
    const existsTxn = await sql`
      SELECT id
      FROM date_credit_ledger
      WHERE action = 'PURCHASE'
        AND (
          (meta->>'client_transaction_id') = ${transactionId}
          OR (meta->>'revenuecat_transaction_id') = ${transactionId}
        )
      LIMIT 1
    `;

    if (existsTxn?.length) {
      const status = await getWalletStatus(userId);
      return Response.json({
        ok: true,
        alreadyApplied: true,
        userId,
        ...status,
      });
    }

    await sql`
      UPDATE date_credit_wallets
      SET balance_cents = balance_cents + ${REQUIRED_CENTS},
          updated_at = now()
      WHERE user_id = ${userId}
    `;

    const meta = JSON.stringify({
      source: "client_claim",
      auth_mode: resolved.mode,
      client_transaction_id: transactionId,
      product_id: productId,
    });

    await sql(
      `INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
       VALUES ($1, NULL, 'PURCHASE', $2, $3::jsonb)`,
      [userId, REQUIRED_CENTS, meta],
    );

    const status = await getWalletStatus(userId);
    return Response.json({
      ok: true,
      alreadyApplied: false,
      userId,
      ...status,
    });
  } catch (e) {
    console.error("[DATE_CREDITS][CLAIM] error", e?.message || e, e?.stack);
    return Response.json(
      { error: "Failed to claim date credit" },
      { status: 500 },
    );
  }
}
