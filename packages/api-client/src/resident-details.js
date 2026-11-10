// Owner details, the tenant approval chain and proofs. See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

export const PROOFS_BUCKET = "parisar-proofs";

// ---- Proofs ----------------------------------------------------------------

/** The only object path the storage policy accepts. */
export function buildProofPath({ societyId, userId, fileName }) {
  const safe = String(fileName ?? "file")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(-80);
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${societyId}/${userId}/${unique}-${safe || "file"}`;
}

/** Upload to the private bucket, then attach it to its subject with attachProof. */
export async function uploadProofFile(
  supabase,
  { societyId, userId, file, fileName, contentType },
) {
  const path = buildProofPath({ societyId, userId, fileName: fileName ?? file?.name });
  const { error } = await supabase.storage.from(PROOFS_BUCKET).upload(path, file, {
    contentType: contentType ?? file?.type,
    upsert: false,
  });
  if (error) return { error: "PROOF_UPLOAD_FAILED", message: error.message };
  return { path };
}

/** Short-lived link. The storage policy decides who gets one. */
export async function createProofSignedUrl(supabase, path, expiresInSeconds = 60) {
  const { data, error } = await supabase.storage
    .from(PROOFS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return { error: "PROOF_NOT_ACCESSIBLE", message: error.message };
  return { url: data.signedUrl };
}

/** subjectKind: "owner" | "tenant" | "staff" */
export function attachProof(supabase, { subjectKind, subjectId, docType, storagePath, fileName }) {
  return callOnboardingRpc(supabase, "attach_proof", {
    p_subject_kind: subjectKind,
    p_subject_id: subjectId,
    p_doc_type: docType,
    p_storage_path: storagePath,
    p_file_name: fileName ?? null,
  });
}

export function listProofs(supabase, { subjectKind, subjectId }) {
  return callOnboardingRpc(supabase, "list_proofs", {
    p_subject_kind: subjectKind,
    p_subject_id: subjectId,
  });
}

/** Removes the record, then the stored file. */
export async function removeProof(supabase, documentId) {
  const res = await callOnboardingRpc(supabase, "remove_proof", { p_document_id: documentId });
  if (res?.error) return res;
  const { error } = await supabase.storage.from(PROOFS_BUCKET).remove([res.storage_path]);
  if (error) return { error: "PROOF_FILE_NOT_REMOVED", message: error.message };
  return res;
}

// ---- Owners ----------------------------------------------------------------

export function ownerSaveMyDetails(
  supabase,
  { flatId, fullName, isPrimary, startDate, membershipNumber },
) {
  return callOnboardingRpc(supabase, "owner_save_my_details", {
    p_flat_id: flatId,
    p_full_name: fullName,
    p_is_primary: isPrimary ?? false,
    p_start_date: startDate ?? null,
    p_membership_number: membershipNumber ?? null,
  });
}

export function managerSaveFlatOwner(supabase, input) {
  return callOnboardingRpc(supabase, "manager_save_flat_owner", {
    p_flat_id: input.flatId,
    p_full_name: input.fullName,
    p_phone: input.phone ?? null,
    p_is_primary: input.isPrimary ?? false,
    p_start_date: input.startDate ?? null,
    p_membership_number: input.membershipNumber ?? null,
    p_owner_id: input.ownerId ?? null,
  });
}

export function listFlatOwners(supabase, flatId) {
  return callOnboardingRpc(supabase, "list_flat_owners", { p_flat_id: flatId });
}

export function managerVerifyFlatOwner(supabase, { ownerId, verified }) {
  return callOnboardingRpc(supabase, "manager_verify_flat_owner", {
    p_owner_id: ownerId,
    p_verified: verified ?? true,
  });
}

export function managerRemoveFlatOwner(supabase, ownerId) {
  return callOnboardingRpc(supabase, "manager_remove_flat_owner", { p_owner_id: ownerId });
}

// ---- Tenants ---------------------------------------------------------------

export function tenantRegister(supabase, input) {
  return callOnboardingRpc(supabase, "tenant_register", {
    p_code: input.code,
    p_flat_id: input.flatId,
    p_full_name: input.fullName,
    p_agreement_start: input.agreementStart ?? null,
    p_agreement_end: input.agreementEnd ?? null,
    p_owner_name: input.ownerName ?? null,
    p_owner_phone: input.ownerPhone ?? null,
    p_police_status: input.policeStatus ?? "not_submitted",
    p_police_reference: input.policeReference ?? null,
  });
}

export function tenantSaveMyDetails(supabase, input) {
  return callOnboardingRpc(supabase, "tenant_save_my_details", {
    p_society_id: input.societyId,
    p_full_name: input.fullName,
    p_agreement_start: input.agreementStart ?? null,
    p_agreement_end: input.agreementEnd ?? null,
    p_owner_name: input.ownerName ?? null,
    p_owner_phone: input.ownerPhone ?? null,
    p_police_status: input.policeStatus ?? "not_submitted",
    p_police_reference: input.policeReference ?? null,
  });
}

export function myTenantRegistrations(supabase) {
  return callOnboardingRpc(supabase, "my_tenant_registrations");
}

export function ownerListTenantRequests(supabase) {
  return callOnboardingRpc(supabase, "owner_list_tenant_requests");
}

export function tenantOwnerDecide(supabase, { tenantId, approve, reason }) {
  return callOnboardingRpc(supabase, "tenant_owner_decide", {
    p_tenant_id: tenantId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
}

export function tenantAdminDecide(supabase, { tenantId, approve, reason }) {
  return callOnboardingRpc(supabase, "tenant_admin_decide", {
    p_tenant_id: tenantId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
}

export function tenantActivate(supabase, tenantId) {
  return callOnboardingRpc(supabase, "tenant_activate", { p_tenant_id: tenantId });
}

export function managerSetTenantPoliceStatus(supabase, { tenantId, status, reference }) {
  return callOnboardingRpc(supabase, "manager_set_tenant_police_status", {
    p_tenant_id: tenantId,
    p_status: status,
    p_reference: reference ?? null,
  });
}

export function managerListTenants(supabase, { societyId, status, limit, offset }) {
  return callOnboardingRpc(supabase, "manager_list_tenants", {
    p_society_id: societyId,
    p_status: status ?? null,
    p_limit: limit ?? 25,
    p_offset: offset ?? 0,
  });
}
