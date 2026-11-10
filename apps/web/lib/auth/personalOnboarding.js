// apps/web/lib/auth/personalOnboarding.js
// Does a society authority without a flat still owe us their personal onboarding?
//
// An authority who manages a society they do not live in can say so on
// /setup/personal ("Continue without a flat"). That sets
// society_authorities.personal_onboarding_skipped_at, and my_authority_societies
// then reports setup_state 'complete' for that society. Without this check the
// layout and /dashboard treated every flat-less manager as unfinished and sent
// them back to /onboarding, so the skip did nothing.
//
// Fails towards the old behaviour (needs onboarding) when the lookup errors.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string|null} societyId
 * @param {{ flat_id?: string|null } | null | undefined} membership
 * @returns {Promise<boolean>}
 */
export async function needsPersonalOnboarding(supabase, societyId, membership) {
  if (!societyId || !membership || membership.flat_id) return false;
  try {
    const { data, error } = await supabase.rpc("my_authority_societies");
    if (error) return true;
    const row = (data?.societies ?? []).find((s) => s.society_id === societyId);
    return row ? row.setup_state !== "complete" : true;
  } catch {
    return true;
  }
}
