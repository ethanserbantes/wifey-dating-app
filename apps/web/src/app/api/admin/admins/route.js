import sql from "@/app/api/utils/sql";
import argon2 from "argon2";
import { hasRole, requireAdmin } from "@/app/api/utils/adminAuth";

export async function GET(request) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.response;

    const admins = await sql`
      SELECT id, email, role, created_at
      FROM admin_users
      ORDER BY created_at DESC
    `;

    return Response.json({ admins });
  } catch (error) {
    console.error("Error fetching admins:", error);
    return Response.json({ error: "Failed to fetch admins" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.response;
    if (!hasRole(gate.admin, ["OWNER"])) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, role } = body;

    if (!email || !password || !role) {
      return Response.json(
        { error: "email, password, and role are required" },
        { status: 400 },
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if email already exists
    const [existing] = await sql`
      SELECT id FROM admin_users WHERE LOWER(email) = ${normalizedEmail}
    `;

    if (existing) {
      return Response.json({ error: "Email already exists" }, { status: 400 });
    }

    const passwordHash = await argon2.hash(password);

    const [admin] = await sql`
      INSERT INTO admin_users (email, password_hash, role)
      VALUES (${normalizedEmail}, ${passwordHash}, ${role})
      RETURNING id, email, role, created_at
    `;

    return Response.json({ admin });
  } catch (error) {
    console.error("Error creating admin:", error);
    return Response.json({ error: "Failed to create admin" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.response;
    if (!hasRole(gate.admin, ["OWNER"])) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { adminId, role } = body;

    if (!adminId || !role) {
      return Response.json(
        { error: "adminId and role are required" },
        { status: 400 },
      );
    }

    const [admin] = await sql`
      UPDATE admin_users
      SET role = ${role}
      WHERE id = ${adminId}
      RETURNING id, email, role, created_at
    `;

    if (!admin) {
      return Response.json({ error: "Admin not found" }, { status: 404 });
    }

    return Response.json({ admin });
  } catch (error) {
    console.error("Error updating admin:", error);
    return Response.json({ error: "Failed to update admin" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.response;
    if (!hasRole(gate.admin, ["OWNER"])) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get("id");

    if (!adminId) {
      return Response.json({ error: "Admin ID required" }, { status: 400 });
    }

    // Don't allow deleting the last OWNER
    const [ownerCount] = await sql`
      SELECT COUNT(*) as count FROM admin_users WHERE role = 'OWNER'
    `;

    const [admin] = await sql`
      SELECT role FROM admin_users WHERE id = ${adminId}
    `;

    if (admin?.role === "OWNER" && parseInt(ownerCount.count) === 1) {
      return Response.json(
        { error: "Cannot delete the last owner" },
        { status: 400 },
      );
    }

    await sql`DELETE FROM admin_users WHERE id = ${adminId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting admin:", error);
    return Response.json({ error: "Failed to delete admin" }, { status: 500 });
  }
}
