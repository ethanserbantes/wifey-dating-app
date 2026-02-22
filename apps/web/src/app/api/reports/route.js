import sql from "@/app/api/utils/sql";

const VALID_TYPES = new Set([
  "HARASSMENT",
  "SPAM",
  "INAPPROPRIATE_CONTENT",
  "FRAUD",
  "OTHER",
]);

export async function POST(request) {
  try {
    const body = await request.json();

    const reporterUserId = Number(body?.reporterUserId);
    const reportedUserId = Number(body?.reportedUserId);
    const reportTypeRaw = String(body?.reportType || "OTHER").toUpperCase();
    const description = String(body?.description || "")
      .trim()
      .slice(0, 5000);

    if (!Number.isFinite(reporterUserId) || !Number.isFinite(reportedUserId)) {
      return Response.json(
        { error: "reporterUserId and reportedUserId are required" },
        { status: 400 },
      );
    }

    if (reporterUserId === reportedUserId) {
      return Response.json({ error: "Cannot report self" }, { status: 400 });
    }

    if (!VALID_TYPES.has(reportTypeRaw)) {
      return Response.json({ error: "Invalid reportType" }, { status: 400 });
    }

    if (!description) {
      return Response.json(
        { error: "Please add a short description" },
        { status: 400 },
      );
    }

    const rows = await sql`
      INSERT INTO user_reports (
        reporter_user_id,
        reported_user_id,
        report_type,
        description,
        status
      )
      VALUES (
        ${reporterUserId},
        ${reportedUserId},
        ${reportTypeRaw},
        ${description},
        'PENDING'
      )
      RETURNING id, created_at
    `;

    return Response.json({ success: true, report: rows[0] });
  } catch (error) {
    console.error("Error creating report:", error);
    return Response.json({ error: "Failed to create report" }, { status: 500 });
  }
}
