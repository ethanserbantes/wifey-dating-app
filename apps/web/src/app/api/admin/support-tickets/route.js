import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "OPEN";

    const tickets = await sql`
      SELECT st.*,
        u.email as user_email,
        admin.email as assigned_to_email
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN admin_users admin ON st.assigned_to_admin_id = admin.id
      WHERE st.status = ${status}
      ORDER BY 
        CASE st.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
        END,
        st.created_at DESC
    `;

    return Response.json({ tickets });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return Response.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { ticketId, status, priority, assignedToAdminId } = body;

    if (!ticketId) {
      return Response.json({ error: "Ticket ID required" }, { status: 400 });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      updates.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    if (assignedToAdminId !== undefined) {
      updates.push(`assigned_to_admin_id = $${paramIndex}`);
      params.push(assignedToAdminId);
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    params.push(ticketId);
    const query = `
      UPDATE support_tickets 
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const [ticket] = await sql(query, params);

    return Response.json({ ticket });
  } catch (error) {
    console.error("Error updating ticket:", error);
    return Response.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}
