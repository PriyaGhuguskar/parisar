// Shared RPC call for the society onboarding wrappers.
//
// The onboarding RPCs report expected failures two ways: a raised error whose
// message is an UPPER_CASE code, or a returned { error: CODE } (used where a failed
// attempt must still count against a rate limit). Every wrapper normalises both to
// { error: CODE }. Anything that is not a code (network down, bad deploy) throws, so
// a screen can never mistake an outage for a business result.

const CODE_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

/** The onboarding error code in a PostgREST error, or null. */
export function onboardingErrorCode(error) {
  const match = String(error?.message ?? "").match(CODE_RE);
  return match ? match[0] : null;
}

/**
 * @returns {Promise<object|Array|{error:string}>} the RPC's JSON, or { error: CODE }.
 */
export async function callOnboardingRpc(supabase, fn, args) {
  const { data, error } =
    args === undefined ? await supabase.rpc(fn) : await supabase.rpc(fn, args);
  if (error) {
    const code = onboardingErrorCode(error);
    if (code) return { error: code };
    throw error;
  }
  return data;
}
