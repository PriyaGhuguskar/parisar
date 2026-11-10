// Isolation helpers for the society onboarding suites.
//
// Unlike signInTestPhone, these never touch an existing account: the local DB holds
// real test data on the fixed test numbers, so every user here is created on a
// random number and removed afterwards. Phone + password sign-in still goes through
// GoTrue and the Auth Hook, so the JWT is the real one.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminClient, SUPABASE_ANON_KEY, SUPABASE_URL } from "./phase3.js";

export { adminClient, anonClient } from "./phase3.js";

/** A random, valid Indian mobile that is not on the fixed test list. */
export function randomPhone() {
  const digits = Array.from(randomBytes(8), (b) => b % 10).join("");
  return `96${digits}`;
}

function clientFor(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Track what a suite creates, so afterAll can remove exactly that. */
export function createFixture() {
  const userIds = [];
  const societyIds = [];
  const requestIds = [];
  const objects = [];

  return {
    userIds,
    societyIds,
    requestIds,
    objects,

    /** Create and sign in a user on a fresh number. */
    async user(phone = randomPhone(), { name = `Test ${phone.slice(-4)}`, profile = true } = {}) {
      const admin = adminClient();
      const password = `Pw-${randomBytes(12).toString("hex")}`;
      const { data, error } = await admin.auth.admin.createUser({
        phone: `+91${phone}`,
        password,
        phone_confirm: true,
      });
      if (error) throw new Error(`createUser ${phone}: ${error.message}`);
      userIds.push(data.user.id);

      if (profile) {
        const { error: pErr } = await admin
          .from("profiles")
          .upsert({ user_id: data.user.id, phone: `+91${phone}`, full_name: name });
        if (pErr) throw new Error(`profile ${phone}: ${pErr.message}`);
      }

      const signIn = async () => {
        const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const res = await anon.auth.signInWithPassword({ phone: `+91${phone}`, password });
        if (res.error) throw new Error(`signIn ${phone}: ${res.error.message}`);
        return res.data.session;
      };

      const session = await signIn();
      const user = { id: data.user.id, phone, name, client: clientFor(session.access_token) };
      /** Sign in again so the Auth Hook re-issues society and role claims. */
      user.refresh = async () => {
        const next = await signIn();
        user.client = clientFor(next.access_token);
        return user;
      };
      user.rpc = (fn, args) => user.client.rpc(fn, args);
      return user;
    },

    /** Make a user platform staff. */
    async staff(role = "admin") {
      const u = await this.user();
      const { error } = await adminClient()
        .from("platform_admins")
        .upsert({ user_id: u.id, role, note: "onboarding isolation test" });
      if (error) throw error;
      return u;
    },

    /**
     * A society with one wing, floor and flat set, run by a claimed authority.
     * Returns ids plus the authority user with a refreshed JWT.
     */
    async society(staff, { flats = ["101", "102", "103", "104"], complete = true } = {}) {
      const authority = await this.user();
      const { data, error } = await staff.rpc("admin_register_society", {
        p_name: `Isolation ${randomBytes(3).toString("hex")}`,
        p_address_line: "1 Test Road",
        p_city: "Pune",
        p_state: "Maharashtra",
        p_pincode: "411001",
        p_authorities: [{ name: authority.name, phone: authority.phone }],
      });
      if (error) throw new Error(`register: ${error.message}`);
      societyIds.push(data.society_id);

      const claim = await authority.rpc("claim_authority_for_society", {
        p_society_id: data.society_id,
      });
      if (claim.error) throw new Error(`claim: ${claim.error.message}`);
      await authority.refresh();

      const wing = await authority.rpc("setup_upsert_wing", {
        p_society_id: data.society_id,
        p_name: "A",
        p_code: "A",
      });
      if (wing.error) throw new Error(`wing: ${wing.error.message}`);
      const floor = await authority.rpc("setup_upsert_floor", {
        p_society_id: data.society_id,
        p_wing_id: wing.data.id,
        p_number: 1,
        p_name: "First",
      });
      if (floor.error) throw new Error(`floor: ${floor.error.message}`);
      const made = await authority.rpc("setup_bulk_create_flats", {
        p_society_id: data.society_id,
        p_floor_id: floor.data.id,
        p_flats: flats.map((number) => ({ number })),
      });
      if (made.error) throw new Error(`flats: ${made.error.message}`);
      if (complete) {
        const done = await authority.rpc("setup_complete", { p_society_id: data.society_id });
        if (done.error) throw new Error(`complete: ${done.error.message}`);
      }

      const flatIds = Object.fromEntries(made.data.flats.map((f) => [f.number, f.id]));
      return {
        id: data.society_id,
        code: data.code,
        authority,
        wingId: wing.data.id,
        floorId: floor.data.id,
        flats: flatIds,
      };
    },

    /** Put a user on a flat directly, as an existing resident of that society. */
    async seat(society, user, flatNumber, residentType = "owner") {
      const { data, error } = await adminClient()
        .from("society_memberships")
        .insert({
          society_id: society.id,
          user_id: user.id,
          flat_id: society.flats[flatNumber],
          role: "member",
          residency: residentType === "tenant" ? "tenant" : "owner",
          household: "family",
          resident_type: residentType,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(`seat: ${error.message}`);
      await user.refresh();
      return data.id;
    },

    async cleanup() {
      const admin = adminClient();
      if (objects.length > 0) await admin.storage.from("parisar-proofs").remove(objects);
      if (requestIds.length > 0) {
        await admin.from("audit_log").delete().in("target_id", requestIds);
        await admin.from("society_enrollment_requests").delete().in("id", requestIds);
      }
      for (const id of societyIds) {
        await admin.from("audit_log").delete().eq("society_id", id);
        // Rows that block a society's cascade through flats.
        await admin.from("resident_records").delete().eq("society_id", id);
        await admin.from("flat_actions").delete().eq("society_id", id);
        await admin.from("complaint_responses").delete().eq("society_id", id);
        await admin.from("complaints").delete().eq("society_id", id);
        await admin.from("society_memberships").delete().eq("society_id", id);
        const { error } = await admin.from("societies").delete().eq("id", id);
        if (error) console.warn(`[onboarding] society cleanup ${id}: ${error.message}`);
      }
      for (const id of userIds) {
        await admin.from("platform_admins").delete().eq("user_id", id);
        await admin.from("profiles").delete().eq("user_id", id);
        await admin.auth.admin.deleteUser(id).catch(() => {});
      }
    },
  };
}

/** The UPPER_CASE code out of a Postgres error or a returned {error}. */
export function codeOf(res) {
  if (res?.error?.message)
    return String(res.error.message).match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? res.error.message;
  return res?.data?.error ?? null;
}

/** Row count for a table, read with the service role. */
export async function countRows(table, filters) {
  let q = adminClient().from(table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw error;
  return count;
}

/** Clear rate-limit counters left by earlier runs of these suites. */
export async function clearRateBuckets(buckets) {
  await adminClient().from("edge_rate_events").delete().in("bucket", buckets);
}
