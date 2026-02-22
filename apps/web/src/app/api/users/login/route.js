import sql from "@/app/api/utils/sql";
import { verify } from "argon2";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json(
        { error: "Email and password required" },
        { status: 400 },
      );
    }

    const users = await sql`
      SELECT id, email, password_hash, status, cooldown_until, screening_phase,
             delete_requested_at, delete_scheduled_for, deleted_at
      FROM users 
      WHERE email = ${email}
    `;

    if (users.length === 0) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const user = users[0];

    // If a deletion request has passed the 30-day window, finalize deletion lazily.
    // (We can't rely on cron jobs here, so we enforce on access.)
    const now = new Date();
    const scheduledFor = user.delete_scheduled_for
      ? new Date(user.delete_scheduled_for)
      : null;

    const deletionExpired =
      !!user.delete_requested_at &&
      scheduledFor instanceof Date &&
      Number.isFinite(scheduledFor.getTime()) &&
      scheduledFor.getTime() <= now.getTime();

    if (user.deleted_at || deletionExpired) {
      // Finalize deletion if needed
      if (!user.deleted_at && deletionExpired) {
        try {
          await sql`DELETE FROM users WHERE id = ${user.id}`;
        } catch (e) {
          console.error("Error finalizing expired deletion:", e);
        }
      }

      return Response.json(
        {
          error:
            "This account was deleted. If you meant to recover it, the 30-day recovery window has passed.",
          code: "ACCOUNT_DELETED",
        },
        { status: 410 },
      );
    }

    // If they requested deletion but are still inside the 30-day window,
    // block login unless they explicitly restore.
    if (user.delete_requested_at && user.delete_scheduled_for) {
      return Response.json(
        {
          error:
            "This account is scheduled for deletion. You can restore it now.",
          code: "ACCOUNT_PENDING_DELETION",
          userId: user.id,
          deleteScheduledFor: user.delete_scheduled_for,
        },
        { status: 409 },
      );
    }

    const isValid = await verify(user.password_hash, password);

    if (!isValid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Return user info (excluding password)
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        screeningPhase: user.screening_phase,
        cooldownUntil: user.cooldown_until,
      },
    });
  } catch (error) {
    console.error("User login error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
