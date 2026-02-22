import sql from "@/app/api/utils/sql";

export async function POST(request, { params }) {
  try {
    const userId = Number(params?.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    let adminId = null;
    let notes = null;

    try {
      const body = await request.json();
      const parsed = Number(body?.adminId);
      if (Number.isFinite(parsed)) {
        adminId = parsed;
      }
      if (body?.notes) {
        notes = String(body.notes).trim().slice(0, 1000);
      }
    } catch (e) {
      // ignore
    }

    const [updatedUser, updatedProfile, ban] = await sql.transaction((txn) => [
      txn`
        UPDATE users
        SET status = 'LIFETIME_INELIGIBLE',
            updated_at = NOW()
        WHERE id = ${userId}
        RETURNING id, email, status, screening_phase, cooldown_until, created_at, updated_at
      `,
      txn`
        UPDATE user_profiles
        SET is_verified = false,
            verification_status = 'rejected',
            verification_reviewed_at = NOW(),
            updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING *
      `,
      txn`
        INSERT INTO behavior_bans (
          user_id,
          reason,
          violation_type,
          is_permanent,
          expires_at,
          notes,
          banned_by_admin_id
        ) VALUES (
          ${userId},
          ${"Fraudulent verification selfie"},
          ${"FRAUD"},
          ${true},
          ${null},
          ${notes},
          ${adminId}
        )
        RETURNING *
      `,
    ]);

    if (!updatedUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    try {
      await sql`
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
        VALUES (${adminId}, 'VERIFY_BAN', 'user', ${userId}, ${JSON.stringify({ source: "admin_queue", notes })}::jsonb)
      `;
    } catch (e) {
      console.error("[AUDIT] verify ban log failed", e);
    }

    return Response.json({ user: updatedUser, profile: updatedProfile, ban });
  } catch (error) {
    console.error("Error banning user from verification queue:", error);
    return Response.json({ error: "Failed to ban user" }, { status: 500 });
  }
}
