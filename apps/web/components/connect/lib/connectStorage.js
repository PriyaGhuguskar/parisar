// Hands the submit result from /connect to /connect/success in the same tab.
//
// Only what the server returned is kept, never the phone number, so the success page
// shows the confirmed request and nothing typed. Storage can be missing or throw (private
// mode, blocked site data); the success page then falls back to the status lookup.

const KEY = "parisar.connect.lastRequest";
const FIELDS = [
  "request_code",
  "status",
  "call_now",
  "preferred_at",
  "preferred_slot",
  "alternate_at",
  "scheduled_at",
  "created_at",
];

function pick(result, societyName) {
  const out = {};
  for (const field of FIELDS) out[field] = result?.[field] ?? null;
  out.society_name = societyName ?? null;
  return out;
}

export function saveLastRequest(result, societyName) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(pick(result, societyName)));
    return true;
  } catch {
    return false;
  }
}

/** The stored request when its code matches (or no code is given), else null. */
export function loadLastRequest(code) {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.request_code !== "string") return null;
    if (code && value.request_code !== String(code).trim().toUpperCase()) return null;
    return value;
  } catch {
    return null;
  }
}
