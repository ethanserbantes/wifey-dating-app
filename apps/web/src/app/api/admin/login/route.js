import sql from "@/app/api/utils/sql";
import { verify } from "argon2";
import crypto from "crypto";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json(
        { error: "Email and password required" },
        { status: 400 },
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const admins = await sql`
      SELECT id, email, password_hash, role 
      FROM admin_users 
      WHERE LOWER(email) = ${normalizedEmail}
    `;

    if (admins.length === 0) {
      // IMPORTANT: allowlist is the admin_users table.
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const admin = admins[0];
    const isValid = await verify(admin.password_hash, password);

    if (!isValid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Create a DB-backed session token (cookie-based)
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14 days

    await sql`
      INSERT INTO admin_sessions (session_token, admin_id, expires_at)
      VALUES (${sessionToken}, ${admin.id}, ${expiresAt})
    `;

    const response = Response.json({
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      // IMPORTANT: this is a fallback for environments where cookies are blocked
      // (ex: embedded iframes / strict browser settings).
      sessionToken,
    });

    // NOTE: SameSite=Lax is usually what we want for a same-origin admin panel.
    // Add Secure in production so browsers always accept it over https.
    const secure = process.env.NODE_ENV === "production";
    const cookieParts = [
      `admin_session=${encodeURIComponent(sessionToken)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 24 * 14}`,
    ];
    if (secure) cookieParts.push("Secure");

    response.headers.append("Set-Cookie", cookieParts.join("; "));

    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
