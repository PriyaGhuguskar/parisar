"use server";

// Server actions for Phase 4 complaint mutations.
//
// Each action creates a cookie-bound server Supabase client and delegates to the
// shared api-client function. Server actions run server-side, so the session is
// already validated by middleware + (protected)/layout.jsx — RLS/RPC guards do
// the real enforcement.
//
// Returns plain objects (never Error) so they can cross the RSC ↔ client boundary.

import { addComplaintResponse, claimComplaint, fileComplaint } from "@parisar/api-client";
import { createSupabaseServerClient } from "../../lib/supabase/server";

/**
 * File a new complaint.
 *
 * Accepts a plain object (called from client component via server action wrapper).
 *
 * @param {{
 *   kind: 'society'|'member',
 *   description: string,
 *   reporterFlatId: string,
 *   languageCode?: string,
 *   complaintId?: string,
 *   storageKey?: string|null,
 *   mimeType?: string|null,
 *   byteSize?: number|null,
 * }} input
 */
export async function fileComplaintAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await fileComplaint(supabase, {
      kind: input.kind,
      description: input.description,
      reporterFlatId: input.reporterFlatId,
      languageCode: input.languageCode ?? "en",
      complaintId: input.complaintId,
      storageKey: input.storageKey ?? null,
      mimeType: input.mimeType ?? null,
      byteSize: input.byteSize ?? null,
    });
    return { ok: true, complaintId: result.complaintId, societyId: result.societyId };
  } catch (err) {
    return { ok: false, error: err?.message ?? "file_failed" };
  }
}

/**
 * Atomic-claim a complaint (board roles only — enforced by RPC).
 *
 * Returns either { ok: true, claimed: true, complaint } or
 * { ok: true, claimed: false } (race lost) or { ok: false, error }.
 */
export async function claimComplaintAction(complaintId, responseKind, freeText) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await claimComplaint(supabase, {
      complaintId,
      responseKind,
      freeText: freeText ?? null,
    });
    if (result.claimed) {
      return { ok: true, claimed: true, complaint: result.complaint };
    }
    return { ok: true, claimed: false };
  } catch (err) {
    return { ok: false, error: err?.message ?? "claim_failed" };
  }
}

/**
 * Add a subsequent response on a complaint already owned by the caller.
 */
export async function addComplaintResponseAction(complaintId, responseKind, freeText) {
  const supabase = await createSupabaseServerClient();
  try {
    const responseId = await addComplaintResponse(supabase, {
      complaintId,
      responseKind,
      freeText: freeText ?? null,
    });
    return { ok: true, responseId };
  } catch (err) {
    return { ok: false, error: err?.message ?? "response_failed" };
  }
}
