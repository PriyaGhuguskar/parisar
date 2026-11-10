// One way to call an onboarding wrapper from a screen.
//
// The @parisar/api-client wrappers return the JSON or { error: CODE } and throw on
// anything that is not a code (network, missing function). Screens want a single
// shape and must never show a throw as a business result, so a throw becomes the
// UNKNOWN code, which every screen renders as its generic "try again" copy.

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const UNKNOWN = "UNKNOWN";

/**
 * @param {(supabase) => Promise<any>} fn
 * @returns {Promise<{ data?: any, error?: string }>}
 */
export async function callRpc(fn) {
  try {
    const res = await fn(createSupabaseBrowserClient());
    if (res && typeof res === "object" && !Array.isArray(res) && typeof res.error === "string") {
      return { error: res.error };
    }
    return { data: res };
  } catch {
    return { error: UNKNOWN };
  }
}
