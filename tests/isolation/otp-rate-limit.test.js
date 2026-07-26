// OTP Rate-Limit Isolation Test (AUTH-06)
//
// What it proves:
//   - The otp_requests table correctly tracks per-phone OTP requests.
//   - A phone with >= 5 requests in the last hour would be blocked by the Edge Function.
//   - A phone with < 5 requests in the last hour is allowed.
//   - Requests older than 1 hour are NOT counted (rolling window).
//
// This test operates directly on the otp_requests table via the service-role client.
// It does NOT call the Edge Function itself — it tests the DB logic the function uses.
//
// JavaScript only — no TypeScript, no import type.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const TEST_PHONE = "+915550000001"; // NOT in [auth.sms.test_otp] — no auth flows here

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "otp-rate-limit test requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars",
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Count otp_requests for TEST_PHONE within the last hour — mirrors the Edge Function query.
 * @returns {Promise<number>}
 */
async function countRecentRequests() {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("otp_requests")
    .select("*", { count: "exact", head: true })
    .eq("phone", TEST_PHONE)
    .gte("requested_at", since);
  if (error) throw new Error(`countRecentRequests failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Delete all otp_requests rows for TEST_PHONE.
 */
async function cleanupTestPhone() {
  const { error } = await admin.from("otp_requests").delete().eq("phone", TEST_PHONE);
  if (error) throw new Error(`cleanup failed: ${error.message}`);
}

beforeAll(async () => {
  await cleanupTestPhone();
});

afterAll(async () => {
  await cleanupTestPhone();
});

describe("otp_requests rate-limit ledger (AUTH-06)", () => {
  it("Test 1: 5 requests within the last hour → count >= 5 (limit reached)", async () => {
    await cleanupTestPhone();

    // Insert 5 rows with default requested_at = now()
    const rows = Array.from({ length: 5 }, () => ({ phone: TEST_PHONE }));
    const { error } = await admin.from("otp_requests").insert(rows);
    expect(error).toBeNull();

    const count = await countRecentRequests();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("Test 2: 4 requests within the last hour → count < 5 (request allowed)", async () => {
    await cleanupTestPhone();

    // Insert only 4 rows
    const rows = Array.from({ length: 4 }, () => ({ phone: TEST_PHONE }));
    const { error } = await admin.from("otp_requests").insert(rows);
    expect(error).toBeNull();

    const count = await countRecentRequests();
    expect(count).toBeLessThan(5);
  });

  it("Test 3: a request older than 1 hour is NOT counted (rolling window)", async () => {
    await cleanupTestPhone();

    // Insert 1 row explicitly set to 2 hours ago — outside the rolling window
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { error } = await admin
      .from("otp_requests")
      .insert({ phone: TEST_PHONE, requested_at: twoHoursAgo });
    expect(error).toBeNull();

    // The windowed count should be 0 — the old row is outside the 1-hour window
    const count = await countRecentRequests();
    expect(count).toBe(0);
  });
});
