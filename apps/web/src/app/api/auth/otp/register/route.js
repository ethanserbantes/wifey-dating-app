import sql from "@/app/api/utils/sql";
import { hash } from "argon2";
import { normalizePhoneE164 } from "@/app/api/utils/phone.js";
import { verifyOtpCode } from "@/app/api/utils/twilioVerify.js";
import { issueOtpApiToken } from "@/app/api/utils/otpApiToken";

function parseBirthdateToIsoDate(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  // Prefer YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
      return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Also accept MM/DD/YYYY
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const m = Number(usMatch[1]);
    const d = Number(usMatch[2]);
    const y = Number(usMatch[3]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
      return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return null;
}

function computeAgeFromIsoDate(isoDate) {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d))
    return null;

  const now = new Date();
  let age = now.getFullYear() - y;
  const hasHadBirthdayThisYear =
    now.getMonth() + 1 > mo ||
    (now.getMonth() + 1 === mo && now.getDate() >= d);
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const phone = normalizePhoneE164(body?.phone);
    const code = String(body?.code || "").trim(); // legacy (older clients)
    const verificationToken = String(body?.verificationToken || "").trim();

    const name = String(body?.name || "").trim();
    const birthdateIso = parseBirthdateToIsoDate(body?.birthdate);
    const gender = body?.gender;
    const verificationPhotoUrl = String(
      body?.verificationPhotoUrl || "",
    ).trim();

    if (!phone || !name || !birthdateIso || !gender || !verificationPhotoUrl) {
      return Response.json(
        {
          error:
            "Phone, name, birthdate, gender, and verification photo are required",
        },
        { status: 400 },
      );
    }

    // New flow: we accept a short-lived verificationToken (created by /api/auth/otp/verify)
    // so the user doesn't need to enter/verify a second OTP.
    if (verificationToken) {
      const sessions = await sql(
        "SELECT token FROM otp_verification_sessions WHERE token = $1 AND phone_e164 = $2 AND expires_at > now() LIMIT 1",
        [verificationToken, phone],
      );

      if (sessions.length === 0) {
        return Response.json(
          {
            error:
              "Phone verification expired. Please request a new code and try again.",
          },
          { status: 401 },
        );
      }

      // consume token (one-time use)
      await sql("DELETE FROM otp_verification_sessions WHERE token = $1", [
        verificationToken,
      ]);
    } else {
      // Legacy fallback: verify OTP with Twilio directly
      if (!code) {
        return Response.json(
          { error: "Missing verification. Please request a new code." },
          { status: 400 },
        );
      }

      const check = await verifyOtpCode({ to: phone, code });
      if (!check.valid) {
        return Response.json({ error: "Invalid code" }, { status: 401 });
      }
    }

    const age = computeAgeFromIsoDate(birthdateIso);
    if (!Number.isFinite(age) || age < 18 || age > 99) {
      return Response.json({ error: "Invalid birthdate" }, { status: 400 });
    }

    const genderNorm = gender === "Male" || gender === "Female" ? gender : null;
    if (!genderNorm) {
      return Response.json(
        { error: "Gender must be Male or Female" },
        { status: 400 },
      );
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${phone}`;
    if (existing.length > 0) {
      return Response.json(
        { error: "Phone already registered" },
        { status: 400 },
      );
    }

    // We don't use passwords anymore, but the column is required.
    const randomSecret = `${phone}-${Date.now()}-${Math.random()}`;
    const passwordHash = await hash(randomSecret);

    const [createdUsers] = await sql.transaction((txn) => [
      txn`
        INSERT INTO users (email, password_hash, status, screening_phase)
        VALUES (${phone}, ${passwordHash}, 'PENDING_SCREENING', 1)
        RETURNING id, email, status, screening_phase, cooldown_until, created_at
      `,
      txn`
        INSERT INTO user_profiles (
          user_id,
          display_name,
          age,
          birthdate,
          gender,
          verified_gender,
          is_verified,
          verification_photo_url,
          verification_status,
          verification_submitted_at,
          phone_number
        )
        VALUES (
          currval('users_id_seq'::regclass),
          ${name},
          ${Math.floor(age)},
          ${birthdateIso}::date,
          ${genderNorm},
          ${genderNorm},
          false,
          ${verificationPhotoUrl},
          'pending',
          ${new Date()},
          ${phone}
        )
        RETURNING id
      `,
    ]);

    const createdUser = createdUsers?.[0];
    if (!createdUser) {
      return Response.json({ error: "Failed to create user" }, { status: 500 });
    }

    const apiJwt = issueOtpApiToken({ userId: createdUser.id });

    return Response.json({
      apiJwt,
      user: {
        id: createdUser.id,
        email: createdUser.email,
        status: createdUser.status,
        screeningPhase: createdUser.screening_phase,
        cooldownUntil: createdUser.cooldown_until,
        createdAt: createdUser.created_at,
        name,
        age: Math.floor(age),
        birthdate: birthdateIso,
        gender: genderNorm,
      },
    });
  } catch (e) {
    console.error("POST /api/auth/otp/register error", e);
    return Response.json(
      { error: "Could not create account. Please try again." },
      { status: 500 },
    );
  }
}
