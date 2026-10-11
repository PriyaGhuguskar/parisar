// Keyset (cursor) pagination helpers for newest-first lists.
//
// Ordering on created_at alone skips or repeats rows when two rows share a
// timestamp (bulk inserts, same-transaction writes). Lists therefore order by
// (created_at desc, id desc) and page with a composite cursor { createdAt, id }.
//
// For backward compatibility a plain ISO-timestamp string cursor is still accepted
// and behaves like the old `created_at < cursor` filter.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a cursor timestamp: it is interpolated into a PostgREST `or` filter, so
 * only values that parse as a date (and contain no filter syntax) are accepted.
 *
 * @param {unknown} value
 * @returns {string}
 */
function assertTimestamp(value) {
  if (typeof value !== "string" || /[,()"\\]/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("INVALID_CURSOR");
  }
  return value;
}

/**
 * Apply newest-first ordering plus an optional composite cursor to a query.
 *
 * @param {object} q - supabase-js filter builder
 * @param {string|{ createdAt: string, id?: string|null }|null} cursor
 * @param {{ column?: string }} [opts] - timestamp column (default created_at)
 * @returns {object} the builder with order + cursor applied
 */
export function applyNewestFirstCursor(q, cursor, { column = "created_at" } = {}) {
  const ordered = q.order(column, { ascending: false }).order("id", { ascending: false });
  if (!cursor) return ordered;

  if (typeof cursor === "string") {
    return ordered.lt(column, assertTimestamp(cursor));
  }

  const ts = assertTimestamp(cursor.createdAt);
  if (!cursor.id) return ordered.lt(column, ts);
  if (!UUID_RE.test(cursor.id)) throw new Error("INVALID_CURSOR");

  return ordered.or(`${column}.lt.${ts},and(${column}.eq.${ts},id.lt.${cursor.id})`);
}

/**
 * Build the cursor for the next page from a page of rows (null when the page was
 * not full, i.e. there is nothing more to fetch).
 *
 * @param {Array<{ id: string, created_at?: string }>} rows
 * @param {number} limit
 * @param {{ column?: string }} [opts]
 * @returns {{ createdAt: string, id: string }|null}
 */
export function nextCursorFrom(rows, limit, { column = "created_at" } = {}) {
  if (!Array.isArray(rows) || rows.length < limit || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return { createdAt: last[column], id: last.id };
}
