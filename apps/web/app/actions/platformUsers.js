"use server";

// Appointing and listing platform users, from the admin console.
//
// WHY A SERVER ACTION AND NOT JUST AN RPC. A row in auth.users cannot be created
// from SQL — it has to go through the Auth admin API, which needs the service
// role key. So appointing runs in two halves: the service-role client mints (or
// finds) the auth user, then the caller's OWN cookie-bound session calls
// admin_create_platform_user, whose is_platform_admin() gate is what actually
// authorises the appointment.
//
// THE ORDER OF THE CHECKS IS THE SECURITY PROPERTY. The admin check happens
// FIRST, before the service-role client is ever constructed. Reversed, this
// would be an unauthenticated auth-user factory: anyone who could POST to it
// could mint arbitrary auth.users rows, and the RPC failing afterwards would not
// undo them. The database gate alone is not enough, because the damage would
// already have happened before the database was consulted.
//
// The service-role key never reaches the browser: this file is "use server" and
// returns only small status objects.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PHONE_RE = /^[6-9]\d{9}$/;
const ROLES = new Set(["staff", "sales"]);

function serviceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SERVER_MISCONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Map a Postgres error message onto the coded errors the RPCs raise. */
function codeFrom(error) {
  const known = [
    "NOT_PLATFORM_ADMIN",
    "CANNOT_CREATE_ADMIN",
    "CANNOT_MODIFY_ADMIN",
    "USER_NOT_FOUND",
    "INVALID_ROLE",
    "INVALID_USER",
    "NOT_FOUND",
  ];
  return known.find((c) => error?.message?.includes(c)) ?? "SERVER_ERROR";
}

/**
 * Appoint a staff or sales user by phone number.
 *
 * @param {{phone: string, name?: string, role: "staff"|"sales"}} input
 * @returns {Promise<{ok: true, role: string} | {error: string}>}
 */
export async function createPlatformUser({ phone: rawPhone, name, role }) {
  const phone = String(rawPhone ?? "")
    .replace(/\D/g, "")
    .slice(-10);
  if (!PHONE_RE.test(phone)) return { error: "INVALID_PHONE" };

  // 'admin' is rejected here as well as in the RPC. Belt and braces: this is the
  // one value that must never get through.
  if (!ROLES.has(role)) return { error: "INVALID_ROLE" };

  // ---- Gate FIRST. Nothing below runs for a non-admin. --------------------
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return { error: "NOT_PLATFORM_ADMIN" };

  // ---- Only now is it safe to hold the service role. ----------------------
  let sb;
  try {
    sb = serviceRole();
  } catch {
    return { error: "SERVER_ERROR" };
  }

  const e164 = `+91${phone}`;

  // Reuse an existing account if this number already has one — a resident being
  // hired should keep their identity rather than hit a duplicate-phone failure.
  const { data: listed, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) return { error: "SERVER_ERROR" };

  let targetId = (listed?.users ?? []).find((u) => u.phone === `91${phone}`)?.id ?? null;

  if (!targetId) {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      phone: e164,
      phone_confirm: true,
    });
    if (createErr || !created?.user) return { error: "SERVER_ERROR" };
    targetId = created.user.id;
  }

  const trimmed = String(name ?? "").trim();
  if (trimmed) {
    // Best-effort: a missing display name must not fail an appointment.
    await sb
      .from("profiles")
      .upsert({ user_id: targetId, full_name: trimmed, phone: e164 }, { onConflict: "user_id" });
  }

  // ---- The appointment itself, as the ADMIN, not as the service role. -----
  // Using the caller's session keeps is_platform_admin() meaningful and makes
  // audit_log.actor_id the real person rather than a shared key.
  const { error: rpcErr } = await supabase.rpc("admin_create_platform_user", {
    p_user_id: targetId,
    p_role: role,
    p_note: trimmed || null,
  });
  if (rpcErr) return { error: codeFrom(rpcErr) };

  return { ok: true, role };
}

/**
 * Approve a salesperson application: appoint them, then mark the row handled so
 * it leaves the queue and the partial unique index frees the number up again.
 *
 * @returns {Promise<{ok: true} | {error: string}>}
 */
export async function approveSalesApplication({ id, phone, name }) {
  const appointed = await createPlatformUser({ phone, name, role: "sales" });
  if (appointed.error) return appointed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("sales_applications")
    .update({ status: "approved", handled_by: (await supabase.auth.getUser()).data.user?.id })
    .eq("id", id);

  // The appointment already succeeded — that is the part that matters. Report a
  // failed status update rather than pretending nothing happened, but do not
  // claim the whole operation failed.
  if (error) return { error: "APPOINTED_BUT_NOT_MARKED" };
  return { ok: true };
}

/**
 * Staff and sales rows only — admin rows are never returned (see …046).
 *
 * @returns {Promise<{users: Array<object>} | {error: string}>}
 */
export async function listPlatformUsers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_platform_users");
  if (error) return { error: codeFrom(error) };
  return { users: data ?? [] };
}

/**
 * Revoke a staff or sales user. The RPC refuses admin rows.
 *
 * @returns {Promise<{ok: true} | {error: string}>}
 */
export async function revokePlatformUser(userId) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_platform_user", { p_user_id: userId });
  if (error) return { error: codeFrom(error) };
  return { ok: true };
}
