import sql from "@/app/api/utils/sql";

export async function POST(request, { params }) {
  try {
    const userId = Number(params?.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    // best-effort admin id (admin auth is localStorage-based in this app)
    let adminId = null;
    try {
      const body = await request.json();
      const parsed = Number(body?.adminId);
      if (Number.isFinite(parsed)) {
        adminId = parsed;
      }
    } catch (e) {
      // ignore
    }

    const [profile] = await sql`
      UPDATE user_profiles
      SET is_verified = true,
          verification_status = 'approved',
          verification_reviewed_at = NOW(),
          updated_at = NOW()
      WHERE user_id = ${userId}
      RETURNING *
    `;

    if (!profile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    // Audit log (optional)
    try {
      await sql`
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
        VALUES (${adminId}, 'VERIFY_APPROVE', 'user', ${userId}, ${JSON.stringify({ source: "admin_queue" })}::jsonb)
      `;
    } catch (e) {
      console.error("[AUDIT] verify approve log failed", e);
    }

    return Response.json({ profile });
  } catch (error) {
    console.error("Error approving verification:", error);
    return Response.json(
      { error: "Failed to approve verification" },
      { status: 500 },
    );
  }
}
