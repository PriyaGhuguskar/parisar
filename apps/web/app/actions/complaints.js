"use server";

// Server actions for Phase 4 complaint mutations.
//
// Each action reads the caller from the cookie session (getUser), validates its
// arguments, and delegates to the shared api-client function. RLS/RPC guards do
// the real enforcement (claim/respond are board-only inside the RPCs).
//
// Returns plain objects (never Error) so they can cross the RSC ↔ client boundary.

import { addComplaintResponse, claimComplaint, fileComplaint } from "@parisar/api-client";
import { signedInClient } from "../../lib/auth/actionSession";
import { cleanAttachment, cleanText, isToken, isUuid } from "../../lib/validation";

// Mirrors FileComplaintForm / ComplaintDetailClient maxLength.
const MAX_DESCRIPTION = 1000;
const MAX_FREE_TEXT = 500;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const COMPLAINT_KINDS = new Set(["society", "member"]);
const LANGUAGES = new Set(["en", "hi", "mr"]);

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
  if (!COMPLAINT_KINDS.has(input?.kind)) return { ok: false, error: "invalid_input" };
  const description = cleanText(input?.description, {
    min: 1,
    max: MAX_DESCRIPTION,
    multiline: true,
  });
  if (!description.ok) return { ok: false, error: "invalid_input" };
  if (!isUuid(input?.reporterFlatId)) return { ok: false, error: "invalid_input" };
  if (input?.complaintId != null && !isUuid(input.complaintId)) {
    return { ok: false, error: "invalid_input" };
  }
  const languageCode = LANGUAGES.has(input?.languageCode) ? input.languageCode : "en";
  const photo = cleanAttachment(input, { maxBytes: MAX_PHOTO_BYTES });
  if (!photo.ok) return { ok: false, error: "invalid_input" };

  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  try {
    const result = await fileComplaint(ctx.supabase, {
      kind: input.kind,
      description: description.value,
      reporterFlatId: input.reporterFlatId,
      languageCode,
      complaintId: input.complaintId,
      ...photo.value,
    });
    return { ok: true, complaintId: result.complaintId, societyId: result.societyId };
  } catch (err) {
    return { ok: false, error: err?.message ?? "file_failed" };
  }
}

/** Shared argument check for claim / respond. */
function cleanResponseArgs(complaintId, responseKind, freeText) {
  if (!isUuid(complaintId) || !isToken(responseKind)) return null;
  const text = cleanText(freeText, { max: MAX_FREE_TEXT, multiline: true, optional: true });
  return text.ok ? { complaintId, responseKind, freeText: text.value } : null;
}

/**
 * Atomic-claim a complaint (board roles only — enforced by RPC).
 *
 * Returns either { ok: true, claimed: true, complaint } or
 * { ok: true, claimed: false } (race lost) or { ok: false, error }.
 */
export async function claimComplaintAction(complaintId, responseKind, freeText) {
  const args = cleanResponseArgs(complaintId, responseKind, freeText);
  if (!args) return { ok: false, error: "invalid_input" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  try {
    const result = await claimComplaint(ctx.supabase, args);
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
  const args = cleanResponseArgs(complaintId, responseKind, freeText);
  if (!args) return { ok: false, error: "invalid_input" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  try {
    const responseId = await addComplaintResponse(ctx.supabase, args);
    return { ok: true, responseId };
  } catch (err) {
    return { ok: false, error: err?.message ?? "response_failed" };
  }
}
