import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

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
    const body = await request.json();
    const {
      email,
      password,
      name,
      age,
      birthdate,
      gender,
      verificationPhotoUrl,
    } = body;

    if (
      !email ||
      !password ||
      !name ||
      (!birthdate && age === undefined) ||
      !gender
    ) {
      return Response.json(
        {
          error:
            "Email, password, name, birthdate (or age), and gender are required",
        },
        { status: 400 },
      );
    }

    const trimmedName = String(name).trim();
    if (!trimmedName) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const birthdateIso = parseBirthdateToIsoDate(birthdate);
    const ageFromBirthdate = birthdateIso
      ? computeAgeFromIsoDate(birthdateIso)
      : null;

    const ageNum = birthdateIso ? ageFromBirthdate : Number(age);
    if (!Number.isFinite(ageNum)) {
      return Response.json({ error: "Invalid age/birthdate" }, { status: 400 });
    }

    const ageInt = Math.floor(ageNum);
    if (ageInt < 18 || ageInt > 99) {
      return Response.json({ error: "Invalid age" }, { status: 400 });
    }

    const genderNorm = gender === "Male" || gender === "Female" ? gender : null;
    if (!genderNorm) {
      return Response.json(
        { error: "Gender must be Male or Female" },
        { status: 400 },
      );
    }

    const verificationUrlTrimmed = String(verificationPhotoUrl || "").trim();
    const hasVerificationPhoto = Boolean(verificationUrlTrimmed);

    // Check if user exists
    const existing = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existing.length > 0) {
      return Response.json(
        { error: "Email already registered" },
        { status: 400 },
      );
    }

    // Hash password
    const passwordHash = await hash(password);

    const [createdUsers] = await sql.transaction((txn) => [
      txn`
        INSERT INTO users (email, password_hash, status, screening_phase)
        VALUES (${email}, ${passwordHash}, 'PENDING_SCREENING', 1)
        RETURNING id, email, status, screening_phase, cooldown_until, created_at
      `,
      // Create a basic dating profile so the app can render name/age/gender immediately.
      txn`
        INSERT INTO user_profiles (
          user_id,
          display_name,
          age,
          birthdate,
          gender,
          is_verified,
          verification_photo_url,
          verification_status,
          verification_submitted_at
        )
        VALUES (
          currval('users_id_seq'::regclass),
          ${trimmedName},
          ${ageInt},
          ${birthdateIso}::date,
          ${genderNorm},
          false,
          ${hasVerificationPhoto ? verificationUrlTrimmed : null},
          ${hasVerificationPhoto ? "pending" : "none"},
          ${hasVerificationPhoto ? new Date() : null}
        )
         RETURNING id
       `,
    ]);

    const createdUser = createdUsers?.[0];
    if (!createdUser) {
      return Response.json({ error: "Failed to create user" }, { status: 500 });
    }

    return Response.json({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        status: createdUser.status,
        screeningPhase: createdUser.screening_phase,
        cooldownUntil: createdUser.cooldown_until,
        createdAt: createdUser.created_at,
        name: trimmedName,
        age: ageInt,
        birthdate: birthdateIso,
        gender: genderNorm,
      },
    });
  } catch (error) {
    console.error("User registration error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
