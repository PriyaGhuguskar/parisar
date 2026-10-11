// Realtime helpers shared by the web client components.
//
// uniqueChannelName mirrors packages/api-client/src/realtime-channel.js (that
// module is not exported from the package entry point). supabase.channel(name)
// returns the EXISTING channel when one with that name is still open, and adding
// .on() callbacks to an already-subscribed channel throws — so every component
// subscription gets a unique suffix.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/** @param {string} base */
export function uniqueChannelName(base) {
  return `${base}:${Math.random().toString(36).slice(2)}`;
}

/**
 * Re-read one row with the same embeds the list query uses, so a Realtime
 * INSERT never renders a bare payload ("By — (—)"). Returns null when the row
 * is not visible to the caller (RLS) or the read fails.
 *
 * @param {object} supabase
 * @param {string} table
 * @param {string} select
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function fetchRowById(supabase, table, select, id) {
  if (!id) return null;
  try {
    const { data, error } = await supabase.from(table).select(select).eq("id", id).maybeSingle();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Immutable insert-or-replace by id. New rows go to the front (or the end with
 * `append`).
 *
 * @param {Array} list
 * @param {object} row
 * @param {{ append?: boolean }} [opts]
 */
export function upsertById(list, row, { append = false } = {}) {
  if (!row?.id) return list;
  if (list.some((r) => r.id === row.id)) {
    return list.map((r) => (r.id === row.id ? { ...r, ...row } : r));
  }
  return append ? [...list, row] : [row, ...list];
}
