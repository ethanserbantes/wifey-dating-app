import sql from "@/app/api/utils/sql";
import { notifyWaitlistForCandidate } from "@/app/api/utils/notifyWaitlist";

export async function POST(request, { params }) {
  try {
    const userId = Number(params?.id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    const existing = await sql`
      SELECT id, status FROM users WHERE id = ${userId} LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const [updatedUser] = await sql.transaction((txn) => [
      txn`
        UPDATE users
        SET status = 'APPROVED',
            screening_phase = 4,
            cooldown_until = NULL,
            screening_state_json = '{}'::jsonb,
            updated_at = NOW()
        WHERE id = ${userId}
        RETURNING id, email, status, screening_phase, cooldown_until, created_at, updated_at
      `,
      // If a screening attempt is mid-flight, close it so admin/testing doesn't leave junk in-progress rows.
      txn`
        UPDATE screening_attempts
        SET outcome = 'APPROVED',
            completed_at = NOW()
        WHERE user_id = ${userId} AND outcome = 'IN_PROGRESS'
      `,
    ]);

    // If this user just became APPROVED, try notifying nearby users who were out of profiles.
    try {
      await notifyWaitlistForCandidate({ candidateUserId: userId });
    } catch (e) {
      console.error("[PUSH][WAITLIST] notify error (approve)", e);
    }

    return Response.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Error approving user:", error);
    return Response.json({ error: "Failed to approve user" }, { status: 500 });
  }
}
