import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

const OWNER_EMAIL = "ethanserbantes@gmail.com";

export async function POST(request) {
  try {
    // Only allow bootstrapping if there are NO admins yet.
    const [existingCount] = await sql`
      SELECT COUNT(*)::int as count FROM admin_users
    `;

    if ((existingCount?.count || 0) > 0) {
      return Response.json(
        { message: "Admin is already set up" },
        { status: 200 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return Response.json(
        { error: "Email and password required" },
        { status: 400 },
      );
    }

    if (email !== OWNER_EMAIL) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const passwordHash = await hash(password);

    const [admin] = await sql`
      INSERT INTO admin_users (email, password_hash, role)
      VALUES (${email}, ${passwordHash}, 'OWNER')
      RETURNING id, email, role, created_at
    `;

    return Response.json({ admin });
  } catch (error) {
    console.error("[SETUP] Admin setup error:", error);
    return Response.json(
      {
        error: "Setup failed",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
