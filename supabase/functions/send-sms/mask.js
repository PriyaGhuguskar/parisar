// Mask a phone number for logs: keep the country prefix and the last 2 digits.
// "+919876543210" -> "+91********10". Phone numbers are personal data; logs
// must never carry them in full.
//
// JavaScript only — no TS annotations.
export function maskPhone(phone) {
  const s = String(phone ?? "");
  const digits = s.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const prefix = s.startsWith("+") ? `+${digits.slice(0, 2)}` : "";
  const rest = s.startsWith("+") ? digits.slice(2) : digits;
  return `${prefix}${"*".repeat(Math.max(rest.length - 2, 0))}${rest.slice(-2)}`;
}
