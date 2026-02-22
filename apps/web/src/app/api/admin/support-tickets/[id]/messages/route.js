import sql from "@/app/api/utils/sql";

export async function GET(request, { params }) {
  try {
    const ticketId = params.id;

    const messages = await sql`
      SELECT stm.*,
        CASE 
          WHEN stm.sender_type = 'USER' THEN u.email
          WHEN stm.sender_type = 'ADMIN' THEN a.email
        END as sender_email
      FROM support_ticket_messages stm
      LEFT JOIN users u ON stm.sender_type = 'USER' AND stm.sender_id = u.id
      LEFT JOIN admin_users a ON stm.sender_type = 'ADMIN' AND stm.sender_id = a.id
      WHERE stm.ticket_id = ${ticketId}
      ORDER BY stm.created_at ASC
    `;

    return Response.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return Response.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

export async function POST(request, { params }) {
  try {
    const ticketId = params.id;
    const body = await request.json();
    const { message, senderType, senderId } = body;

    if (!message || !senderType) {
      return Response.json(
        { error: "message and senderType are required" },
        { status: 400 },
      );
    }

    const [msg] = await sql`
      INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message)
      VALUES (${ticketId}, ${senderType}, ${senderId || null}, ${message})
      RETURNING *
    `;

    // Update ticket status
    await sql`
      UPDATE support_tickets 
      SET updated_at = NOW(),
          status = CASE 
            WHEN ${senderType} = 'USER' AND status = 'WAITING_USER' THEN 'IN_PROGRESS'
            ELSE status 
          END
      WHERE id = ${ticketId}
    `;

    return Response.json({ message: msg });
  } catch (error) {
    console.error("Error creating message:", error);
    return Response.json(
      { error: "Failed to create message" },
      { status: 500 },
    );
  }
}
