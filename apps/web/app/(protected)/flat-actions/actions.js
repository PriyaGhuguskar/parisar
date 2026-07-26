"use server";

// Server actions for Phase 6 flat-action mutations (web).
//
// Each action creates a cookie-bound @supabase/ssr server client and delegates to
// the shared api-client function. RLS/RPC guards do the real enforcement:
//   - issue_flat_action  → admin-only server-side (secretary/co_secretary)
//   - waive_fine         → admin-only server-side; the client also gates the Waive
//                          affordance on isAdmin (defence in depth, D-04 / T-06-32)
//   - acknowledge_fine   → target-flat member only (server-gated)
//
// Returns plain objects (never Error) so they cross the RSC ↔ client boundary.
// waiveFine's INSUFFICIENT_ROLE is surfaced by the api-client as a typed result,
// so it never throws for that gate — we pass `reason` through.
//
// revalidatePath('/flat-actions') after each mutation so a subsequent SSR
// navigation re-hydrates the list.

import { acknowledgeFine, issueFlatAction, waiveFine } from "@parisar/api-client";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Issue a flat action (Warning / Fine / Notify). Admin-only server-side.
 *
 * The optional fine PDF must be uploaded BEFORE this action (client-side, via
 * uploadFinePdfWeb under {society}/flat_actions/{actionId}/…) so its storage key
 * flows in; pass the same client-generated `actionId` here.
 *
 * @param {{
 *   flatId: string,
 *   kind: 'warning'|'fine'|'notify',
 *   body: string,
 *   amount?: number|null,
 *   dueDate?: string|null,
 *   actionId?: string|null,
 *   storageKey?: string|null,
 *   mimeType?: string|null,
 *   byteSize?: number|null,
 * }} input
 * @returns {Promise<{ ok: boolean, actionId?: string, societyId?: string, error?: string }>}
 */
export async function issueFlatActionAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await issueFlatAction(supabase, {
      flatId: input.flatId,
      kind: input.kind,
      body: input.body,
      amount: input.amount ?? null,
      dueDate: input.dueDate ?? null,
      actionId: input.actionId ?? null,
      storageKey: input.storageKey ?? null,
      mimeType: input.mimeType ?? null,
      byteSize: input.byteSize ?? null,
    });
    revalidatePath("/flat-actions");
    return { ok: true, actionId: result.actionId, societyId: result.societyId };
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (msg.includes("INSUFFICIENT_ROLE")) return { ok: false, error: "not_authorized" };
    return { ok: false, error: "issue_failed" };
  }
}

/**
 * Acknowledge a fine ("I've seen it" — D-04). Target-flat member only (server-gated).
 * Returns the RPC jsonb business outcome straight through.
 *
 * @param {string} actionId
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function acknowledgeFineAction(actionId) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await acknowledgeFine(supabase, actionId);
    // The RPC returns a business outcome without throwing — a false ok
    // (e.g. not_acknowledgeable / not a target-flat resident) must NOT be
    // reported as success or the UI flips the badge on a no-op.
    if (result?.ok === false) {
      return { ok: false, reason: result.reason ?? "not_acknowledgeable" };
    }
    revalidatePath("/flat-actions");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "acknowledge_failed" };
  }
}

/**
 * Waive a fine (admin-only — D-04; marks the fine closed/inert). The server
 * re-checks admin-only; the api-client surfaces the role gate as a typed
 * { ok:false, reason:'insufficient_role' } result rather than a throw.
 *
 * @param {string} actionId
 * @returns {Promise<{ ok: boolean, result?: object, reason?: string, error?: string }>}
 */
export async function waiveFineAction(actionId) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await waiveFine(supabase, actionId);
    // Propagate ANY false business outcome (insufficient_role, not_waiveable, …)
    // rather than only insufficient_role — otherwise the UI shows a false success.
    if (result?.ok === false) {
      return { ok: false, reason: result.reason ?? "waive_failed" };
    }
    revalidatePath("/flat-actions");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "waive_failed" };
  }
}
