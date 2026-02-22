import sql from "@/app/api/utils/sql";
import crypto from "crypto";

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    // IMPORTANT: return success either way (avoid account enumeration)
    const [admin] = await sql`
      SELECT id, email
      FROM admin_users
      WHERE LOWER(email) = ${email}
      LIMIT 1
    `;

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(token);

    if (admin?.id) {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
      await sql`
        INSERT INTO admin_password_reset_tokens (admin_id, token_hash, expires_at)
        VALUES (${admin.id}, ${tokenHash}, ${expiresAt})
      `;
    }

    const resetPath = `/admin/reset-password?token=${encodeURIComponent(token)}`;

    // TODO: Send email via Resend integration.
    // For now, return the reset path only in non-production so you can test.
    const isProd =
      String(process.env.ENV || "").toLowerCase() === "production" ||
      String(process.env.NODE_ENV || "").toLowerCase() === "production";

    return Response.json({
      success: true,
      message: "If that email has access, we sent a reset link.",
      resetPath: isProd ? null : resetPath,
    });
  } catch (e) {
    console.error("POST /api/admin/password-reset/request error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
