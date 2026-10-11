// apps/mobile/lib/complaint-unread.js
// Phase 04.1 stub — Phase 5 (Notifications) wires this to the real unread-complaint
// query. For Phase 04.1 the stub always returns 0 so the My Complaints tab's
// red-dot badge stays hidden, while the tabBarBadge prop is still wired —
// meeting the UI-SPEC §Screen 6 red-dot contract without lighting it up yet.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * Unread complaint count for the current user's My Complaints tab red-dot.
 *
 * Returns 0 in the v1 stub. Phase 5 will query complaints where
 * (owner_id = userId OR reporter_id = userId) AND updated_at > userLastSeenAt
 * (lastSeenAt persisted to AsyncStorage when the My Complaints screen mounts),
 * then return the count so the red dot lights up automatically.
 *
 * @param {object} _supabase - reserved for Phase 5 implementation
 * @param {string} _userId   - reserved for Phase 5 implementation
 * @returns {Promise<number>} unread complaint count (always 0 in v1 stub)
 */
export async function fetchUnreadComplaintCount(_supabase, _userId) {
  // TODO Phase 5 (Notifications): query complaints where
  //   (owner_id = userId OR reporter_id = userId) AND updated_at > lastSeenAt
  // and return the count. lastSeenAt lives in AsyncStorage, set when the
  // My Complaints screen mounts.
  return 0;
}
