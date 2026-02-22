import sql from "@/app/api/utils/sql";
import argon2 from "argon2";
import { getToken } from "@auth/core/jwt";

function mapUserRow(u) {
  return {
    id: u.id,
    email: u.email,
    status: u.status,
    screeningPhase: u.screening_phase,
    cooldownUntil: u.cooldown_until,
    updatedAt: u.updated_at,
    createdAt: u.created_at,
  };
}

// Bridge between Anything web auth (auth_users) and the mobile app's legacy `users` table.
// If a user signs in via the web auth flow inside the mobile WebView, we create (or fetch)
// a matching row in `users` so mobile endpoints that rely on userId continue to work.
export async function GET(request) {
  try {
    // Accept either cookie-based auth (web) or Bearer token auth (mobile).
    // getToken() supports both.
    const jwt = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: process.env.AUTH_URL.startsWith("https"),
    });

    const email = jwt?.email;
    if (!email || typeof email !== "string") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // NOTE: password_hash is required in schema. For web-auth users, we generate a random one.
    // This is not used for login; it just satisfies schema constraints.
    const randomPassword = `${email}:${Date.now()}:${Math.random()}`;
    const passwordHash = await argon2.hash(randomPassword);

    const rows = await sql`
      INSERT INTO users (email, password_hash, updated_at)
      VALUES (${email}, ${passwordHash}, NOW())
      ON CONFLICT (email) DO UPDATE
      SET updated_at = NOW()
      RETURNING id, email, status, cooldown_until, screening_phase, updated_at, created_at
    `;

    return Response.json({ user: mapUserRow(rows[0]) });
  } catch (error) {
    console.error("Error ensuring user:", error);
    return Response.json({ error: "Failed to ensure user" }, { status: 500 });
  }
}
