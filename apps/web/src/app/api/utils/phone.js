export function normalizePhoneE164(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // Keep leading +, strip everything else to digits
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // If user already gave +, trust it as E.164-ish (still digits only)
  if (hasPlus) {
    return `+${digits}`;
  }

  // If they typed 10 digits, assume US/CA
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If they typed 11 digits starting with 1, assume +1
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // Otherwise require the +countrycode format
  return null;
}
