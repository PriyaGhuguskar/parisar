// Cross-tenant isolation test (Phase 1 success criterion #2 from ROADMAP.md).
//
// What it proves:
//   1. RLS is enforced on every tenant-scoped table.
//   2. The Custom Access Token Auth Hook injects society_id + role into JWT.
//   3. The hook fires on initial sign-in AND on refresh (per ARCHITECTURE.md Anti-Pattern 7).
//   4. Storage RLS rejects cross-tenant uploads.
//
// How it works (per PITFALLS.md Pitfall 1 — must run as authenticated user via JS SDK):
//   - Uses the admin client (service-role key) to provision two test users (idempotent).
//   - Binds each user to a seeded society membership (Society A or B) via JS-SDK upserts.
//   - Signs in as each user via the public anon-key client (production-equivalent path).
//   - Asserts every cross-tenant SELECT returns zero rows.
//   - Asserts every cross-tenant INSERT returns an RLS error (PostgrestError code 42501).
//   - Decodes JWT app_metadata to verify the Auth Hook ran.
//   - Refreshes the session and re-verifies claims (Anti-Pattern 7).
//
// JavaScript translation notes:
//   - No TypeScript generics on createClient (JS project — JAVASCRIPT_ONLY constraint)
//   - No type annotations, interfaces, or import type statements
//   - File extension: .test.js (not .test.ts)

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

// ---- Constants from supabase/seed.sql (Plan 02) ----
const SOCIETY_A_ID = "00000000-0000-0000-0000-00000000000a";
const SOCIETY_B_ID = "00000000-0000-0000-0000-00000000000b";
const FLAT_A_101_ID = "00000000-0000-0000-0000-00000000a101";
const FLAT_B_101_ID = "00000000-0000-0000-0000-00000000b101";

// B-05 fix: deterministic phone literals (no UUID-slice derivation). Profile upserts
// key on `phone` (the unique column) so re-runs are idempotent.
const ALICE_PHONE = "+919000000001";
const BOB_PHONE = "+919000000002";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "isolation test requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY env vars",
  );
}

const ALICE_EMAIL = "alice-isolation@parisar.test";
const ALICE_PASSWORD = "TestPassword!Alice123";
const BOB_EMAIL = "bob-isolation@parisar.test";
const BOB_PASSWORD = "TestPassword!Bob123";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Shared test user state — populated in beforeAll
let alice;
let bob;

// ---------- Helpers ----------

/**
 * Decode a JWT payload (middle segment) from base64url.
 * @param {string} jwt
 * @returns {Record<string, unknown>}
 */
function decodeJwtPayload(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = parts[1];
  const decoded = Buffer.from(payload, "base64url").toString("utf-8");
  return JSON.parse(decoded);
}

/**
 * Idempotent: find existing user by email or create a new one.
 * Rotates the password to a known value so sign-in works deterministically.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>} userId
 */
async function ensureUser(email, password) {
  const list = await adminClient.auth.admin.listUsers();
  const existing = list.data.users.find((u) => u.email === email);
  if (existing) {
    // Rotate password to known value so we can sign in deterministically.
    await adminClient.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create user ${email}: ${error?.message ?? "unknown"}`);
  }
  return data.user.id;
}

/**
 * Upsert a profile row keyed on `phone` (unique column).
 * B-05 fix: idempotent across re-runs even when userId changes after db reset.
 * @param {string} userId
 * @param {string} fullName
 * @param {string} phone
 */
async function ensureProfile(userId, fullName, phone) {
  const { error } = await adminClient
    .from("profiles")
    .upsert(
      { user_id: userId, full_name: fullName, phone },
      { onConflict: "phone" },
    );
  if (error) {
    throw new Error(`ensureProfile(${phone}): ${error.message}`);
  }
}

/**
 * Upsert a society_memberships row keyed on the composite unique (society_id, user_id, flat_id).
 * @param {string} societyId
 * @param {string} userId
 * @param {string} flatId
 */
async function ensureMembership(societyId, userId, flatId) {
  const { error } = await adminClient.from("society_memberships").upsert(
    {
      society_id: societyId,
      user_id: userId,
      flat_id: flatId,
      role: "member",
      residency: "owner",
      household: "family",
      status: "active",
    },
    { onConflict: "society_id,user_id,flat_id" },
  );
  if (error) {
    throw new Error(`ensureMembership(${societyId}, ${userId}): ${error.message}`);
  }
}

/**
 * Bind Alice to Society A and Bob to Society B.
 * All setup in JavaScript — no separate helper SQL file (B-05 fix from revision).
 * @param {string} aliceUserId
 * @param {string} bobUserId
 */
async function bindMemberships(aliceUserId, bobUserId) {
  await ensureProfile(aliceUserId, "Alice Alpha", ALICE_PHONE);
  await ensureProfile(bobUserId, "Bob Beta", BOB_PHONE);
  await ensureMembership(SOCIETY_A_ID, aliceUserId, FLAT_A_101_ID);
  await ensureMembership(SOCIETY_B_ID, bobUserId, FLAT_B_101_ID);
}

/**
 * Sign in a test user via the anon-key client (production-equivalent path).
 * Uses a fresh client per user — must NOT reuse the admin client.
 * @param {string} email
 * @param {string} password
 * @param {string} societyId
 */
async function signInUser(email, password, societyId) {
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "unknown"}`);
  }
  return {
    userId: data.user.id,
    client: userClient,
    email,
    password,
    societyId,
  };
}

// ---------- Fixture lifecycle ----------

beforeAll(async () => {
  const aliceId = await ensureUser(ALICE_EMAIL, ALICE_PASSWORD);
  const bobId = await ensureUser(BOB_EMAIL, BOB_PASSWORD);
  await bindMemberships(aliceId, bobId);

  alice = await signInUser(ALICE_EMAIL, ALICE_PASSWORD, SOCIETY_A_ID);
  bob = await signInUser(BOB_EMAIL, BOB_PASSWORD, SOCIETY_B_ID);
});

afterAll(async () => {
  // Don't delete the auth users — keep them for re-runs (idempotent).
  // Just sign them out in their respective clients.
  await alice?.client.auth.signOut();
  await bob?.client.auth.signOut();
});

// ---------- The actual tests ----------

describe("Custom Access Token Auth Hook", () => {
  it("injects society_id and role into JWT app_metadata on sign-in (Alice)", async () => {
    const { data } = await alice.client.auth.getSession();
    expect(data.session?.access_token).toBeDefined();
    const claims = decodeJwtPayload(data.session.access_token);
    expect(claims).toHaveProperty("app_metadata");
    const appMeta = claims.app_metadata;
    expect(appMeta.society_id).toBe(SOCIETY_A_ID);
    expect(appMeta.role).toBe("member");
  });

  it("injects society_id and role into JWT app_metadata on sign-in (Bob)", async () => {
    const { data } = await bob.client.auth.getSession();
    const claims = decodeJwtPayload(data.session.access_token);
    const appMeta = claims.app_metadata;
    expect(appMeta.society_id).toBe(SOCIETY_B_ID);
    expect(appMeta.role).toBe("member");
  });

  it("Auth Hook fires on refresh (Anti-Pattern 7) — claims persist after refreshSession", async () => {
    const { data: before } = await alice.client.auth.getSession();
    const tokenBefore = before.session.access_token;

    const { data: after, error } = await alice.client.auth.refreshSession();
    expect(error).toBeNull();
    expect(after.session?.access_token).toBeDefined();
    expect(after.session.access_token).not.toBe(tokenBefore); // genuinely refreshed

    const claims = decodeJwtPayload(after.session.access_token);
    const appMeta = claims.app_metadata;
    expect(appMeta.society_id).toBe(SOCIETY_A_ID);
    expect(appMeta.role).toBe("member");
  });
});

describe("RLS — cross-tenant SELECT returns zero rows", () => {
  // For each tenant-scoped table, Alice (Society A) must see ZERO rows that belong to Society B.
  const TENANT_TABLES = [
    "societies",
    "society_codes",
    "wings",
    "flats",
    "society_memberships",
  ];

  for (const table of TENANT_TABLES) {
    it(`Alice cannot SELECT Society B rows from ${table}`, async () => {
      // We deliberately DO NOT add `.eq('society_id', SOCIETY_B_ID)` —
      // RLS should filter without the client asking.
      const { data, error } = await alice.client.from(table).select("*");
      expect(error).toBeNull();
      expect(data).toBeDefined();
      const allRows = data ?? [];
      // No row may have a society_id matching Society B (or the row id itself, for `societies`).
      const offending = allRows.filter((row) => {
        if (table === "societies") return row.id === SOCIETY_B_ID;
        return row.society_id === SOCIETY_B_ID;
      });
      expect(offending).toHaveLength(0);
    });

    it(`Bob cannot SELECT Society A rows from ${table}`, async () => {
      const { data, error } = await bob.client.from(table).select("*");
      expect(error).toBeNull();
      const allRows = data ?? [];
      const offending = allRows.filter((row) => {
        if (table === "societies") return row.id === SOCIETY_A_ID;
        return row.society_id === SOCIETY_A_ID;
      });
      expect(offending).toHaveLength(0);
    });
  }
});

describe("RLS — cross-tenant INSERT is rejected", () => {
  it("Alice CANNOT insert a flat into Society B (RLS WITH CHECK rejects)", async () => {
    const { data, error } = await alice.client.from("flats").insert({
      society_id: SOCIETY_B_ID,
      wing_id: "00000000-0000-0000-0000-00000000b001",
      number: "999",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // Postgres error code for RLS / permission denied:
    expect(
      error?.code === "42501" || error?.message?.toLowerCase().includes("row-level security"),
    ).toBe(true);
  });

  it("Bob CANNOT insert a wing into Society A", async () => {
    const { data, error } = await bob.client.from("wings").insert({
      society_id: SOCIETY_A_ID,
      name: "ZZ",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(
      error?.code === "42501" || error?.message?.toLowerCase().includes("row-level security"),
    ).toBe(true);
  });
});

describe("Storage RLS — cross-tenant upload is rejected", () => {
  it("Alice CANNOT upload to Society B prefix in parisar-attachments", async () => {
    const path = `${SOCIETY_B_ID}/test-cross-tenant-${Date.now()}.txt`;
    const blob = new Blob(["isolation test"], { type: "text/plain" });
    const { data, error } = await alice.client.storage
      .from("parisar-attachments")
      .upload(path, blob);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("Alice CAN upload to Society A prefix in parisar-attachments", async () => {
    const filePath = `${SOCIETY_A_ID}/isolation-positive-${Date.now()}.txt`;
    const blob = new Blob(["alice's own society"], { type: "text/plain" });
    const { data, error } = await alice.client.storage
      .from("parisar-attachments")
      .upload(filePath, blob);
    expect(error).toBeNull();
    expect(data?.path).toBe(filePath);
    // Cleanup
    await alice.client.storage.from("parisar-attachments").remove([filePath]);
  });
});

describe("Sanity — own-society reads return expected rows", () => {
  it("Alice CAN read Society A from societies", async () => {
    const { data, error } = await alice.client
      .from("societies")
      .select("id, name");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(SOCIETY_A_ID);
    expect(data?.[0]?.name).toBe("Test Society Alpha");
  });

  it("Bob CAN read Society B from societies", async () => {
    const { data, error } = await bob.client
      .from("societies")
      .select("id, name");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(SOCIETY_B_ID);
    expect(data?.[0]?.name).toBe("Test Society Beta");
  });

  it("Alice sees exactly 2 flats in Society A", async () => {
    const { data, error } = await alice.client.from("flats").select("number");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    const numbers = (data ?? []).map((r) => r.number).sort();
    expect(numbers).toEqual(["101", "102"]);
  });
});
