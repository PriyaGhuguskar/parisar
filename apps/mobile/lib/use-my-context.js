// apps/mobile/lib/use-my-context.js
// Who the signed-in user is in their society: society name, their name, flat
// label and membership role — read from the database like the website does
// (society_memberships + profiles). The access token only carries society_id
// and role, never the names, so screens must not read names from app_metadata.
//
// Cached per user for the app session; `refreshMyContext()` reloads it (after
// a profile edit, onboarding, …).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useEffect, useState } from "react";
import { create } from "zustand";
import { useAuthStore } from "./auth-store";
import { getSupabase } from "./supabase";

export const AUTHORITY_ROLES = new Set(["secretary", "co_secretary"]);
export const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

const useStore = create((set) => ({
  userId: null,
  ctx: null,
  set: (userId, ctx) => set({ userId, ctx }),
}));

function flatLabelOf(flat) {
  if (!flat) return "";
  const wing = flat.wings?.name;
  return wing && wing !== "Main" ? `${wing}-${flat.number}` : String(flat.number ?? "");
}

async function load(userId, tokenSocietyId) {
  const supabase = getSupabase();
  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from("society_memberships")
      .select(
        "id, society_id, role, flat_id, status, societies:society_id(name), flats:flat_id(number, wings:wing_id(name))",
      )
      .eq("user_id", userId)
      .in("status", ["active", "pending_review"]),
    supabase.from("profiles").select("full_name, phone").eq("user_id", userId).maybeSingle(),
  ]);
  const list = rows ?? [];
  // The society in the token is the one RLS uses; prefer it, then a row with a flat.
  const m =
    list.find((r) => r.society_id === tokenSocietyId && r.flat_id) ??
    list.find((r) => r.society_id === tokenSocietyId) ??
    list.find((r) => r.flat_id) ??
    list[0] ??
    null;
  return {
    membershipId: m?.id ?? null,
    societyId: m?.society_id ?? tokenSocietyId ?? null,
    societyName: m?.societies?.name ?? "",
    role: m?.role ?? "member",
    flatId: m?.flat_id ?? null,
    flatLabel: flatLabelOf(m?.flats),
    fullName: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
    memberships: list.map((r) => ({
      society_id: r.society_id,
      society_name: r.societies?.name ?? "",
    })),
  };
}

/** Reload the cached context (e.g. after editing the profile). */
export async function refreshMyContext() {
  const session = useAuthStore.getState().session;
  const userId = session?.user?.id;
  if (!userId) return;
  const ctx = await load(userId, session.user.app_metadata?.society_id);
  useStore.getState().set(userId, ctx);
}

/**
 * @returns {{ ready: boolean, societyId, societyName, role, flatId, flatLabel,
 *   fullName, phone, membershipId, memberships, isAuthority, isBoard }}
 */
export function useMyContext() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const tokenSociety = session?.user?.app_metadata?.society_id ?? null;
  const cached = useStore((s) => (s.userId === userId ? s.ctx : null));
  const [, force] = useState(0);

  useEffect(() => {
    if (!userId || cached) return undefined;
    let alive = true;
    load(userId, tokenSociety)
      .then((ctx) => {
        if (!alive) return;
        useStore.getState().set(userId, ctx);
        force((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, tokenSociety, cached]);

  const ctx = cached ?? {};
  return {
    ready: Boolean(cached),
    ...ctx,
    role: ctx.role ?? session?.user?.app_metadata?.role ?? "member",
    societyId: ctx.societyId ?? tokenSociety,
    isAuthority: AUTHORITY_ROLES.has(ctx.role),
    isBoard: BOARD_ROLES.has(ctx.role),
  };
}
