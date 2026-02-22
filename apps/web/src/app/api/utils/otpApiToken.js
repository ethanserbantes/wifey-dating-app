import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const PREFIX = "wifey_otp_v1";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function base64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecodeToBuffer(input) {
  const s = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const pad = s.length % 4;
  const padded = pad === 0 ? s : `${s}${"=".repeat(4 - pad)}`;
  return Buffer.from(padded, "base64");
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readAuthorizationHeader(request) {
  try {
    return (
      request.headers.get("authorization") ||
      request.headers.get("Authorization") ||
      ""
    );
  } catch {
    return "";
  }
}

export function readBearerToken(request) {
  const raw = String(readAuthorizationHeader(request) || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("bearer ")) {
    return raw.slice("bearer ".length).trim();
  }
  return raw;
}

export function issueOtpApiToken({ userId, ttlSeconds } = {}) {
  const uid = safeNumber(userId);
  if (!Number.isFinite(uid)) {
    throw new Error("issueOtpApiToken requires a numeric userId");
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET not configured");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = safeNumber(ttlSeconds) || DEFAULT_TTL_SECONDS;

  const payload = {
    v: 1,
    uid,
    iat: nowSec,
    exp: nowSec + ttl,
    n: base64urlEncode(randomBytes(12)),
  };

  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", String(secret)).update(payloadB64).digest();
  const sigB64 = base64urlEncode(sig);

  return `${PREFIX}.${payloadB64}.${sigB64}`;
}

export function verifyOtpApiToken(token) {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;

    const raw = String(token || "").trim();
    if (!raw) return null;

    const parts = raw.split(".");
    if (parts.length !== 3) return null;

    const [prefix, payloadB64, sigB64] = parts;
    if (prefix !== PREFIX) return null;
    if (!payloadB64 || !sigB64) return null;

    const expectedSig = createHmac("sha256", String(secret))
      .update(payloadB64)
      .digest();

    const gotSig = base64urlDecodeToBuffer(sigB64);

    if (gotSig.length !== expectedSig.length) return null;
    if (!timingSafeEqual(gotSig, expectedSig)) return null;

    const payloadRaw = base64urlDecodeToBuffer(payloadB64).toString("utf8");
    const payload = JSON.parse(payloadRaw);

    const uid = safeNumber(payload?.uid);
    const exp = safeNumber(payload?.exp);

    if (!Number.isFinite(uid) || !Number.isFinite(exp)) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (exp < nowSec) return null;

    return { userId: uid };
  } catch {
    return null;
  }
}

export function verifyOtpApiTokenFromRequest(request) {
  const token = readBearerToken(request);
  if (!token) return null;
  return verifyOtpApiToken(token);
}
