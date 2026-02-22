import sql from "@/app/api/utils/sql";

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return out;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function getSessionTokenFromHeaders(request) {
  // Prefer Authorization header so this also works when cookies are blocked.
  const authHeader = request.headers.get("authorization") || "";
  const trimmed = String(authHeader).trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    if (token) return token;
  }

  // Fallback: allow a simple custom header too.
  const xToken = request.headers.get("x-admin-session") || "";
  if (xToken && String(xToken).trim()) return String(xToken).trim();

  // Finally: cookie.
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  return cookies.admin_session || null;
}

export async function getAdminFromRequest(request) {
  try {
    const sessionToken = getSessionTokenFromHeaders(request);
    if (!sessionToken) return null;

    const rows = await sql`
      SELECT a.id, a.email, a.role
      FROM admin_sessions s
      JOIN admin_users a ON a.id = s.admin_id
      WHERE s.session_token = ${sessionToken}
        AND s.expires_at > NOW()
      LIMIT 1
    `;

    return rows?.[0] || null;
  } catch (e) {
    console.error("getAdminFromRequest error:", e);
    return null;
  }
}

export async function requireAdmin(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return {
      ok: false,
      admin: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, admin, response: null };
}

export function hasRole(admin, allowedRoles) {
  if (!admin) return false;
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  return allowedRoles.includes(admin.role);
}
