// Shared notification-preferences helpers (D-01..D-06) used by BOTH web + mobile.
//
// notification_preferences is the ONE Phase 5 table clients write directly (the
// self-service surface, RLS user_id=auth.uid()). All other mutation tables are
// REVOKE'd and go through SECURITY DEFINER RPCs. Reads come from the table and
// are merged with the same D-04 defaults the push fan-out's
// notification_preferences_effective VIEW applies (D-06) — never a blank/loading
// state for a missing row. (Migration 054 revoked client access to that VIEW.)
//
// Functions exported:
//   1. getNotificationPreferences(supabase, societyId, userId)  ← table row ∪ D-04 defaults (D-06)
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

// Columns a client may patch. Anything else (user_id, society_id, id, …) is rejected
// so a caller can never move a row to another user or society.
const PATCHABLE_COLUMNS = Object.freeze(Object.keys(DEFAULT_PREFERENCES));

// Postgres renders `time` columns as HH:MM:SS; defaults for a missing row use the
// same shape so callers compare like with like.
const READ_DEFAULTS = Object.freeze({
  ...DEFAULT_PREFERENCES,
  quiet_start: "22:00:00",
  quiet_end: "07:00:00",
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Read the effective notification preferences for (user, society) (D-06).
 *
 * Reads the caller's own notification_preferences row (RLS: user_id = auth.uid())
 * and fills any missing row / column with the D-04 defaults — the same COALESCE the
 * fan-out's notification_preferences_effective VIEW applies. A member who hasn't
 * saved any prefs still gets a fully-populated row, so the settings screen renders
 * defaults instantly and the UI matches the fan-out's view of the world.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {string} userId
 * @returns {Promise<object>} the effective preferences row
 * @throws on query errors
 */
export async function getNotificationPreferences(supabase, societyId, userId) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select(
      "user_id, society_id, mute_complaints, mute_polls, mute_community, mute_fines, mute_general, quiet_start, quiet_end, cap_per_day",
    )
    .eq("user_id", userId)
    .eq("society_id", societyId)
    .maybeSingle();
  if (error) throw error;

  const row = data ?? {};
  const effective = { user_id: userId, society_id: societyId, ...READ_DEFAULTS };
  for (const key of PATCHABLE_COLUMNS) {
    if (row[key] !== null && row[key] !== undefined) effective[key] = row[key];
  }
  return effective;
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
 * The user_id is derived from the session (T-05-13) and society_id is pinned, so a
 * user can only edit their own row in the given society.
 *
 * UPSERT (not UPDATE) so a missing row is created instead of silently matching 0
 * rows; the returned row is verified so an RLS-filtered write is reported, not
 * swallowed.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {object} patch - partial set of preference columns (PATCHABLE_COLUMNS only)
 * @returns {Promise<boolean>} true on success, false if there is no auth user
 * @throws Error('INVALID_PREFERENCE_PATCH') for unknown columns / empty patch,
 *         Error('PREFERENCES_NOT_SAVED') when no row was written, or the query error
 */
export async function updateNotificationPreference(supabase, societyId, patch) {
  const keys = Object.keys(patch ?? {});
  if (keys.length === 0 || keys.some((k) => !PATCHABLE_COLUMNS.includes(k))) {
    throw new Error("INVALID_PREFERENCE_PATCH");
  }

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userRes?.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      { ...patch, user_id: userId, society_id: societyId },
      { onConflict: "user_id,society_id" },
    )
    .select("id");
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) throw new Error("PREFERENCES_NOT_SAVED");
  return true;
}
