// apps/mobile/lib/complaint-unread.js
// My Complaints red-dot: "has someone else responded to one of my complaints
// since I last opened My Complaints?"
//
// The schema has no per-user read marker, so "last seen" is a device-local
// timestamp (AsyncStorage, per user — it is not secret). The My Complaints
// screen calls markComplaintsSeen() when it is focused; the tab layout reads
// the count through fetchUnreadComplaintCount() and listens for the seen event
// to clear the dot.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { fetchUnreadComplaintCount as fetchUnreadFromApi } from "@parisar/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_SEEN_PREFIX = "complaints_last_seen.";
const seenListeners = new Set();

const lastSeenKey = (userId) => `${LAST_SEEN_PREFIX}${userId}`;

/** @param {string} userId @returns {Promise<string|null>} ISO timestamp */
async function readLastSeen(userId) {
  try {
    const raw = await AsyncStorage.getItem(lastSeenKey(userId));
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

/** @param {string} userId @param {string} iso */
async function writeLastSeen(userId, iso) {
  try {
    await AsyncStorage.setItem(lastSeenKey(userId), iso);
  } catch {
    // Non-critical: worst case the dot shows once more.
  }
}

/**
 * Unread complaint count for the current user's My Complaints tab red-dot.
 * The first call on a device starts the clock (nothing is unread yet).
 *
 * @param {object} supabase - Authenticated supabase-js client
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function fetchUnreadComplaintCount(supabase, userId) {
  if (!userId) return 0;
  const since = await readLastSeen(userId);
  if (!since) {
    await writeLastSeen(userId, new Date().toISOString());
    return 0;
  }
  return fetchUnreadFromApi(supabase, { userId, since });
}

/**
 * Record that the user has just looked at My Complaints and clear the dot.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function markComplaintsSeen(userId) {
  if (!userId) return;
  await writeLastSeen(userId, new Date().toISOString());
  for (const listener of seenListeners) {
    try {
      listener(userId);
    } catch {
      // A broken listener must not stop the others.
    }
  }
}

/**
 * Subscribe to markComplaintsSeen calls.
 * @param {(userId: string) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onComplaintsSeen(listener) {
  seenListeners.add(listener);
  return () => {
    seenListeners.delete(listener);
  };
}
