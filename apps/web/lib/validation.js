// apps/web/lib/validation.js
// Tiny input validators for server actions ("use server") — every action is a
// public POST endpoint, so its arguments are untrusted no matter what the UI sends.
//
// WHY NOT ZOD. zod is not a declared dependency of @parisar/web (only a hoisted
// transitive copy exists), and adding one needs a lockfile change. These checks
// are deliberately small and dependency-free. The database (RLS, RPC guards, CHECK
// constraints, enum casts) stays the real enforcement — this layer rejects junk
// early, caps sizes, and keeps control characters out of stored text.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/** 8-4-4-4-12 hex. No version-nibble check: seeded fixtures use non-v4 ids. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** snake_case enum-ish token (complaint response kinds, report reasons, categories). */
const TOKEN_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** Indian mobile in E.164: +91 then a 6-9 lead digit and 9 more digits. */
const IN_MOBILE_E164_RE = /^\+91[6-9]\d{9}$/;

/** Storage object key: "<society>/<area>/<id>/<file>.<ext>" — no "..", no leading "/". */
const STORAGE_KEY_RE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]{1,8})?){1,6}$/;
const MAX_STORAGE_KEY = 512;

const LINE_BREAK_RE = /[\r\n\t]/;

/**
 * True when `s` contains a character never legitimate in form text:
 *   · C0 controls except TAB/LF/CR, DEL, and C1 controls;
 *   · bidi overrides/isolates (U+202A–U+202E, U+2066–U+2069), used to visually
 *     spoof text (e.g. reversed file names).
 * Zero-width (non-)joiners U+200C/U+200D are NOT rejected: Devanagari needs them.
 * Code-point checks instead of a regex so no raw control/bidi character ever
 * appears in this source file.
 *
 * @param {string} s
 */
function hasForbiddenChar(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) continue;
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
    if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
  }
  return false;
}

/** @param {unknown} v */
export function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

/** @param {unknown} v */
export function isToken(v) {
  return typeof v === "string" && TOKEN_RE.test(v);
}

/** @param {unknown} v */
export function isIndianMobileE164(v) {
  return typeof v === "string" && IN_MOBILE_E164_RE.test(v);
}

/** @param {unknown} v */
export function isStorageKey(v) {
  return typeof v === "string" && v.length <= MAX_STORAGE_KEY && STORAGE_KEY_RE.test(v);
}

/**
 * Validate + trim a piece of user text.
 *
 * @param {unknown} value
 * @param {{ max: number, min?: number, multiline?: boolean, optional?: boolean }} opts
 *   optional — null / undefined / blank become `null` (instead of failing `min`).
 * @returns {{ ok: true, value: string|null } | { ok: false }}
 */
export function cleanText(value, { max, min = 0, multiline = false, optional = false }) {
  if (value === null || value === undefined) {
    return optional || min === 0 ? { ok: true, value: optional ? null : "" } : { ok: false };
  }
  if (typeof value !== "string") return { ok: false };
  const v = value.trim();
  if (v.length === 0 && optional) return { ok: true, value: null };
  if (v.length < min || v.length > max) return { ok: false };
  if (hasForbiddenChar(v)) return { ok: false };
  if (!multiline && LINE_BREAK_RE.test(v)) return { ok: false };
  return { ok: true, value: v };
}

/**
 * Optional storage attachment triple (storageKey + mimeType + byteSize). All
 * three null is "no attachment".
 *
 * @param {{ storageKey?: unknown, mimeType?: unknown, byteSize?: unknown }} input
 * @param {{ maxBytes: number }} opts
 * @returns {{ ok: true, value: { storageKey: string|null, mimeType: string|null, byteSize: number|null } } | { ok: false }}
 */
export function cleanAttachment(input, { maxBytes }) {
  const storageKey = input?.storageKey ?? null;
  const mimeType = input?.mimeType ?? null;
  const byteSize = input?.byteSize ?? null;
  if (storageKey === null) {
    return { ok: true, value: { storageKey: null, mimeType: null, byteSize: null } };
  }
  if (!isStorageKey(storageKey)) return { ok: false };
  if (mimeType !== null && !isMimeType(mimeType)) {
    return { ok: false };
  }
  if (byteSize !== null && !(Number.isInteger(byteSize) && byteSize > 0 && byteSize <= maxBytes)) {
    return { ok: false };
  }
  return { ok: true, value: { storageKey, mimeType, byteSize } };
}

/** e.g. "image/jpeg", "application/pdf". */
function isMimeType(v) {
  return typeof v === "string" && /^[a-z]+\/[a-z0-9.+-]{1,60}$/i.test(v);
}

/** ISO-8601 timestamp that Date can parse (e.g. "2026-10-11T09:30:00.000Z"). */
export function isIsoTimestamp(v) {
  return (
    typeof v === "string" &&
    v.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) &&
    !Number.isNaN(Date.parse(v))
  );
}

/** Calendar date "YYYY-MM-DD". */
export function isIsoDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}
