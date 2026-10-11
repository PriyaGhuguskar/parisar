// India Standard Time helpers for bookings.
//
// Societies are in India, and the request_booking RPC checks lead time,
// horizon and amenity hours in Asia/Kolkata — so the client must build and show
// times in IST regardless of the phone's timezone setting. IST has no DST, so a
// fixed +05:30 offset is exact. Implemented with plain arithmetic (no Intl
// timeZone support needed from Hermes).
//
// JavaScript only — no TypeScript per CLAUDE.md.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Build an IST timestamptz string from the wall-clock fields the user picked:
 * the calendar date of `datePart` and the hour/minute of `timePart` (both read
 * with local getters, exactly as the native picker displayed them).
 *
 * @param {Date} datePart
 * @param {Date} timePart
 * @returns {string} e.g. "2026-06-18T18:00:00+05:30"
 */
export function istIsoFromWallClock(datePart, timePart) {
  const y = datePart.getFullYear();
  const mo = pad2(datePart.getMonth() + 1);
  const d = pad2(datePart.getDate());
  const h = pad2(timePart.getHours());
  const mi = pad2(timePart.getMinutes());
  return `${y}-${mo}-${d}T${h}:${mi}:00+05:30`;
}

/**
 * Parse a Postgres timestamptz / tstzrange bound such as
 * "2026-06-18 18:00:00+00" (Hermes' Date parser rejects the space separator
 * and the 2-digit offset) or a regular ISO string.
 *
 * @param {string | Date | null | undefined} value
 * @returns {Date | null}
 */
export function parsePgTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let s = String(value).trim().replace(/^"|"$/g, "");
  // "YYYY-MM-DD HH:MM" → "YYYY-MM-DDTHH:MM"
  s = s.replace(/^(\d{4}-\d{2}-\d{2})[ T]/, "$1T");
  // "+00" / "-0530" / "+05:30" → "+00:00" / "-05:30" / "+05:30"
  s = s.replace(/([+-])(\d{2}):?(\d{2})?$/, (_m, sign, hh, mm) => `${sign}${hh}:${mm ?? "00"}`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A Date whose LOCAL fields equal the IST wall clock of `date`, so date-fns
 * format() (which reads local fields) prints India time on any device.
 *
 * @param {Date} date
 * @returns {Date}
 */
export function toIstWallClock(date) {
  const u = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(
    u.getUTCFullYear(),
    u.getUTCMonth(),
    u.getUTCDate(),
    u.getUTCHours(),
    u.getUTCMinutes(),
    u.getUTCSeconds(),
  );
}
