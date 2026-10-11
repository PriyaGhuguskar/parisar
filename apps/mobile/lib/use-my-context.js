// apps/mobile/lib/use-my-context.js
// Who the signed-in user is in their society: society name, their name, flat
// label and membership role — read from the database like the website does.
//
// Source of truth for the ACTIVE society + role is the my_active_society()
// RPC (migration 054 — the same rule the Auth Hook uses: switcher choice, else
// newest active membership). society_memberships supplies the flat and the
// list of societies for the switcher; profiles supplies the name. The access
// token's app_metadata is only a fallback while the RPC is unreachable.
//
// Cached per user for the app session. It is reloaded:
//   - on TOKEN_REFRESHED / SIGNED_IN / USER_UPDATED (role change, society
//     switch, onboarding and claims all end with refreshSession()),
//   - when a screen calls refreshMyContext() (profile edit, society switch, …),
//   - on retry() after a failed load.
// A failed load is NEVER cached (no silent "member" role); the hook reports
// `error` and falls back to the token's claims so gated screens don't spin.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useEffect } from "react";
import { create } from "zustand";
import { useAuthStore } from "./auth-store";
import { getSupabase } from "./supabase";

export const AUTHORITY_ROLES = new Set(["secretary", "co_secretary"]);
export const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

// my_active_society() may say the token is stale; refresh at most this often.
const STALE_REFRESH_MIN_MS = 30_000;

const useStore = create((set) => ({
  userId: null,
  ctx: null,
  error: null,
  set: (userId, ctx) => set({ userId, ctx, error: null }),
  // Keep the last good context for this user (if any) but record the failure.
  fail: (userId, error) => set((s) => ({ userId, ctx: s.userId === userId ? s.ctx : null, error })),
}));

let inflight = null; // { userId, promise }
let lastStaleRefreshAt = 0;
let authListener = null;

function flatLabelOf(flat) {
  if (!flat) return "";
  const wing = flat.wings?.name;
  return wing && wing !== "Main" ? `${wing}-${flat.number}` : String(flat.number ?? "");
}

function currentUserId() {
  return useAuthStore.getState().session?.user?.id ?? null;
}

function pickMembership(list, societyId) {
  return (
    list.find((r) => r.society_id === societyId && r.flat_id) ??
    list.find((r) => r.society_id === societyId) ??
    list.find((r) => r.flat_id) ??
    list[0] ??
    null
  );
}

/** my_active_society(); null when the RPC is unavailable (token fallback). */
async function loadActiveSociety(supabase) {
  const { data, error } = await supabase.rpc("my_active_society");
  if (error) {
    console.warn("[my-context] my_active_society failed:", error.message ?? error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row : null;
}

function refreshIfStale(supabase, active) {
  if (!active?.token_stale) return;
  const now = Date.now();
  if (now - lastStaleRefreshAt < STALE_REFRESH_MIN_MS) return;
  lastStaleRefreshAt = now;
  // TOKEN_REFRESHED then reloads the context with the new claims.
  supabase.auth.refreshSession().catch((err) => {
    console.warn("[my-context] refreshSession failed:", err?.message ?? err);
  });
}

async function load(userId, tokenMeta) {
  const supabase = getSupabase();
  const [active, membershipsRes, profileRes] = await Promise.all([
    loadActiveSociety(supabase),
    supabase
      .from("society_memberships")
      .select(
        "id, society_id, role, flat_id, status, societies:society_id(name), flats:flat_id(number, wings:wing_id(name))",
      )
      .eq("user_id", userId)
      .in("status", ["active", "pending_review"]),
    // Only full_name: phone is not readable by users (privacy — revealed via reveal_phone).
    supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
  ]);
  if (membershipsRes.error) throw membershipsRes.error;
  if (profileRes.error) throw profileRes.error;

  refreshIfStale(supabase, active);

  const list = membershipsRes.data ?? [];
  const societyId = active?.society_id ?? tokenMeta?.society_id ?? null;
  const m = pickMembership(list, societyId);
  const sameSociety = m && (!societyId || m.society_id === societyId);
  return {
    membershipId: sameSociety ? m.id : null,
    societyId: societyId ?? m?.society_id ?? null,
    societyName: active?.society_name ?? (sameSociety ? (m?.societies?.name ?? "") : ""),
    role: active?.role ?? (sameSociety ? m?.role : null) ?? "member",
    serviceStatus: active?.service_status ?? null,
    flatId: sameSociety ? (m?.flat_id ?? null) : null,
    flatLabel: sameSociety ? flatLabelOf(m?.flats) : "",
    fullName: profileRes.data?.full_name ?? "",
    memberships: list.map((r) => ({
      society_id: r.society_id,
      society_name: r.societies?.name ?? "",
    })),
  };
}

/**
 * Load (or reload) the context for `userId`. Concurrent callers share one
 * request; `force` waits for an in-flight load and then loads again, so a
 * refresh after a role change never returns the pre-change answer.
 */
function fetchFor(userId, { force = false } = {}) {
  if (inflight && inflight.userId === userId && !force) return inflight.promise;
  const previous = inflight && inflight.userId === userId ? inflight.promise : null;
  const run = async () => {
    if (previous) await previous.catch(() => {});
    const tokenMeta = useAuthStore.getState().session?.user?.app_metadata ?? {};
    return load(userId, tokenMeta);
  };
  const promise = run()
    .then((ctx) => {
      if (currentUserId() === userId) useStore.getState().set(userId, ctx);
      return ctx;
    })
    .catch((err) => {
      if (currentUserId() === userId) useStore.getState().fail(userId, err);
      throw err;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { userId, promise };
  return promise;
}

/** Reload on the auth events that can change society / role claims. */
function ensureAuthListener() {
  if (authListener) return;
  try {
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        resetMyContext();
        return;
      }
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        const userId = session.user?.id;
        if (!userId) return;
        // Only reload a context someone already loaded (or failed to load);
        // first loads happen in the hook.
        const s = useStore.getState();
        if (s.userId === userId) fetchFor(userId, { force: true }).catch(() => {});
      }
    });
    authListener = data?.subscription ?? null;
  } catch (err) {
    console.warn("[my-context] auth listener failed:", err?.message ?? err);
  }
}

/** Forget the cached context (sign-out). */
export function resetMyContext() {
  inflight = null;
  useStore.getState().set(null, null);
}

/**
 * Reload the cached context (after a profile edit, a society switch, a role
 * change, onboarding, …). Never throws: a failure is reported via the hook's
 * `error`. Resolves to the new context, or null.
 */
export async function refreshMyContext() {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    return await fetchFor(userId, { force: true });
  } catch {
    return null;
  }
}

/**
 * @returns {{ ready: boolean, error: unknown, retry: () => Promise<object|null>,
 *   societyId, societyName, role, flatId, flatLabel, fullName, membershipId,
 *   memberships, serviceStatus, isAuthority, isBoard }}
 *   `ready` is true once the context loaded OR the load failed (then `error`
 *   is set and role/society come from the access token's claims).
 */
export function useMyContext() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const tokenMeta = session?.user?.app_metadata ?? {};
  const cached = useStore((s) => (s.userId === userId ? s.ctx : null));
  const error = useStore((s) => (s.userId === userId ? s.error : null));

  useEffect(() => {
    ensureAuthListener();
  }, []);

  useEffect(() => {
    if (!userId || cached || error) return;
    fetchFor(userId).catch(() => {});
  }, [userId, cached, error]);

  const ctx = cached ?? {};
  const role = ctx.role ?? tokenMeta.role ?? "member";
  return {
    ...ctx,
    ready: Boolean(cached) || Boolean(error),
    error: error ?? null,
    retry: refreshMyContext,
    role,
    societyId: ctx.societyId ?? tokenMeta.society_id ?? null,
    isAuthority: AUTHORITY_ROLES.has(role),
    isBoard: BOARD_ROLES.has(role),
  };
}
