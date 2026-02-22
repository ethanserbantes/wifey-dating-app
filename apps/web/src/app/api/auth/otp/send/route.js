import sql from "@/app/api/utils/sql";
import { normalizePhoneE164 } from "@/app/api/utils/phone.js";
import { sendOtpSms } from "@/app/api/utils/twilioVerify.js";

function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const phoneRaw = body?.phone;

    const phone = normalizePhoneE164(phoneRaw);
    if (!phone) {
      return Response.json(
        {
          error:
            "Please enter a valid phone number. Tip: include country code like +1.",
        },
        { status: 400 },
      );
    }

    // Simple throttle (to protect cost + prevent spam).
    // Twilio has its own protections too, but this stops abuse before we even call Twilio.
    const ip = getClientIp(request);

    const MAX_PHONE_PER_10_MIN = 3;
    const MAX_PHONE_PER_DAY = 15;
    const MAX_IP_PER_HOUR = 40;

    const [phone10mRow] = await sql(
      "SELECT COUNT(*)::int AS count FROM otp_send_events WHERE phone_e164 = $1 AND created_at > now() - interval '10 minutes'",
      [phone],
    );
    const phone10mCount = Number(phone10mRow?.count || 0);
    if (phone10mCount >= MAX_PHONE_PER_10_MIN) {
      return Response.json(
        { error: "Too many codes sent. Please wait a bit and try again." },
        { status: 429 },
      );
    }

    const [phoneDayRow] = await sql(
      "SELECT COUNT(*)::int AS count FROM otp_send_events WHERE phone_e164 = $1 AND created_at > now() - interval '1 day'",
      [phone],
    );
    const phoneDayCount = Number(phoneDayRow?.count || 0);
    if (phoneDayCount >= MAX_PHONE_PER_DAY) {
      return Response.json(
        { error: "Too many codes sent today. Please try again tomorrow." },
        { status: 429 },
      );
    }

    if (ip) {
      const [ipHourRow] = await sql(
        "SELECT COUNT(*)::int AS count FROM otp_send_events WHERE ip = $1 AND created_at > now() - interval '1 hour'",
        [ip],
      );
      const ipHourCount = Number(ipHourRow?.count || 0);
      if (ipHourCount >= MAX_IP_PER_HOUR) {
        return Response.json(
          { error: "Too many requests. Please slow down and try again." },
          { status: 429 },
        );
      }
    }

    await sendOtpSms({ to: phone });

    // Record successful sends for throttling.
    await sql("INSERT INTO otp_send_events (phone_e164, ip) VALUES ($1, $2)", [
      phone,
      ip,
    ]);

    return Response.json({ ok: true });
  } catch (e) {
    console.error("POST /api/auth/otp/send error", e);
    return Response.json(
      { error: "Could not send code. Please try again." },
      { status: 500 },
    );
  }
}
