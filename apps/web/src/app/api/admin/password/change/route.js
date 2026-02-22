import sql from "@/app/api/utils/sql";
import { requireAdmin } from "@/app/api/utils/adminAuth";
import argon2 from "argon2";

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

export async function POST(request) {
  try {
    const authResult = await requireAdmin(request);
    if (!authResult.ok) return authResult.response;

    const body = await request.json().catch(() => ({}));
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");

    if (!currentPassword || !newPassword) {
      return Response.json(
        { error: "Current password and new password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return Response.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }

    if (currentPassword === newPassword) {
      return Response.json(
        { error: "New password must be different" },
        { status: 400 },
      );
    }

    const adminId = authResult.admin.id;

    const rows = await sql`
      SELECT id, password_hash
      FROM admin_users
      WHERE id = ${adminId}
      LIMIT 1
    `;

    const admin = rows?.[0];
    if (!admin?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await argon2.verify(admin.password_hash, currentPassword);
    if (!ok) {
      return Response.json(
        { error: "Current password is incorrect" },
        { status: 401 },
      );
    }

    const newHash = await argon2.hash(newPassword);

    // Keep the current session, invalidate all other sessions.
    const cookieHeader = request.headers.get("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const sessionToken = cookies.admin_session;

    await sql.transaction([
      sql`
        UPDATE admin_users
        SET password_hash = ${newHash}
        WHERE id = ${adminId}
      `,
      sessionToken
        ? sql`
            DELETE FROM admin_sessions
            WHERE admin_id = ${adminId}
              AND session_token <> ${sessionToken}
          `
        : sql`
            DELETE FROM admin_sessions
            WHERE admin_id = ${adminId}
          `,
    ]);

    return Response.json({ success: true });
  } catch (e) {
    console.error("POST /api/admin/password/change error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
