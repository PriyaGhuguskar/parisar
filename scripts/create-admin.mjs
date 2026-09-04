#!/usr/bin/env node
// Create a Parisar platform-staff login.
//
// WHY THIS SCRIPT EXISTS: platform_admins is service-role-only by design — an
// admin cannot appoint another admin, so the FIRST one can never be made from
// inside the product. That is a deliberate anti-privilege-escalation choice
// (see supabase/migrations/20260721000016_platform_admin.sql), but it also
// means a fresh database has no way in at all. This is that way in.
//
// It cannot be SQL: auth.users rows must be created through the Auth admin API,
// not INSERT (supabase/seed.sql says the same about its own fixtures). So this
// runs the two steps in order — create the auth user, then grant staff — and is
// idempotent, so re-running it after `supabase db reset` just works.
//
// USAGE (once `supabase start` is up):
//   node scripts/create-admin.mjs                    -> 9000000001, role admin
//   node scripts/create-admin.mjs 9876543210         -> that number, role admin
//   node scripts/create-admin.mjs 9876543210 sales   -> sales role
//
// DEV ONLY. In production a staff account is created deliberately, out of band.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Read NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY out of .env.local. */
function loadEnv() {
  const out = { ...process.env };
  const envPath = resolve(ROOT, "apps/web/.env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#")) out[m[1]] ??= m[2];
    }
  }
  return out;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const phone = (process.argv[2] || "9000000001").replace(/\D/g, "").slice(-10);
const role = process.argv[3] === "sales" ? "sales" : "admin";

if (!/^[6-9]\d{9}$/.test(phone)) {
  console.error(`✗ "${phone}" is not a valid Indian mobile number (10 digits, starts 6-9).`);
  process.exit(1);
}
if (!KEY) {
  console.error("✗ SUPABASE_SERVICE_ROLE_KEY missing. Run `supabase status` and put it in apps/web/.env.local");
  process.exit(1);
}

const e164 = `+91${phone}`;
const bare = `91${phone}`;
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 1. Reachable?
try {
  const r = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } });
  if (!r.ok) throw new Error(`health ${r.status}`);
} catch (e) {
  console.error(`✗ Cannot reach Supabase at ${URL} — is \`supabase start\` running?\n  (${e.message})`);
  process.exit(1);
}

// 2. Find or create the auth user. phone_confirm skips the OTP round-trip that
//    would otherwise be needed just to bring the row into existence.
let user = null;
{
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  user = (data?.users ?? []).find((u) => u.phone === bare) ?? null;
}
if (!user) {
  const { data, error } = await sb.auth.admin.createUser({ phone: e164, phone_confirm: true });
  if (error) {
    console.error(`✗ Could not create the auth user: ${error.message}`);
    process.exit(1);
  }
  user = data.user;
  console.log(`  created auth user  ${e164}`);
} else {
  console.log(`  auth user already exists  ${e164}`);
}

// 3. A profile row keeps the app's own lookups happy. Staff have no membership,
//    so they never get a society_id claim — which is exactly right: an admin is
//    orthogonal to any one society.
const { error: pErr } = await sb
  .from("profiles")
  .upsert({ user_id: user.id, full_name: "Parisar Staff", phone: e164 }, { onConflict: "user_id" });
if (pErr) console.warn(`  ! profile upsert: ${pErr.message}`);

// 4. Grant staff.
const { error: aErr } = await sb
  .from("platform_admins")
  .upsert({ user_id: user.id, role, note: "created by scripts/create-admin.mjs" }, { onConflict: "user_id" });
if (aErr) {
  console.error(`✗ Could not grant staff: ${aErr.message}`);
  process.exit(1);
}

const whitelisted = Number(phone.slice(-2)) <= 30 && phone.startsWith("90000000");
console.log(`
✓ Platform ${role} ready.

    URL       http://localhost:3000/login
    Phone     ${phone}
    OTP       ${whitelisted ? "123456" : "shown on the login screen (dev hook captures it)"}

  Sign in and you land on /admin. There is no password — staff use OTP only.
`);
