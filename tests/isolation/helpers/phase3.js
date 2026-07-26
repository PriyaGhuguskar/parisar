// Phase 3 isolation test helpers
// Shared by: society-setup.test.js, member-onboarding.test.js,
//            code-rate-limit.test.js, bootstrap-structure.test.js, list-structure.test.js
//
// JavaScript only — no TypeScript, no import type.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Phase 3 isolation tests require SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY env vars",
  );
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };

/** Create an unauthenticated Supabase client (anon key). */
export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Create a service-role Supabase client (full DB access, bypasses RLS). */
export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Sign in with a test phone number using the [auth.sms.test_otp] shortcut (OTP = 123456).
 * Deletes and recreates the auth user before signing in so that each test gets a clean user
 * (avoids "For security purposes, you can only request this after 59 seconds" OTP rate-limit
 * and "Database error saving new user" from stale auth.users rows).
 * Upserts a profile row so downstream RPCs can read profiles.phone.
 *
 * @param {string} phone - E.164 format e.g. '+919000000001' or '9000000001'
 * @param {'secretary'|'member'} intent
 * @returns {{ userId: string, accessToken: string, client: import('@supabase/supabase-js').SupabaseClient }}
 */
export async function signInTestPhone(phone, intent = "secretary") {
  const e164 = phone.startsWith("+") ? phone : `+91${phone}`;
  const tenDigit = e164.replace(/^\+91/, "");
  const admin = adminClient();

  // Delete any existing auth user with this phone AND any orphaned profile row with this phone.
  // This ensures OTP rate-limit errors and profiles_phone_key unique-constraint conflicts
  // don't fire between tests. Cross-tenant-isolation.test.js creates email-based users that
  // get profiles with the same test phone numbers — those must be cleared here too.
  try {
    // Remove stale profile rows with this phone first (covers email-based users from other test files)
    await admin.from("profiles").delete().eq("phone", e164);

    // Then delete any auth user that has this phone
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users) {
      const uPhone = u.phone?.startsWith("+") ? u.phone : `+${u.phone ?? ""}`;
      if (uPhone === e164) {
        await admin.auth.admin.deleteUser(u.id);
        break;
      }
    }
  } catch (_) {
    // Best-effort; proceed to sign in anyway
  }

  const anon = anonClient();
  const { error: otpError } = await anon.auth.signInWithOtp({ phone: e164 });
  if (otpError) throw new Error(`signInWithOtp failed (${e164}): ${otpError.message}`);

  const { data, error: verifyError } = await anon.auth.verifyOtp({
    phone: e164,
    token: "123456",
    type: "sms",
  });
  if (verifyError) throw new Error(`verifyOtp failed (${e164}): ${verifyError.message}`);
  if (!data?.session) throw new Error(`No session returned for ${e164}`);

  // Upsert profile so RPC phone-matching works.
  // Store the e164 phone so profiles.phone can be matched via LIKE '%9000000002'.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      user_id: data.user.id,
      phone: e164,
      full_name: `Test ${tenDigit.slice(-4)}`,
      signup_intent: intent,
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw new Error(`Profile upsert failed (${e164}): ${profileError.message}`);

  // Build an authenticated client using the access token directly.
  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });

  return {
    userId: data.user.id,
    accessToken: data.session.access_token,
    client: authed,
    session: data.session,
  };
}

/**
 * Refresh the session for a signed-in user and return a new authenticated client with the
 * fresh access token (which now carries society_id + role injected by inject_society_claims).
 *
 * @param {string} refreshToken
 * @returns {{ accessToken: string, client: import('@supabase/supabase-js').SupabaseClient }}
 */
export async function refreshSession(refreshToken) {
  const anon = anonClient();
  const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw new Error(`refreshSession failed: ${error.message}`);
  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  return { accessToken: data.session.access_token, client: authed, session: data.session };
}

// Seeded Phase 1 UUIDs — must never be deleted by resetTestState.
// cross-tenant-isolation.test.js relies on these rows existing.
const SEEDED_SOCIETY_A = "00000000-0000-0000-0000-00000000000a";
const SEEDED_SOCIETY_B = "00000000-0000-0000-0000-00000000000b";
const SEEDED_WING_A    = "00000000-0000-0000-0000-00000000a001";
const SEEDED_WING_B    = "00000000-0000-0000-0000-00000000b001";
const SEEDED_FLAT_A101 = "00000000-0000-0000-0000-00000000a101";
const SEEDED_FLAT_A102 = "00000000-0000-0000-0000-00000000a102";
const SEEDED_FLAT_B101 = "00000000-0000-0000-0000-00000000b101";
const SEEDED_FLAT_B102 = "00000000-0000-0000-0000-00000000b102";
const SEEDED_CODE_A    = "TEST-A001";
const SEEDED_CODE_B    = "TEST-B001";

/**
 * Delete all Phase 3 test state between test cases.
 * Order respects FK constraints.
 * Preserves Phase 1 seeded rows (Society A/B, their wings, flats, and codes)
 * so that cross-tenant-isolation.test.js beforeAll does not break.
 */
export async function resetTestState() {
  const admin = adminClient();

  // Delete audit_log and code_redemptions (only writable by service-role since revoked from clients)
  await admin.from("audit_log").delete().neq("id", 0);
  await admin.from("code_redemptions").delete().neq("id", 0);
  await admin.from("family_members").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  // Delete society_memberships for non-seeded societies only
  await admin
    .from("society_memberships")
    .delete()
    .not("society_id", "in", `("${SEEDED_SOCIETY_A}","${SEEDED_SOCIETY_B}")`);
  await admin.from("amenities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  // Delete flats NOT in seeded set
  await admin
    .from("flats")
    .delete()
    .not(
      "id",
      "in",
      `("${SEEDED_FLAT_A101}","${SEEDED_FLAT_A102}","${SEEDED_FLAT_B101}","${SEEDED_FLAT_B102}")`,
    );
  // Delete wings NOT in seeded set
  await admin
    .from("wings")
    .delete()
    .not("id", "in", `("${SEEDED_WING_A}","${SEEDED_WING_B}")`);
  // Delete society_codes NOT in seeded set
  await admin
    .from("society_codes")
    .delete()
    .not("code", "in", `("${SEEDED_CODE_A}","${SEEDED_CODE_B}")`);
  // Delete societies NOT in seeded set
  await admin
    .from("societies")
    .delete()
    .not("id", "in", `("${SEEDED_SOCIETY_A}","${SEEDED_SOCIETY_B}")`);
}

/**
 * Delete auth.users for all 4 test phones (cascade deletes profiles).
 * Call in afterAll to keep auth clean between test runs.
 */
export async function cleanupTestUsers() {
  const admin = adminClient();
  const testPhones = [
    "+919000000001",
    "+919000000002",
    "+919000000003",
    "+919000000004",
  ];
  try {
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users) {
      const phone = u.phone?.startsWith("+") ? u.phone : `+${u.phone}`;
      if (testPhones.includes(phone)) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }
  } catch (err) {
    console.warn("[phase3] cleanupTestUsers warning:", err.message);
  }
}
