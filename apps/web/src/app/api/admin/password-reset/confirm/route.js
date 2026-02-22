import sql from "@/app/api/utils/sql";
import crypto from "crypto";
import argon2 from "argon2";

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!token || !password) {
      return Response.json(
        { error: "Token and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const tokenHash = sha256(token);

    const rows = await sql`
      SELECT id, admin_id
      FROM admin_password_reset_tokens
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `;

    if (!rows?.length) {
      return Response.json(
        { error: "Invalid or expired reset link" },
        { status: 400 },
      );
    }

    const resetRow = rows[0];
    const newHash = await argon2.hash(password);

    await sql.transaction([
      sql`
        UPDATE admin_users
        SET password_hash = ${newHash}
        WHERE id = ${resetRow.admin_id}
      `,
      sql`
        UPDATE admin_password_reset_tokens
        SET used_at = NOW()
        WHERE id = ${resetRow.id}
      `,
      sql`
        DELETE FROM admin_sessions
        WHERE admin_id = ${resetRow.admin_id}
      `,
    ]);

    return Response.json({ success: true });
  } catch (e) {
    console.error("POST /api/admin/password-reset/confirm error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
