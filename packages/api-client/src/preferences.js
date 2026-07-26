// Shared notification-preferences helpers (D-01..D-06) used by BOTH web + mobile.
//
// notification_preferences is the ONE Phase 5 table clients write directly (the
// self-service surface, RLS user_id=auth.uid()). All other mutation tables are
// REVOKE'd and go through SECURITY DEFINER RPCs. Reads come from the
// notification_preferences_effective VIEW so the UI shows the SAME defaults the
// push fan-out uses (D-06) — never a blank/loading state for a missing row.
//
// Functions exported:
//   1. getNotificationPreferences(supabase, societyId, userId)  ← reads the effective VIEW (D-06)
//   2. ensureNotificationPreferences(supabase, societyId)       ← idempotent UPSERT (D-05)
//   3. updateNotificationPreference(supabase, societyId, patch) ← partial mutation

// D-04 default preference row (all categories unmuted, quiet 22:00–07:00 IST,
// generous cap of 20). Mirrors the COALESCE defaults in the effective VIEW so the
// row a client UPSERTs matches what the fan-out assumes for a missing row.
const DEFAULT_PREFERENCES = Object.freeze({
  mute_complaints: false,
  mute_polls: false,
  mute_community: false,
  mute_fines: false,
  mute_general: false,
  quiet_start: "22:00",
  quiet_end: "07:00",
  cap_per_day: 20,
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Read the effective notification preferences for (user, society) (D-06).
 *
 * Reads from notification_preferences_effective — a VIEW that LEFT JOINs the
 * table with the D-04 defaults via COALESCE. A member who hasn't saved any prefs
 * still gets a fully-populated row, so the settings screen renders defaults
 * instantly and the UI matches the fan-out's view of the world.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {string} userId
 * @returns {Promise<object>} the effective preferences row
 */
export async function getNotificationPreferences(supabase, societyId, userId) {
  const { data, error } = await supabase
    .from("notification_preferences_effective")
    .select("*")
    .eq("user_id", userId)
    .eq("society_id", societyId)
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Writes (the ONE directly-writable Phase 5 table — self-service RLS)
// ---------------------------------------------------------------------------

/**
 * Idempotently provision the preferences row for the current user + society (D-05).
 *
 * Called by mobile + web on session-confirm and on the preferences-screen mount.
 *
 * The user_id is derived from supabase.auth.getUser() (the server-validated
 * session) — NEVER a client-supplied argument (threat T-05-13 / the T-04-14
 * pattern). Uses ignoreDuplicates so a second call is a true no-op (idempotent).
 *
 * @param {object} supabase
 * @param {string} societyId
 * @returns {Promise<boolean>} true on success, false if there is no auth user
 */
export async function ensureNotificationPreferences(supabase, societyId) {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userRes?.user?.id;
  if (!userId) return false;

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: userId,
      society_id: societyId,
      ...DEFAULT_PREFERENCES,
    },
    { onConflict: "user_id,society_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  return true;
}

/**
 * Apply a partial patch to the current user's preferences for a society.
 *
 * The single mutation behind the settings screen — e.g. { mute_polls: true },
 * { quiet_start, quiet_end }, or { cap_per_day }. Debouncing happens in the UI.
 * The user_id is derived from the session (T-05-13); the WHERE also pins
 * society_id so a user can only edit their own row in the active society.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {object} patch - partial set of preference columns
 * @returns {Promise<boolean>} true on success, false if there is no auth user
 */
export async function updateNotificationPreference(supabase, societyId, patch) {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userRes?.user?.id;
  if (!userId) return false;

  const { error } = await supabase
    .from("notification_preferences")
    .update(patch)
    .eq("user_id", userId)
    .eq("society_id", societyId);
  if (error) throw error;
  return true;
}
