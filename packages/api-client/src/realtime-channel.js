// packages/api-client/src/realtime-channel.js
// supabase.channel(name) returns the EXISTING channel when one with that name
// is still open, and adding .on() callbacks to an already-subscribed channel
// throws. Screens remount (navigation, rotation, React strict mode) before the
// old channel is removed, so every subscription gets a unique suffix.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/** @param {string} base */
export function uniqueChannelName(base) {
  return `${base}:${Math.random().toString(36).slice(2)}`;
}
