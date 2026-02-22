import sql from "@/app/api/utils/sql";
import argon2 from "argon2";
import { getToken } from "@auth/core/jwt";

const REQUIRED_CENTS = 3000;
const MAX_CREDITS_DISPLAY = 3;

// NEW: one-time compatibility sweep.
// Older builds "committed" credits per match by subtracting from the wallet and
// storing the amount in match_chat_escrows. Under the new rules, credits should
// NOT disappear when a chat starts, so we release any escrowed deposits back
// into the user's wallet.
async function releaseLegacyEscrowBackToWallet(userId) {
  const userIdNum = Number(userId);
  if (!Number.isFinite(userIdNum)) return;

  try {
    await sql.transaction((txn) => [
      txn`
        INSERT INTO date_credit_wallets (user_id)
        VALUES (${userIdNum})
        ON CONFLICT (user_id) DO NOTHING
      `,
      txn(
        `
          WITH e AS (
            SELECT
              COALESCE(SUM(
                (CASE WHEN user1_id = $1 THEN COALESCE(user1_deposit_cents, 0) ELSE 0 END)
                +
                (CASE WHEN user2_id = $1 THEN COALESCE(user2_deposit_cents, 0) ELSE 0 END)
              ), 0)::int AS total_cents
            FROM match_chat_escrows
            WHERE user1_id = $1 OR user2_id = $1
            FOR UPDATE
          ),
          upd AS (
            UPDATE match_chat_escrows
            SET
              user1_deposit_cents = CASE WHEN user1_id = $1 THEN 0 ELSE user1_deposit_cents END,
              user2_deposit_cents = CASE WHEN user2_id = $1 THEN 0 ELSE user2_deposit_cents END,
              updated_at = now()
            WHERE user1_id = $1 OR user2_id = $1
            RETURNING 1
          ),
          w AS (
            UPDATE date_credit_wallets
            SET balance_cents = balance_cents + (SELECT total_cents FROM e),
                updated_at = now()
            WHERE user_id = $1
              AND (SELECT total_cents FROM e) > 0
            RETURNING balance_cents
          ),
          ledger AS (
            INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
            SELECT
              $1,
              NULL,
              'ADJUST',
              (SELECT total_cents FROM e),
              jsonb_build_object('reason', 'release_legacy_chat_escrow')
            WHERE (SELECT total_cents FROM e) > 0
            RETURNING 1
          )
          SELECT (SELECT total_cents FROM e) AS released_cents
        `,
        [userIdNum],
      ),
    ]);
  } catch (e) {
    // Non-fatal: if this fails, the wallet status still works.
    console.error(
      "[date-credits/status] releaseLegacyEscrowBackToWallet failed",
      e,
    );
  }
}

async function resolveUserIdFromRequest(request) {
  // IMPORTANT:
  // Prefer an explicit userId query param when provided.
  // This keeps the mobile app consistent even if token parsing ever fails.
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const userId = Number(userIdRaw);
    if (Number.isFinite(userId)) {
      return { userId, email: null };
    }
  } catch {
    // ignore
  }

  // Otherwise, try auth-based resolution (mobile + web).
  try {
    const jwt = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: process.env.AUTH_URL.startsWith("https"),
    });

    const email = jwt?.email;
    if (email && typeof email === "string") {
      // Ensure / fetch the legacy user row for this email.
      const randomPassword = `${email}:${Date.now()}:${Math.random()}`;
      const passwordHash = await argon2.hash(randomPassword);

      const ensured = await sql`
        INSERT INTO users (email, password_hash, updated_at)
        VALUES (${email}, ${passwordHash}, NOW())
        ON CONFLICT (email) DO UPDATE
        SET updated_at = NOW()
        RETURNING id
      `;

      const userId = Number(ensured?.[0]?.id);
      if (Number.isFinite(userId)) {
        return { userId, email };
      }
    }
  } catch (e) {
    // Ignore auth failures; we will fall back to 401.
    console.error("[DATE_CREDITS][STATUS] auth resolve failed", e);
  }

  return { userId: null, email: null };
}

export async function GET(request) {
  try {
    const { userId, email } = await resolveUserIdFromRequest(request);
    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "Unauthorized (or userId missing)" },
        { status: 401 },
      );
    }

    // NEW: compatibility sweep for legacy escrow-based commits.
    await releaseLegacyEscrowBackToWallet(userId);

    // Ensure wallet exists so callers always get a stable answer.
    await sql`
      INSERT INTO date_credit_wallets (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id)
      DO NOTHING
    `;

    const rows = await sql`
      SELECT balance_cents
      FROM date_credit_wallets
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const balanceCents = Number(rows?.[0]?.balance_cents || 0);

    const rawCredits = Math.floor(balanceCents / REQUIRED_CENTS);
    const credits = Math.max(0, Math.min(MAX_CREDITS_DISPLAY, rawCredits));

    return Response.json({
      userId,
      email: email || undefined,
      balanceCents,
      requiredCents: REQUIRED_CENTS,
      credits,
      maxCredits: MAX_CREDITS_DISPLAY,
    });
  } catch (error) {
    console.error("Error fetching date credit status:", error);
    return Response.json(
      { error: "Failed to fetch date credit status" },
      { status: 500 },
    );
  }
}
