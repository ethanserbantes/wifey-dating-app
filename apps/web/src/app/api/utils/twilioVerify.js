const TWILIO_API_BASE = "https://verify.twilio.com/v2";

function getBasicAuthHeader() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Missing Twilio credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  const token = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${token}`;
}

function getServiceSid() {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) {
    throw new Error(
      "Missing Twilio Verify Service SID. Set TWILIO_VERIFY_SERVICE_SID.",
    );
  }
  return serviceSid;
}

export async function sendOtpSms({ to }) {
  const serviceSid = getServiceSid();
  const authHeader = getBasicAuthHeader();

  const url = `${TWILIO_API_BASE}/Services/${serviceSid}/Verifications`;

  const body = new URLSearchParams();
  body.set("To", to);
  body.set("Channel", "sms");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    const msg =
      json?.message ||
      `Twilio Verify send failed: [${resp.status}] ${resp.statusText}`;
    throw new Error(msg);
  }

  return {
    sid: json?.sid,
    status: json?.status,
  };
}

export async function verifyOtpCode({ to, code }) {
  const serviceSid = getServiceSid();
  const authHeader = getBasicAuthHeader();

  const url = `${TWILIO_API_BASE}/Services/${serviceSid}/VerificationCheck`;

  const body = new URLSearchParams();
  body.set("To", to);
  body.set("Code", code);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await resp.json().catch(() => null);

  // Twilio returns 404 when the verification has expired or doesn't exist,
  // and sometimes 400 for invalid checks. These are expected outcomes,
  // not server errors — return { valid: false } instead of throwing.
  if (!resp.ok) {
    // Only throw for genuine server errors (5xx) or missing credentials
    if (resp.status >= 500) {
      const msg =
        json?.message ||
        `Twilio Verify check failed: [${resp.status}] ${resp.statusText}`;
      throw new Error(msg);
    }

    console.error(
      `Twilio VerificationCheck returned ${resp.status}:`,
      json?.message || resp.statusText,
    );
    return {
      status: json?.status || "failed",
      valid: false,
      reason: json?.message || `Twilio returned ${resp.status}`,
    };
  }

  return {
    status: json?.status,
    valid: json?.status === "approved",
  };
}
