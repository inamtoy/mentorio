// Mirrors backend auth_custom/services/phone.py::normalize_uz_phone, so the
// form flags a bad number before submitting — the API stays the authority
// and stores the canonical "+998XXXXXXXXX" form.
export const UZ_PHONE_ERROR = "Enter an Uzbek number: +998 followed by 9 digits (e.g. +998 90 123 45 67)";

export function normalizeUzPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 9) digits = `998${digits}`;
  if (digits.length !== 12 || !digits.startsWith("998")) return null;
  return `+${digits}`;
}
