"use server";

// Server actions for Phase 5 notification-preferences mutations (web).
//
// notification_preferences is the ONE Phase 5 table the client writes directly
// (self-service surface, RLS user_id=auth.uid()). The api-client helpers derive
// the user_id from the server-validated session (T-05-13/T-05-07) — never a client
// argument — so a user can only edit their own row in the active society.
//
// ensurePreferencesAction is idempotent (D-05); updatePreferenceAction applies a
// partial patch (debounced in the UI, DD-7).

import { ensureNotificationPreferences, updateNotificationPreference } from "@parisar/api-client";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";

/**
 * Idempotently provision the caller's preferences row for a society (D-05).
 *
 * @param {string} societyId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function ensurePreferencesAction(societyId) {
  const supabase = await createSupabaseServerClient();
  try {
    await ensureNotificationPreferences(supabase, societyId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? "ensure_failed" };
  }
}

/**
 * Apply a partial patch to the caller's preferences for a society (scoped to the
 * session user via RLS). e.g. { mute_polls: true }, { quiet_start, quiet_end },
 * { cap_per_day }.
 *
 * @param {string} societyId
 * @param {object} patch
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
// PAR-014: allow-list of user-editable preference columns. The client patch is
// NOT trusted — only these keys are forwarded to the DB (no mass-assignment of
// arbitrary columns), and each value is validated.
const EDITABLE_PREF_COLUMNS = new Set([
  "mute_complaints",
  "mute_polls",
  "mute_community",
  "mute_fines",
  "mute_general",
  "quiet_start",
  "quiet_end",
  "cap_per_day",
]);
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updatePreferenceAction(societyId, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, error: "invalid_patch" };
  }

  // PAR-014: sanitize — whitelist columns + validate values before the DB write.
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!EDITABLE_PREF_COLUMNS.has(key)) continue;
    if (key.startsWith("mute_")) {
      if (typeof value !== "boolean") return { ok: false, error: "invalid_mute" };
    } else if (key === "cap_per_day") {
      // 0 would silently suppress ALL push (a foot-gun the audit flagged). A cap
      // must be a positive integer, or null for "unlimited".
      if (value !== null && !(Number.isInteger(value) && value > 0)) {
        return { ok: false, error: "invalid_cap" };
      }
    } else if (key === "quiet_start" || key === "quiet_end") {
      if (value !== null && !(typeof value === "string" && HHMM_RE.test(value))) {
        return { ok: false, error: "invalid_quiet_hours" };
      }
    }
    clean[key] = value;
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: "empty_patch" };

  const supabase = await createSupabaseServerClient();
  try {
    await updateNotificationPreference(supabase, societyId, clean);
    revalidatePath("/settings/notifications");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? "update_failed" };
  }
}
