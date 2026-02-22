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
  const authHeader = request.headers.get("authorization") || "";
  const trimmed = String(authHeader).trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    if (token) return token;
  }
  const xToken = request.headers.get("x-admin-session") || "";
  if (xToken && String(xToken).trim()) return String(xToken).trim();

  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  return cookies.admin_session || null;
}

export async function POST(request) {
  try {
    const sessionToken = getSessionTokenFromHeaders(request);

    if (sessionToken) {
      await sql`DELETE FROM admin_sessions WHERE session_token = ${sessionToken}`;
    }

    const response = Response.json({ success: true });

    const secure = process.env.NODE_ENV === "production";
    const cookieParts = [
      "admin_session=",
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
    ];
    if (secure) cookieParts.push("Secure");

    response.headers.append("Set-Cookie", cookieParts.join("; "));
    return response;
  } catch (e) {
    console.error("POST /api/admin/logout error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
