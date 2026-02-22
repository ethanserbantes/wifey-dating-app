import sql from "@/app/api/utils/sql";
import { normalizePhoneE164 } from "@/app/api/utils/phone.js";
import { verifyOtpCode } from "@/app/api/utils/twilioVerify.js";
import { randomUUID } from "crypto";
import { issueOtpApiToken } from "@/app/api/utils/otpApiToken";

function computeDeletionExpired(userRow) {
  const now = new Date();
  const scheduledFor = userRow?.delete_scheduled_for
    ? new Date(userRow.delete_scheduled_for)
    : null;

  const deletionExpired =
    !!userRow?.delete_requested_at &&
    scheduledFor instanceof Date &&
    Number.isFinite(scheduledFor.getTime()) &&
    scheduledFor.getTime() <= now.getTime();

  return deletionExpired;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalizePhoneE164(body?.phone);
    const code = String(body?.code || "").trim();

    if (!phone || !code) {
      return Response.json(
        { error: "Phone and code are required" },
        { status: 400 },
      );
    }

    const check = await verifyOtpCode({ to: phone, code });
    if (!check.valid) {
      // Provide a more specific message when the verification has expired
      const reason = check.reason || "";
      const isExpired =
        reason.toLowerCase().includes("not found") ||
        reason.toLowerCase().includes("expired");

      const message = isExpired
        ? "Your verification code has expired. Please request a new one."
        : "Invalid code. Please check and try again.";

      return Response.json({ error: message }, { status: 401 });
    }

    const users = await sql`
      SELECT u.id,
             u.email,
             u.status,
             u.cooldown_until,
             u.screening_phase,
             u.delete_requested_at,
             u.delete_scheduled_for,
             u.deleted_at,
             up.gender,
             up.verified_gender
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.email = ${phone}
      LIMIT 1
    `;

    // If there is no user yet, we return a short-lived token that can be used to finish registration
    // without requiring the user to enter (and Twilio to verify) a second OTP.
    if (users.length === 0) {
      const token = randomUUID();
      await sql(
        "INSERT INTO otp_verification_sessions (phone_e164, token) VALUES ($1, $2)",
        [phone, token],
      );

      return Response.json({
        needsRegistration: true,
        phone,
        verificationToken: token,
      });
    }

    const user = users[0];

    const deletionExpired = computeDeletionExpired(user);

    if (user.deleted_at || deletionExpired) {
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

    // existing user
    const apiJwt = issueOtpApiToken({ userId: user.id });

    return Response.json({
      apiJwt,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        screeningPhase: user.screening_phase,
        cooldownUntil: user.cooldown_until,
        // Include gender so the mobile app can consistently request the correct quiz audience.
        gender: user.verified_gender || user.gender || null,
      },
    });
  } catch (e) {
    console.error("POST /api/auth/otp/verify error", e);
    return Response.json(
      { error: "Could not verify code. Please try again." },
      { status: 500 },
    );
  }
}
