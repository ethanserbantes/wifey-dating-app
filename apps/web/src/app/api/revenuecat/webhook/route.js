import sql from "@/app/api/utils/sql";
import { applyDateCreditPurchase } from "@/app/api/revenuecat/utils/dateCredits";

const DEBUG_VERSION = "2026-02-12-date-credits-pending-v1";

const CREDIT_PRODUCT_IDS = new Set([
  "date_credit_pro", // current ASC productId
  "dating_credit_pro",
  "date_credit_1",
]);

function normalizeProductId(raw) {
  const s = raw != null ? String(raw).trim() : "";
  if (!s) return "";
  const parts = s
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  const tail = parts.length ? parts[parts.length - 1] : s;
  return tail || s;
}

function isAllowedProductId(raw) {
  const s = raw != null ? String(raw).trim() : "";
  if (!s) return false;
  if (CREDIT_PRODUCT_IDS.has(s)) return true;
  const normalized = normalizeProductId(s);
  return CREDIT_PRODUCT_IDS.has(normalized);
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getHeader(request, name) {
  try {
    return request.headers.get(name);
  } catch {
    return null;
  }
}

function extractAliases(event) {
  // RevenueCat may include aliases for merged/anonymous users.
  // This can help us map purchases even if app_user_id is not numeric.
  const raw =
    event?.aliases ||
    event?.app_user_id_aliases ||
    event?.appUserIdAliases ||
    event?.subscriber_aliases ||
    [];

  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((v) => (v != null ? String(v).trim() : "")).filter(Boolean);
}

function extractEvent(payload) {
  // RevenueCat webhooks have had a few shapes over time.
  // We accept common variants and ignore anything we can't parse.
  const event = payload?.event || payload || {};

  const id =
    event?.id ||
    event?.event_id ||
    event?.eventId ||
    event?.webhook_event_id ||
    null;

  const typeRaw =
    event?.type ||
    event?.event_type ||
    event?.eventType ||
    event?.event ||
    null;

  const type = typeRaw != null ? String(typeRaw).trim().toUpperCase() : null;

  const productIdRaw =
    event?.product_id ||
    event?.productId ||
    event?.store_product_id ||
    event?.storeProductId ||
    null;

  const productId = productIdRaw ? normalizeProductId(productIdRaw) : null;

  const appUserIdRaw =
    event?.app_user_id || event?.appUserId || event?.app_userid || null;

  const appUserId = appUserIdRaw != null ? String(appUserIdRaw).trim() : null;

  const transactionIdRaw =
    event?.transaction_id ||
    event?.transactionId ||
    event?.original_transaction_id ||
    event?.originalTransactionId ||
    null;

  const transactionId =
    transactionIdRaw != null ? String(transactionIdRaw).trim() : null;

  const aliases = extractAliases(event);

  return { id, type, productId, appUserId, transactionId, aliases, raw: event };
}

async function resolveUserIdFromRevenueCatAppUserIds(appUserIds) {
  const candidates = (Array.isArray(appUserIds) ? appUserIds : [])
    .map((v) => (v != null ? String(v).trim() : ""))
    .filter(Boolean);

  // First: direct numeric match, BUT only if that user id actually exists.
  // (This avoids failing purchases when RevenueCat is configured with a stale/incorrect numeric id,
  // while an alias like $RCAnonymousID:* is correctly linked via revenuecat_app_user_links.)
  const numericCandidates = [];
  for (const v of candidates) {
    const n = safeNumber(v);
    if (Number.isFinite(n)) {
      numericCandidates.push(n);
    }
  }

  if (numericCandidates.length > 0) {
    const rows = await sql("SELECT id FROM users WHERE id = ANY($1::int[])", [
      numericCandidates,
    ]);

    const existing = new Set(
      (Array.isArray(rows) ? rows : [])
        .map((r) => safeNumber(r?.id))
        .filter((n) => Number.isFinite(n)),
    );

    for (const n of numericCandidates) {
      if (existing.has(n)) {
        return n;
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Second: check our mapping table (set by the mobile app) for anonymous ids.
  const rows = await sql(
    `SELECT user_id
     FROM revenuecat_app_user_links
     WHERE app_user_id = ANY($1::text[])
     ORDER BY updated_at DESC
     LIMIT 1`,
    [candidates],
  );

  const userId = safeNumber(rows?.[0]?.user_id);
  return Number.isFinite(userId) ? userId : null;
}

function extractUserIdFromSubscriberAttributes(rawEvent) {
  try {
    const attrs =
      rawEvent?.subscriber_attributes ||
      rawEvent?.subscriberAttributes ||
      rawEvent?.attributes ||
      rawEvent?.subscriberAttributesByKey ||
      null;

    if (!attrs || typeof attrs !== "object") return null;

    const read = (key) => {
      const v = attrs[key];
      if (v == null) return null;
      if (typeof v === "object" && v.value != null) return v.value;
      return v;
    };

    const candidates = [
      read("userId"),
      read("userID"),
      read("userid"),
      read("user_id"),
      read("user"),
    ]
      .map((v) => (v != null ? String(v).trim() : ""))
      .filter(Boolean);

    for (const c of candidates) {
      const n = safeNumber(c);
      if (Number.isFinite(n)) return n;
    }

    return null;
  } catch {
    return null;
  }
}

async function storePendingDateCreditEvent(evt) {
  try {
    const ids = Array.from(
      new Set(
        [
          evt?.appUserId != null ? String(evt.appUserId).trim() : "",
          ...(Array.isArray(evt?.aliases) ? evt.aliases : []),
        ].filter(Boolean),
      ),
    );

    let rawJson = "{}";
    try {
      rawJson = JSON.stringify(evt?.raw || {});
    } catch {
      rawJson = "{}";
    }

    await sql`
      INSERT INTO revenuecat_pending_date_credit_events (
        app_user_id,
        app_user_ids,
        event_id,
        transaction_id,
        product_id,
        raw_event
      )
      VALUES (
        ${evt?.appUserId || ""},
        ${ids},
        ${evt?.id || null},
        ${evt?.transactionId || null},
        ${evt?.productId || ""},
        ${rawJson}::jsonb
      )
      ON CONFLICT DO NOTHING
    `;

    return { ok: true, stored: true };
  } catch (e) {
    console.error("Failed to store pending RevenueCat event", e);
    return { ok: false, stored: false };
  }
}

function normalizeAuthHeader(value) {
  const s = value != null ? String(value) : "";
  return s.trim();
}

function getQueryParam(request, name) {
  try {
    const url = new URL(request.url);
    const v = url.searchParams.get(name);
    return v != null ? String(v).trim() : "";
  } catch {
    return "";
  }
}

function isAuthorizedRequest(request, secret) {
  try {
    if (!secret) return false;

    const expected = String(secret).trim();

    // RevenueCat SHOULD send Authorization headers, but in some accounts/UI versions
    // the configured header does not get attached. As a fallback, allow auth via a
    // query param on the webhook URL (e.g. /api/revenuecat/webhook?auth=<secret>).
    // This is less ideal than headers, but it unblocks sandbox + production delivery.
    const queryCandidates = [
      getQueryParam(request, "auth"),
      getQueryParam(request, "token"),
      getQueryParam(request, "secret"),
    ].map(normalizeAuthHeader);

    for (const raw of queryCandidates) {
      if (!raw) continue;
      if (raw === expected) return true;

      const lower = raw.toLowerCase();
      if (lower.startsWith("bearer ")) {
        const token = raw.slice("bearer ".length).trim();
        if (token === expected) return true;
      }

      if (raw.includes(expected)) return true;
    }

    const headerCandidates = [
      getHeader(request, "authorization"),
      getHeader(request, "Authorization"),
      getHeader(request, "x-revenuecat-webhook-secret"),
      getHeader(request, "x-revenuecat-authorization"),
      getHeader(request, "x-webhook-secret"),
    ].map(normalizeAuthHeader);

    for (const raw of headerCandidates) {
      if (!raw) continue;

      const lower = raw.toLowerCase();
      const bearerPrefix = "bearer ";

      if (raw === expected) {
        return true;
      }

      if (lower.startsWith(bearerPrefix)) {
        const token = raw.slice(bearerPrefix.length).trim();
        if (token === expected) {
          return true;
        }
      }

      if (raw.includes(expected)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function POST(request) {
  let stage = "start";
  /** @type {ReturnType<typeof extractEvent> | null} */
  let evt = null;
  /** safe small extracted debug blob we can return on 500s */
  let extractedDebug = null;

  try {
    stage = "load_secret";
    // Basic auth: set this in RevenueCat webhook settings.
    // Send header: Authorization: Bearer <secret>
    const secret = process.env.REVENUE_CAT_WEBHOOK_SECRET;
    if (!secret) {
      // In production we want to fail closed.
      return Response.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    stage = "auth_check";
    // BEFORE: strict string equality on Authorization header
    // NOW: tolerate casing/whitespace and a few common header variants.
    if (!isAuthorizedRequest(request, secret)) {
      // IMPORTANT: return non-sensitive debug info so we can see what RevenueCat is actually sending.
      const authHeader = getHeader(request, "authorization");
      const xSecretHeader = getHeader(request, "x-revenuecat-webhook-secret");
      const xAuthHeader = getHeader(request, "x-revenuecat-authorization");

      const authHeaderTrimmed =
        authHeader != null ? String(authHeader).trim() : "";
      const xSecretTrimmed =
        xSecretHeader != null ? String(xSecretHeader).trim() : "";
      const xAuthTrimmed =
        xAuthHeader != null ? String(xAuthHeader).trim() : "";

      const queryAuth = getQueryParam(request, "auth");
      const queryToken = getQueryParam(request, "token");
      const querySecret = getQueryParam(request, "secret");

      let headerNames = [];
      try {
        headerNames = Array.from(request.headers.keys());
      } catch {
        headerNames = [];
      }

      const debugPayload = {
        error: "Unauthorized",
        hint: "RevenueCat should send an Authorization header, but if your RevenueCat UI is not attaching it, set the webhook URL to /api/revenuecat/webhook?auth=<REVENUE_CAT_WEBHOOK_SECRET> (or ?token=...). Confirm you edited PRODUCTION secrets + republished.",
        debug: {
          version: DEBUG_VERSION,
          env: process.env.ENV || process.env.NODE_ENV || null,
          expectedSecretLength: String(secret).trim().length,
          receivedHeaderNames: headerNames.slice(0, 50),
          received: {
            hasAuthorizationHeader: Boolean(authHeaderTrimmed),
            authorizationHeaderLength: authHeaderTrimmed.length,
            authorizationLooksBearer: authHeaderTrimmed
              .toLowerCase()
              .startsWith("bearer "),

            hasXRevenuecatWebhookSecret: Boolean(xSecretTrimmed),
            xRevenuecatWebhookSecretLength: xSecretTrimmed.length,

            hasXRevenuecatAuthorization: Boolean(xAuthTrimmed),
            xRevenuecatAuthorizationLength: xAuthTrimmed.length,

            hasQueryAuth: Boolean(String(queryAuth || "").trim()),
            queryAuthLength: String(queryAuth || "").trim().length,
            hasQueryToken: Boolean(String(queryToken || "").trim()),
            queryTokenLength: String(queryToken || "").trim().length,
            hasQuerySecret: Boolean(String(querySecret || "").trim()),
            querySecretLength: String(querySecret || "").trim().length,
          },
        },
      };

      // RevenueCat's UI sometimes only shows headers, not the JSON body.
      // So we also echo safe debug signals into response headers.
      const headers = new Headers();
      headers.set("X-Wifey-RC-Debug-Version", DEBUG_VERSION);
      headers.set(
        "X-Wifey-RC-Has-Authorization",
        debugPayload.debug.received.hasAuthorizationHeader ? "1" : "0",
      );
      headers.set(
        "X-Wifey-RC-Auth-Looks-Bearer",
        debugPayload.debug.received.authorizationLooksBearer ? "1" : "0",
      );
      headers.set(
        "X-Wifey-RC-Auth-Len",
        String(debugPayload.debug.received.authorizationHeaderLength || 0),
      );
      headers.set(
        "X-Wifey-RC-Has-Query-Auth",
        debugPayload.debug.received.hasQueryAuth ? "1" : "0",
      );
      headers.set(
        "X-Wifey-RC-Query-Auth-Len",
        String(debugPayload.debug.received.queryAuthLength || 0),
      );
      headers.set(
        "X-Wifey-RC-Has-Query-Token",
        debugPayload.debug.received.hasQueryToken ? "1" : "0",
      );
      headers.set(
        "X-Wifey-RC-Query-Token-Len",
        String(debugPayload.debug.received.queryTokenLength || 0),
      );
      headers.set(
        "X-Wifey-RC-Has-XRC-Webhook-Secret",
        debugPayload.debug.received.hasXRevenuecatWebhookSecret ? "1" : "0",
      );
      headers.set(
        "X-Wifey-RC-Has-XRC-Authorization",
        debugPayload.debug.received.hasXRevenuecatAuthorization ? "1" : "0",
      );

      return Response.json(debugPayload, { status: 401, headers });
    }

    stage = "parse_json";
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    stage = "extract_event";
    evt = extractEvent(payload);

    extractedDebug = {
      id: evt?.id || null,
      type: evt?.type || null,
      productId: evt?.productId || null,
      appUserId: evt?.appUserId || null,
      transactionId: evt?.transactionId || null,
      aliasesCount: Array.isArray(evt?.aliases) ? evt.aliases.length : 0,
      rawEventKeys:
        evt?.raw && typeof evt.raw === "object"
          ? Object.keys(evt.raw).slice(0, 50)
          : [],
    };

    // Ignore webhook events we don't understand.
    stage = "validate_core_fields";
    if (!evt?.appUserId || !evt?.productId) {
      return Response.json({
        ok: true,
        ignored: true,
        reason: "missing_app_user_id_or_product_id",
        extracted: extractedDebug,
      });
    }

    stage = "validate_product_whitelist";
    // We only care about the one-credit consumable product.
    // Accept both short ids and bundle-style ids.
    if (!isAllowedProductId(evt.productId)) {
      return Response.json({
        ok: true,
        ignored: true,
        reason: "product_id_not_whitelisted",
        extracted: extractedDebug,
        allowedProductIds: Array.from(CREDIT_PRODUCT_IDS),
      });
    }

    // Normalize product id so ledger stores consistent identifiers.
    evt.productId = normalizeProductId(evt.productId);

    stage = "validate_event_type";
    // Only apply on purchase-like events.
    // RevenueCat's exact strings can vary; we accept a safe superset.
    const type = String(evt.type || "").toUpperCase();
    const looksLikePurchase =
      type.includes("PURCHASE") ||
      type.includes("NON_RENEWING") ||
      type.includes("ONE_TIME") ||
      type.includes("PRODUCT_PURCHASED") ||
      type === "INITIAL_PURCHASE";

    if (!looksLikePurchase) {
      return Response.json({
        ok: true,
        ignored: true,
        reason: "event_type_not_purchase_like",
        extracted: extractedDebug,
      });
    }

    stage = "resolve_user_id";

    // 1) Try to map directly from RevenueCat subscriber attributes (fast + avoids mapping races).
    let userId = extractUserIdFromSubscriberAttributes(evt.raw);

    // Validate that the user exists before trusting the attribute.
    if (Number.isFinite(userId)) {
      const urows = await sql("SELECT id FROM users WHERE id = $1 LIMIT 1", [
        userId,
      ]);
      if (!urows?.length) {
        userId = null;
      }
    }

    // 2) Fallback: numeric app_user_id or our mapping table.
    if (!Number.isFinite(userId)) {
      userId = await resolveUserIdFromRevenueCatAppUserIds([
        evt.appUserId,
        ...(evt.aliases || []),
      ]);
    }

    if (!Number.isFinite(userId)) {
      stage = "store_pending";
      await storePendingDateCreditEvent(evt);
      return Response.json({
        ok: true,
        pending: true,
        reason: "unmapped_app_user_id",
        extracted: extractedDebug,
        hint: "The purchase was received, but we couldn't map it to a user yet. The app should call /api/revenuecat/link; once linked, we will process pending events.",
      });
    }

    stage = "check_user_exists";
    // Ensure the user exists (avoid creating wallet rows for nonsense ids)
    const userRows = await sql`
      SELECT id
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (!userRows?.length) {
      stage = "store_pending_user_missing";
      await storePendingDateCreditEvent(evt);
      return Response.json({
        ok: true,
        pending: true,
        reason: "user_not_found",
        extracted: extractedDebug,
      });
    }

    stage = "apply_purchase";
    const result = await applyDateCreditPurchase({
      userId,
      revenuecatEventId: evt.id,
      transactionId: evt.transactionId,
      rawEvent: evt.raw,
      productId: evt.productId,
    });

    stage = "done";
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("RevenueCat webhook error", {
      stage,
      err: e,
      extractedDebug,
    });

    // RevenueCat UI sometimes hides logs; return safe diagnostics.
    const errName = e?.name ? String(e.name) : "Error";
    const errMessage = e?.message ? String(e.message) : "Unknown error";

    const headers = new Headers();
    headers.set("X-Wifey-RC-Error-Stage", stage);
    headers.set("X-Wifey-RC-Debug-Version", DEBUG_VERSION);

    return Response.json(
      {
        error: "Webhook error",
        stage,
        debug: {
          version: DEBUG_VERSION,
          name: errName,
          message: errMessage.slice(0, 500),
          extracted: extractedDebug,
        },
      },
      { status: 500, headers },
    );
  }
}

// NEW: allow a simple health check from a browser (RevenueCat still uses POST)
export async function GET() {
  const secret = process.env.REVENUE_CAT_WEBHOOK_SECRET;
  const configured = Boolean(secret);

  // Include a version string so we can tell whether production has actually picked up the latest deployment.
  return Response.json({
    ok: true,
    configured,
    version: DEBUG_VERSION,
    env: process.env.ENV || process.env.NODE_ENV || null,
    expectedSecretLength: configured ? String(secret).trim().length : 0,
  });
}
