// apps/mobile/lib/route-guard.js
// Which signed-in screens a user may open, by account kind — the in-app twin of
// the splash routing in post-login.js (same facts: my_login_state()).
//
// The database enforces access (RLS + RPC checks); this only keeps people off
// screens that can only fail for them, e.g. a gate guard deep-linking into the
// resident tabs or a resident opening /guard, /staff or /structure.
//
// Deliberately conservative: it only redirects on a definite mismatch and lets
// everything through while the state is unknown or failed to load, so a slow
// network never locks anyone out. A redirect goes to the splash ("/"), which
// re-resolves where the user belongs.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useEffect, useState } from "react";
import { useAuthStore } from "./auth-store";
import { getSupabase } from "./supabase";

export const SPLASH_ROUTE = "/";

/**
 * @param {string|undefined} section the (protected) child segment, e.g.
 *   "(tabs)", "guard", "staff", "structure", "pin", "onboarding", "service"
 * @param {object|null} state my_login_state() result
 * @returns {string|null} a route to redirect to, or null to allow
 */
export function protectedRedirect(section, state) {
  if (!state || typeof state !== "object") return null;
  const isStaff = Boolean(state.staff);
  const isGuard = Boolean(state.guard) && state.guard !== "unclaimed";
  const hasFlat = Boolean(state.membership?.flat_id);

  switch (section) {
    case "(tabs)":
      // Parisar staff and gate guards (without a flat of their own) have their
      // own home; resident tabs would only show empty / failing screens.
      if (isStaff) return SPLASH_ROUTE;
      if (isGuard && !hasFlat) return SPLASH_ROUTE;
      return null;
    case "guard":
      return isGuard ? null : SPLASH_ROUTE;
    case "staff":
      return isStaff ? null : SPLASH_ROUTE;
    case "structure":
      return state.authority ? null : SPLASH_ROUTE;
    default:
      // pin, onboarding, service, … — reachable by anyone signed in.
      return null;
  }
}

// One my_login_state() per signed-in user for the app session.
let cache = { userId: null, state: null, promise: null };

function loadLoginState(userId) {
  if (cache.userId === userId && (cache.state || cache.promise)) {
    return cache.state ? Promise.resolve(cache.state) : cache.promise;
  }
  const promise = getSupabase()
    .rpc("my_login_state")
    .then(({ data, error }) => {
      if (error) throw error;
      if (cache.userId === userId) cache = { userId, state: data ?? null, promise: null };
      return data ?? null;
    })
    .catch((err) => {
      // Fail open (see header) and allow a later retry.
      console.warn("[route-guard] my_login_state failed:", err?.message ?? err);
      if (cache.userId === userId) cache = { userId, state: null, promise: null };
      return null;
    });
  cache = { userId, state: null, promise };
  return promise;
}

/** Forget the cached state (sign-out / account change). */
export function resetRouteGuard() {
  cache = { userId: null, state: null, promise: null };
}

/** @returns {object|null} my_login_state() for the signed-in user, once loaded */
export function useLoginState() {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const [state, setState] = useState(() => (cache.userId === userId ? cache.state : null));

  useEffect(() => {
    if (!userId) {
      resetRouteGuard();
      setState(null);
      return undefined;
    }
    let alive = true;
    loadLoginState(userId).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  return state;
}
