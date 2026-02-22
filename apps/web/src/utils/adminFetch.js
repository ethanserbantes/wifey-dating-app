// A tiny helper for admin pages.
//
// Why this exists:
// - Admin auth is cookie-based (admin_session).
// - Some browser contexts (especially embedded iframes) block cookies.
//
// So we support a fallback where we also send the session token via
// Authorization header.

let inMemoryAdminSessionToken = null;

function safeGetStorageItem(key) {
  if (typeof window === "undefined") return null;

  // Try localStorage first.
  try {
    const v = window.localStorage.getItem(key);
    if (v) return v;
  } catch {
    // ignore
  }

  // Fallback to sessionStorage (more likely to work in embedded contexts).
  try {
    const v = window.sessionStorage.getItem(key);
    if (v) return v;
  } catch {
    // ignore
  }

  return null;
}

function safeSetStorageItem(key, value) {
  if (typeof window === "undefined") return;

  // Best effort: localStorage
  try {
    window.localStorage.setItem(key, value);
    return;
  } catch {
    // ignore
  }

  // Fallback: sessionStorage
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemoveStorageItem(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAdminSessionToken() {
  // First: in-memory token (works even if Storage APIs are blocked)
  if (inMemoryAdminSessionToken) return inMemoryAdminSessionToken;

  // Then: persisted token
  return safeGetStorageItem("admin_session_token");
}

export function setAdminSessionToken(token) {
  inMemoryAdminSessionToken = token ? String(token) : null;

  if (!token) {
    safeRemoveStorageItem("admin_session_token");
    return;
  }

  safeSetStorageItem("admin_session_token", String(token));
}

export default async function adminFetch(input, init = {}) {
  const token = getAdminSessionToken();

  const nextInit = {
    ...init,
    // Ensure cookies are included for same-origin calls.
    credentials: init.credentials || "include",
  };

  const headers = new Headers(init.headers || {});
  if (token && !headers.get("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  nextInit.headers = headers;

  return fetch(input, nextInit);
}
