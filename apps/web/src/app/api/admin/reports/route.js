import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";

    const reports = await sql`
      SELECT ur.*,
        reporter.email as reporter_email,
        reported.email as reported_email,
        admin.email as assigned_to_email
      FROM user_reports ur
      LEFT JOIN users reporter ON ur.reporter_user_id = reporter.id
      LEFT JOIN users reported ON ur.reported_user_id = reported.id
      LEFT JOIN admin_users admin ON ur.assigned_to_admin_id = admin.id
      WHERE ur.status = ${status}
      ORDER BY ur.created_at DESC
    `;

    return Response.json({ reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return Response.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { reportId, status, assignedToAdminId, resolutionNotes } = body;

    if (!reportId) {
      return Response.json({ error: "Report ID required" }, { status: 400 });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (assignedToAdminId !== undefined) {
      updates.push(`assigned_to_admin_id = $${paramIndex}`);
      params.push(assignedToAdminId);
      paramIndex++;
    }

    if (resolutionNotes !== undefined) {
      updates.push(`resolution_notes = $${paramIndex}`);
      params.push(resolutionNotes);
      paramIndex++;
    }

    if (status === "RESOLVED" || status === "DISMISSED") {
      updates.push(`resolved_at = NOW()`);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    params.push(reportId);
    const query = `
      UPDATE user_reports 
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const [report] = await sql(query, params);

    return Response.json({ report });
  } catch (error) {
    console.error("Error updating report:", error);
    return Response.json({ error: "Failed to update report" }, { status: 500 });
  }
}
