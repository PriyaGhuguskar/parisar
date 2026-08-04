"use server";

// Sign-in: phone + society code (first claim, one OTP) OR phone + PIN (after).
//
// SHAPE OF THE FLOW
//   first time   phone + society code -> ONE OTP -> onboarding -> set 4-digit PIN
//   after that   phone + PIN                                    (no SMS at all)
//   forgot PIN   chairman resets (audited) -> one OTP -> new PIN
//
// WHY THE CODE IS NOT THE PASSWORD.
// An earlier draft set the society code AS the user's password so that phone +
// code could sign someone in without an OTP. That is unsafe in a way that is
// easy to miss: the code is shared with every resident, so a neighbour entering
// your phone number plus the code would have the server RESET your password back
// to the code — silently breaking the PIN you had set and locking you out.
//
// With one OTP at first claim, the code never touches the password. It only
// answers "which society is this person joining". The PIN is the only credential
// that is ever written. That removes the failure mode instead of guarding it.
//
// Supabase Auth still issues every session: signInWithOtp/verifyOtp for the
// claim, signInWithPassword for the PIN. Nothing here signs its own JWTs —
// CLAUDE.md rules that out, and it would be reimplementing auth badly.
//
// The service-role key never reaches the browser: this file is "use server" and
// only returns a small status object. Sessions are minted client-side so the
// auth cookies land in the browser (RESEARCH.md Pitfall 2).

import { createClient } from "@supabase/supabase-js";
import { derivePinSecret } from "../../lib/auth/pinSecret";

const PHONE_RE = /^[6-9]\d{9}$/;
const CODE_RE = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SERVER_MISCONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function findUserByPhone(sb, phoneE164) {
  const bare = phoneE164.replace("+", "");
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return { error: "SERVER_ERROR" };
  return { user: (data?.users ?? []).find((u) => u.phone === bare) ?? null };
}

/**
 * Step 1 of sign-in: which credential should we ask this number for?
 *
 * Deliberately does NOT reveal whether the number is registered — both answers
 * are a normal next step, so this cannot be used to enumerate which phone
 * numbers belong to a society.
 *
 * @returns {Promise<{mode:"staff"|"pin"|"setpin"|"code"|"family"|"chairman"} | {error:string}>}
 */
export async function lookupPhone(rawPhone) {
  const phone = String(rawPhone ?? "").replace(/\D/g, "");
  if (!PHONE_RE.test(phone)) return { error: "INVALID_PHONE" };

  let sb;
  try {
    sb = admin();
  } catch {
    return { error: "SERVER_ERROR" };
  }

  const { user, error } = await findUserByPhone(sb, `+91${phone}`);
  if (error) return { error };

  // Staff sign in with OTP only.
  if (user) {
    const { data: isStaff } = await sb
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (isStaff) return { mode: "staff" };
  }

  // Does this number own a membership already?
  let membership = null;
  if (user) {
    const { data } = await sb
      .from("society_memberships")
      .select("id, society_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    membership = data;
  }

  // CHAIRMAN: their number is a society's secretary_phone, no secretary has
  // claimed yet, and they are not already a member. This must run whether or not
  // an orphaned auth user exists from an earlier, unfinished login — otherwise a
  // chairman who once tapped "Send OTP" gets routed as a plain resident.
  if (!membership) {
    const { data: soc } = await sb
      .from("societies")
      .select("id")
      .filter("secretary_phone", "ilike", `%${phone}`)
      .limit(1)
      .maybeSingle();
    if (soc) {
      const { data: sec } = await sb
        .from("society_memberships")
        .select("id")
        .eq("society_id", soc.id)
        .eq("role", "secretary")
        .eq("status", "active")
        .maybeSingle();
      if (!sec) return { mode: "chairman" };
    }
  }

  // GUARD: this number is registered as a gate guard. Detected before the generic
  // PIN/code routing so a guard is always sent to the guard app, never the resident
  // dashboard. First login -> claim + set PIN; returning with a PIN -> enter it.
  {
    const { data: guard } = await sb
      .from("society_guards")
      .select("id, user_id")
      .eq("phone", phone)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (guard) {
      if (user && guard.user_id) {
        const { data: profile } = await sb
          .from("profiles")
          .select("pin_set")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.pin_set) return { mode: "guardpin" };
      }
      return { mode: "guardclaim" };
    }
  }

  // SECRETARY WHO ABANDONED SETUP: they claimed (membership exists) but never
  // finished the wings/flats step, so their society has no flats. Resume at
  // /setup/structure instead of falling through to setpin -> dashboard. Detected
  // before the PIN routing so an incomplete society is never left half-built.
  // (`chairman` mode re-runs claim_chairman, which is idempotent for an existing
  // secretary and returns needs_setup=true -> /setup/structure.)
  if (
    membership &&
    (membership.role === "secretary" || membership.role === "co_secretary") &&
    membership.society_id
  ) {
    const { count } = await sb
      .from("flats")
      .select("id", { count: "exact", head: true })
      .eq("society_id", membership.society_id);
    if ((count ?? 0) === 0) return { mode: "chairman" };
  }

  // Returning resident with a PIN -> enter it after OTP.
  if (user) {
    const { data: profile } = await sb
      .from("profiles")
      .select("pin_set")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.pin_set) return { mode: "pin" };
    // Onboarded (has a membership) but no PIN -> just set one.
    if (membership) return { mode: "setpin" };
    // Auth user exists but never finished joining -> resume via the code.
    return { mode: "code" };
  }

  // No auth user: a pre-entered family member skips the code; otherwise brand new.
  const { data: fam } = await sb
    .from("family_members")
    .select("id")
    .is("claimed_user_id", null)
    .filter("phone", "ilike", `%${phone}`)
    .maybeSingle();
  return { mode: fam ? "family" : "code" };
}

/**
 * Step 2a — first claim. Validates the society code, then sends the single OTP
 * that proves this person holds the phone.
 *
 * The OTP is what stops a neighbour claiming your flat: the code says which
 * building, the OTP says which person.
 *
 * @returns {Promise<{ok:true, phoneE164:string} | {error:string}>}
 */
export async function startCodeClaim(rawPhone, rawCode) {
  const phone = String(rawPhone ?? "").replace(/\D/g, "");
  const code = String(rawCode ?? "")
    .toUpperCase()
    .replace(/\s/g, "");

  if (!PHONE_RE.test(phone)) return { error: "INVALID_PHONE" };
  if (!CODE_RE.test(code)) return { error: "INVALID_CODE" };

  const normalised = code.includes("-") ? code : `${code.slice(0, 4)}-${code.slice(4)}`;
  const phoneE164 = `+91${phone}`;

  let sb;
  try {
    sb = admin();
  } catch {
    return { error: "SERVER_ERROR" };
  }

  // Live code only — society_codes carries revoked_at so a leaked code can be
  // rotated by the chairman without re-issuing anything else.
  const { data: codeRow, error: codeErr } = await sb
    .from("society_codes")
    .select("code, society_id, revoked_at")
    .eq("code", normalised)
    .maybeSingle();
  if (codeErr) return { error: "SERVER_ERROR" };
  if (!codeRow || codeRow.revoked_at) return { error: "INVALID_CODE" };

  // Already has their own PIN -> the code is not their way in any more.
  const { user, error: findErr } = await findUserByPhone(sb, phoneE164);
  if (findErr) return { error: findErr };
  if (user) {
    const { data: profile } = await sb
      .from("profiles")
      .select("pin_set")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.pin_set) return { error: "PIN_ALREADY_SET" };
  }

  return { ok: true, phoneE164, societyId: codeRow.society_id };
}

/**
 * Step 3 — the resident chooses their PIN after onboarding. From here on the
 * PIN is their only credential and the society code stops working for them.
 */
export async function setPin(userId, phoneE164, pin) {
  if (!userId) return { error: "AUTH_REQUIRED" };
  if (!/^\d{4}$/.test(String(pin ?? ""))) return { error: "INVALID_PIN" };

  let sb;
  try {
    sb = admin();
  } catch {
    return { error: "SERVER_ERROR" };
  }

  // GoTrue refuses passwords under 6 chars, so the PIN is expanded into a
  // deterministic secret. See lib/auth/pinSecret.js — this is a format adapter,
  // NOT added entropy; rate limiting is what protects a 4-digit PIN.
  let secret;
  try {
    secret = derivePinSecret(phoneE164, pin);
  } catch {
    return { error: "INVALID_PIN" };
  }

  const { error } = await sb.auth.admin.updateUserById(userId, { password: secret });
  if (error) return { error: "SERVER_ERROR" };

  // Flag lives in profiles so RLS and the chairman's reset path can both see it.
  const { error: flagErr } = await sb
    .from("profiles")
    .update({ pin_set: true, pin_set_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (flagErr) return { error: "SERVER_ERROR" };

  return { ok: true };
}

/**
 * Step for a family member's FIRST login: after they pass OTP, turn the entry a
 * resident pre-made for them into their own membership in that flat. No society
 * code — the OTP is the proof they hold the number.
 *
 * Runs the RPC as the signed-in family member (their access token), so
 * claim_family_membership sees the right auth.uid(). Returns the society_id so
 * the caller can go on to set a PIN.
 *
 * @param {string} accessToken the family member's session access token
 * @returns {Promise<{ok:true, societyId:string} | {error:string}>}
 */
export async function claimFamilyMember(accessToken) {
  if (!accessToken) return { error: "AUTH_REQUIRED" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: "SERVER_ERROR" };

  // A client bound to THE USER'S token, not the service role — the RPC keys off
  // auth.uid(), which must be the family member, never the server identity.
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await asUser.rpc("claim_family_membership");
  if (error) {
    return {
      error: error.message.includes("NOT_A_FAMILY_MEMBER") ? "NOT_A_FAMILY_MEMBER" : "SERVER_ERROR",
    };
  }
  return { ok: true, societyId: data?.society_id ?? null };
}

/**
 * A chairman's FIRST login: after OTP, turn their secretary_phone match into a
 * secretary membership so they can set the society up. The OTP proved the number.
 *
 * @param {string} accessToken the chairman's session access token
 * @returns {Promise<{ok:true, societyId:string, needsSetup:boolean} | {error:string}>}
 */
export async function claimChairman(accessToken) {
  if (!accessToken) return { error: "AUTH_REQUIRED" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: "SERVER_ERROR" };

  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await asUser.rpc("claim_chairman");
  if (error) {
    return { error: error.message.includes("NOT_A_CHAIRMAN") ? "NOT_A_CHAIRMAN" : "SERVER_ERROR" };
  }
  return { ok: true, societyId: data?.society_id ?? null, needsSetup: Boolean(data?.needs_setup) };
}

/**
 * Guard's first login: link their auth user to the pre-created society_guards row
 * (matched on phone) so the Auth Hook can inject their guard_society_id claim.
 * Mirrors claimChairman — runs as the just-authenticated user via their token.
 */
export async function claimGuard(accessToken) {
  if (!accessToken) return { error: "AUTH_REQUIRED" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: "SERVER_ERROR" };

  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await asUser.rpc("claim_guard");
  if (error) {
    return { error: error.message.includes("NOT_A_GUARD") ? "NOT_A_GUARD" : "SERVER_ERROR" };
  }
  return { ok: true, societyId: data?.society_id ?? null };
}
