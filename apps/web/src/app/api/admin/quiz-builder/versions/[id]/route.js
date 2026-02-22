import sql from "@/app/api/utils/sql";

// GET - Get version details
export async function GET(request, { params }) {
  try {
    const versionId = params.id;

    const version = await sql`
      SELECT * FROM quiz_versions WHERE id = ${versionId}
    `;

    if (version.length === 0) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    return Response.json({ version: version[0] });
  } catch (error) {
    console.error("Error fetching version:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update version
export async function PUT(request, { params }) {
  try {
    const versionId = params.id;
    const body = await request.json();
    const { notes } = body;

    await sql`
      UPDATE quiz_versions
      SET notes = ${notes}
      WHERE id = ${versionId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating version:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH - Update version (alias for PUT)
export async function PATCH(request, { params }) {
  return PUT(request, { params });
}

// DELETE - Delete version (only if draft)
export async function DELETE(request, { params }) {
  try {
    const versionId = params.id;

    const version = await sql`
      SELECT status FROM quiz_versions WHERE id = ${versionId}
    `;

    if (version.length === 0) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    if (version[0].status !== "draft") {
      return Response.json(
        { error: "Can only delete draft versions" },
        { status: 400 },
      );
    }

    await sql`DELETE FROM quiz_versions WHERE id = ${versionId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting version:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
