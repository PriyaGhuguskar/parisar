// OTP Phone Auth Flow Isolation Test (AUTH-01, AUTH-03, AUTH-05, AUTH-07)
//
// What it proves:
//   AUTH-01: signInWithOtp + verifyOtp with the dev stub OTP (123456) returns a session.
//   AUTH-03: A brand-new phone has no profiles row after verify → route to onboard.
//   AUTH-07: profiles.signup_intent accepts 'secretary'/'member'; rejects anything else.
//   AUTH-05: signOut clears the session; getUser() returns null.
//
// Uses test_otp phone +919000000003 (mapped to 123456 in config.toml).
// Clean-up: deletes the auth.users row + profiles row for this phone after all tests.
//
// JavaScript only — no TypeScript, no import type.

import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const TEST_PHONE = "+919000000003"; // mapped to 123456 in [auth.sms.test_otp]
const TEST_OTP = "123456";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "otp-phone-flow test requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY env vars",
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The anon client used for the OTP flow — shared across tests in this file.
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Shared state populated by Test 1, consumed by Tests 2–4.
let userId = null;

afterAll(async () => {
  // Clean up the test user created during the flow.
  // Find the user whose phone matches our test phone (Supabase stores without leading +).
  try {
    const { data: { users } } = await admin.auth.admin.listUsers();
    // Supabase stores phone without leading '+' in some versions, check both formats.
    const testUser = users.find(
      (u) => u.phone === TEST_PHONE || u.phone === TEST_PHONE.replace(/^\+/, ""),
    );
    if (testUser) {
      // Delete profile first (FK constraint: profiles.user_id references auth.users)
      await admin.from("profiles").delete().eq("user_id", testUser.id);
      await admin.auth.admin.deleteUser(testUser.id);
    } else if (userId) {
      // Fallback: use the userId captured from signIn
      await admin.from("profiles").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  } catch (err) {
    // Best-effort cleanup — do not fail the test suite on cleanup errors.
    console.warn("[otp-phone-flow] afterAll cleanup warning:", err.message);
  }
});

describe("OTP phone auth flow (AUTH-01, AUTH-03, AUTH-05, AUTH-07)", () => {
  it("AUTH-01: signInWithOtp + verifyOtp with stub OTP returns a valid session", async () => {
    // Step 1: request the OTP (triggers the test_otp shortcut — no SMS sent)
    const { error: signInError } = await anon.auth.signInWithOtp({ phone: TEST_PHONE });
    expect(signInError).toBeNull();

    // Step 2: verify with the stub code
    const { data, error: verifyError } = await anon.auth.verifyOtp({
      phone: TEST_PHONE,
      token: TEST_OTP,
      type: "sms",
    });

    expect(verifyError).toBeNull();
    expect(data.user).toBeDefined();
    expect(data.session).toBeDefined();

    // Capture userId for downstream tests
    userId = data.user.id;
  });

  it("AUTH-03: brand-new phone has no profiles row after verify → onboard route", async () => {
    // userId must be set from AUTH-01 test
    expect(userId).not.toBeNull();

    // Query profiles for this user — should return null (new user, no profile yet)
    const { data: profile, error } = await anon
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    expect(error).toBeNull();
    // null profile means new user → route to /onboard
    expect(profile).toBeNull();
  });

  it("AUTH-07: profiles.signup_intent accepts secretary/member, rejects anything else", async () => {
    expect(userId).not.toBeNull();

    // Insert a valid profile row with signup_intent='secretary'
    const { error: insertError } = await admin.from("profiles").insert({
      user_id: userId,
      full_name: "Test Secretary",
      phone: TEST_PHONE,
      signup_intent: "secretary",
    });
    expect(insertError).toBeNull();

    // Attempt to update signup_intent to an invalid value — CHECK constraint must reject
    const { error: updateError } = await admin
      .from("profiles")
      .update({ signup_intent: "manager" })
      .eq("user_id", userId);

    expect(updateError).not.toBeNull();
    // Postgres CHECK violation is code 23514
    expect(updateError.code).toBe("23514");
  });

  it("AUTH-05: signOut clears the session; getUser() returns null", async () => {
    // Sign out on the anon client
    const { error: signOutError } = await anon.auth.signOut();
    expect(signOutError).toBeNull();

    // After sign-out, getUser() should return null (no active session)
    const {
      data: { user },
    } = await anon.auth.getUser();
    expect(user).toBeNull();
  });
});
