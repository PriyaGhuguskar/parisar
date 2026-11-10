// Date-only values travel as "yyyy-MM-dd" strings: what Postgres `date` columns and
// RPCs take. Parsing through local parts rather than new Date(string) keeps a
// birthday from shifting a day when the string would otherwise be read as UTC.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {unknown} value
 * @returns {Date | undefined}
 */
export function parseDateValue(value) {
  const match = typeof value === "string" ? DATE_RE.exec(value) : null;
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // new Date(2026, 1, 31) rolls over to March instead of failing.
  const exact =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return exact ? date : undefined;
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function toDateValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Latin digits in every language. Marathi defaults to Devanagari digits in Intl, which
 * would not match the numbers people type or see anywhere else in the product.
 *
 * @param {string} [lng] en, hi or mr
 * @returns {string} a BCP 47 tag for Intl
 */
export function intlLocale(lng = "en") {
  return `${lng}-IN-u-nu-latn`;
}

/**
 * @param {unknown} value "yyyy-MM-dd"
 * @param {string} [lng] en, hi or mr
 * @returns {string} e.g. "6 Nov 2026", or "" when the value is not a real date.
 */
export function formatDateValue(value, lng = "en") {
  const date = parseDateValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale(lng), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
