import sql from "@/app/api/utils/sql";

export async function POST(request, { params }) {
  try {
    const userId = Number(params?.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    let adminId = null;
    let reason = null;

    try {
      const body = await request.json();
      const parsed = Number(body?.adminId);
      if (Number.isFinite(parsed)) {
        adminId = parsed;
      }
      if (body?.reason) {
        reason = String(body.reason).trim().slice(0, 500);
      }
    } catch (e) {
      // ignore
    }

    const [profile] = await sql`
      UPDATE user_profiles
      SET is_verified = false,
          verification_status = 'rejected',
          verification_reviewed_at = NOW(),
          updated_at = NOW()
      WHERE user_id = ${userId}
      RETURNING *
    `;

    if (!profile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    try {
      await sql`
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
        VALUES (${adminId}, 'VERIFY_DENY', 'user', ${userId}, ${JSON.stringify({ source: "admin_queue", reason })}::jsonb)
      `;
    } catch (e) {
      console.error("[AUDIT] verify deny log failed", e);
    }

    return Response.json({ profile });
  } catch (error) {
    console.error("Error denying verification:", error);
    return Response.json(
      { error: "Failed to deny verification" },
      { status: 500 },
    );
  }
}
