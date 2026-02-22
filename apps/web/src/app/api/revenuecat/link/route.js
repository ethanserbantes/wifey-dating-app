import sql from "@/app/api/utils/sql";
import argon2 from "argon2";
import { getToken } from "@auth/core/jwt";
import { applyDateCreditPurchase } from "@/app/api/revenuecat/utils/dateCredits";

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function ensureLegacyUserIdFromAuth(request) {
  try {
    const jwt = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: process.env.AUTH_URL.startsWith("https"),
    });

    const email = jwt?.email;
    if (!email || typeof email !== "string") {
      return null;
    }

    // password_hash is required in schema. For web-auth users, we generate a random one.
    const randomPassword = `${email}:${Date.now()}:${Math.random()}`;
    const passwordHash = await argon2.hash(randomPassword);

    const rows = await sql`
      INSERT INTO users (email, password_hash, updated_at)
      VALUES (${email}, ${passwordHash}, NOW())
      ON CONFLICT (email) DO UPDATE
      SET updated_at = NOW()
      RETURNING id
    `;

    const userId = safeNumber(rows?.[0]?.id);
    return Number.isFinite(userId) ? userId : null;
  } catch (e) {
    console.error("[REVENUECAT][LINK] ensureLegacyUserIdFromAuth failed", e);
    return null;
  }
}

function normalizeAppUserIds(body) {
  const fromArray = Array.isArray(body?.appUserIds) ? body.appUserIds : null;
  const list = fromArray != null ? fromArray : [body?.appUserId];

  return Array.from(
    new Set(
      list.map((v) => (v != null ? String(v).trim() : "")).filter(Boolean),
    ),
  );
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const appUserIds = normalizeAppUserIds(body);
    const bodyUserId = safeNumber(body?.userId);
    const ensuredUserId = await ensureLegacyUserIdFromAuth(request);

    const userId = Number.isFinite(bodyUserId) ? bodyUserId : ensuredUserId;

    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!appUserIds.length) {
      return Response.json(
        { error: "appUserId (string) or appUserIds (string[]) required" },
        { status: 400 },
      );
    }

    // Ensure the user exists
    const userRows = await sql`
      SELECT id
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (!userRows?.length) {
      return Response.json(
        {
          error: "User not found",
          hint: "Call /api/users/ensure after auth to create a legacy users row.",
        },
        { status: 404 },
      );
    }

    // Upsert mappings.
    let linked = 0;
    for (const appUserId of appUserIds) {
      await sql`
        INSERT INTO revenuecat_app_user_links (app_user_id, user_id)
        VALUES (${appUserId}, ${userId})
        ON CONFLICT (app_user_id)
        DO UPDATE SET user_id = EXCLUDED.user_id
      `;
      linked += 1;
    }

    // NEW: after linking, process any pending webhook events for these app_user_ids
    let processed = 0;
    let alreadyApplied = 0;
    let failed = 0;

    try {
      const pendingRows = await sql(
        `SELECT id, event_id, transaction_id, product_id, raw_event
         FROM revenuecat_pending_date_credit_events
         WHERE processed_at IS NULL
           AND (
             app_user_id = ANY($1::text[])
             OR app_user_ids && $1::text[]
           )
         ORDER BY received_at ASC
         LIMIT 50`,
        [appUserIds],
      );

      const rows = Array.isArray(pendingRows) ? pendingRows : [];

      for (const row of rows) {
        try {
          const result = await applyDateCreditPurchase({
            userId,
            revenuecatEventId: row?.event_id || null,
            transactionId: row?.transaction_id || null,
            rawEvent: row?.raw_event || {},
            productId: row?.product_id || null,
          });

          processed += 1;
          if (result?.alreadyApplied) alreadyApplied += 1;

          await sql(
            `UPDATE revenuecat_pending_date_credit_events
             SET processed_at = now(),
                 processed_user_id = $2,
                 processed_result = $3::jsonb
             WHERE id = $1`,
            [row.id, userId, JSON.stringify({ ok: true, result })],
          );
        } catch (e) {
          failed += 1;
          await sql(
            `UPDATE revenuecat_pending_date_credit_events
             SET processed_at = now(),
                 processed_user_id = $2,
                 processed_result = $3::jsonb
             WHERE id = $1`,
            [
              row.id,
              userId,
              JSON.stringify({
                ok: false,
                error: e?.message ? String(e.message).slice(0, 500) : "Failed",
              }),
            ],
          );
        }
      }
    } catch (e) {
      console.error("[REVENUECAT][LINK] pending processing failed", e);
    }

    return Response.json({
      ok: true,
      userId,
      linked,
      pending: { processed, alreadyApplied, failed },
    });
  } catch (e) {
    console.error("POST /api/revenuecat/link error", e);
    return Response.json({ error: "Failed to link" }, { status: 500 });
  }
}
