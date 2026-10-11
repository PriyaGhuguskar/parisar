"use server";

// Server actions for Phase 6 flat-action mutations (web).
//
// Each action reads the caller from the cookie session (getUser), validates its
// arguments, and delegates to the shared api-client function. RLS/RPC guards do
// the real enforcement:
//   - issue_flat_action  → admin-only server-side (secretary/co_secretary)
//   - waive_fine         → admin-only server-side; the client also gates the Waive
//                          affordance on isAdmin (defence in depth, D-04 / T-06-32)
//   - acknowledge_fine   → target-flat member only (server-gated)
// issue/waive ALSO check the live role here, so a member never reaches those RPCs.
//
// Returns plain objects (never Error) so they cross the RSC ↔ client boundary.
// waiveFine's INSUFFICIENT_ROLE is surfaced by the api-client as a typed result,
// so it never throws for that gate — we pass `reason` through.
//
// revalidatePath('/flat-actions') after each mutation so a subsequent SSR
// navigation re-hydrates the list.

import { acknowledgeFine, issueFlatAction, waiveFine } from "@parisar/api-client";
import { revalidatePath } from "next/cache";
import { signedInClient } from "../../../lib/auth/actionSession";
import { isManagerRole, resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { cleanAttachment, cleanText, isIsoDate, isUuid } from "../../../lib/validation";

// Mirrors IssueActionForm (MAX_MESSAGE / MAX_AMOUNT / MAX_PDF_BYTES).
const MAX_BODY = 2000;
const MAX_AMOUNT = 1000000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ACTION_KINDS = new Set(["warning", "fine", "notify"]);

/** Signed-in Secretary / Co-Secretary of the active society, or null. */
async function managerClient() {
  const ctx = await signedInClient();
  if (!ctx) return null;
  const { role } = await resolveActiveSociety(ctx.supabase, ctx.user);
  return isManagerRole(role) ? ctx : null;
}

/** Validate issueFlatActionAction's input; null when invalid. */
function cleanIssueInput(input) {
  if (!isUuid(input?.flatId) || !ACTION_KINDS.has(input?.kind)) return null;
  const body = cleanText(input?.body, { min: 1, max: MAX_BODY, multiline: true });
  if (!body.ok) return null;
  const amount = input?.amount ?? null;
  if (amount !== null && !(Number.isInteger(amount) && amount > 0 && amount <= MAX_AMOUNT)) {
    return null;
  }
  const dueDate = input?.dueDate ?? null;
  if (dueDate !== null && !isIsoDate(dueDate)) return null;
  const actionId = input?.actionId ?? null;
  if (actionId !== null && !isUuid(actionId)) return null;
  const pdf = cleanAttachment(input, { maxBytes: MAX_PDF_BYTES });
  if (!pdf.ok) return null;
  return {
    flatId: input.flatId,
    kind: input.kind,
    body: body.value,
    amount,
    dueDate,
    actionId,
    ...pdf.value,
  };
}

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
  const clean = cleanIssueInput(input);
  if (!clean) return { ok: false, error: "issue_failed" };
  const ctx = await managerClient();
  if (!ctx) return { ok: false, error: "not_authorized" };
  try {
    const result = await issueFlatAction(ctx.supabase, clean);
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
  if (!isUuid(actionId)) return { ok: false, error: "acknowledge_failed" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "acknowledge_failed" };
  try {
    const result = await acknowledgeFine(ctx.supabase, actionId);
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
  if (!isUuid(actionId)) return { ok: false, error: "waive_failed" };
  const ctx = await managerClient();
  if (!ctx) return { ok: false, reason: "insufficient_role" };
  try {
    const result = await waiveFine(ctx.supabase, actionId);
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
