import sql from "@/app/api/utils/sql";

export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    if (!id) {
      return Response.json({ error: "User ID is required" }, { status: 400 });
    }

    // First check if user exists in users table
    const users = await sql`
      SELECT id FROM users WHERE id = ${id}
    `;

    if (users.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Delete from users table (will cascade to screening_attempts, bans, etc.)
    await sql`
      DELETE FROM users WHERE id = ${id}
    `;

    // Delete from auth tables
    await sql`
      DELETE FROM auth_users WHERE id = ${id}
    `;

    return Response.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
