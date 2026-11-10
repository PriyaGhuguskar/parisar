import { describe, expect, it, vi } from "vitest";
import * as api from "../index.js";

const ID = "11111111-1111-1111-1111-111111111111";

function client(result = { data: { ok: true }, error: null }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

// [wrapper, input (spread as arguments), rpc name, exact params]
const CASES = [
  [
    "submitConnectRequest",
    [{ societyName: "S", contactName: "C", phone: "9", preferredAt: "T" }],
    "submit_connect_request",
    {
      p_society_name: "S",
      p_contact_name: "C",
      p_phone: "9",
      p_email: null,
      p_authority_numbers: [],
      p_preferred_at: "T",
      p_call_now: false,
      p_alternate_at: null,
      p_message: null,
    },
  ],
  [
    "getConnectRequestStatus",
    [{ requestCode: "PR", phone: "9" }],
    "get_connect_request_status",
    { p_request_code: "PR", p_phone: "9" },
  ],
  [
    "adminListConnectRequests",
    [],
    "admin_list_connect_requests",
    {
      p_search: null,
      p_status: null,
      p_from: null,
      p_to: null,
      p_limit: 25,
      p_offset: 0,
    },
  ],
  ["adminGetConnectRequest", [ID], "admin_get_connect_request", { p_request_id: ID }],
  [
    "adminRescheduleConnectRequest",
    [{ requestId: ID, scheduledAt: "T" }],
    "admin_reschedule_connect_request",
    {
      p_request_id: ID,
      p_scheduled_at: "T",
      p_note: null,
    },
  ],
  [
    "adminRejectConnectRequest",
    [{ requestId: ID, reason: "R" }],
    "admin_reject_connect_request",
    { p_request_id: ID, p_reason: "R" },
  ],
  [
    "adminMarkConnectCalled",
    [{ requestId: ID }],
    "admin_mark_connect_called",
    { p_request_id: ID, p_note: null },
  ],
  [
    "adminRegisterSociety",
    [
      {
        name: "N",
        addressLine: "A",
        city: "C",
        state: "S",
        pincode: "4",
        requestId: ID,
        features: ["sos"],
      },
    ],
    "admin_register_society",
    {
      p_name: "N",
      p_address_line: "A",
      p_city: "C",
      p_state: "S",
      p_pincode: "4",
      p_landmark: null,
      p_authorities: [],
      p_request_id: ID,
      p_registration_number: null,
      p_society_type: null,
      p_registration_date: null,
      p_official_email: null,
      p_official_phone: null,
      p_country: "India",
      p_features: ["sos"],
    },
  ],
  [
    "adminUpdateSocietyRegistration",
    [{ societyId: ID, country: "India" }],
    "admin_update_society_registration",
    {
      p_society_id: ID,
      p_registration_number: null,
      p_society_type: null,
      p_registration_date: null,
      p_official_email: null,
      p_official_phone: null,
      p_country: "India",
    },
  ],
  ["getSocietyRegistration", [ID], "get_society_registration", { p_society_id: ID }],
  ["mySocietyFeatures", [ID], "my_society_features", { p_society_id: ID }],
  ["claimAuthorityForSociety", [ID], "claim_authority_for_society", { p_society_id: ID }],
  [
    "authoritySkipPersonalOnboarding",
    [ID],
    "authority_skip_personal_onboarding",
    { p_society_id: ID },
  ],
  [
    "setMemberSocietyTitle",
    [{ societyId: ID, targetUserId: ID, title: "chairman" }],
    "set_member_society_title",
    {
      p_society_id: ID,
      p_target_user_id: ID,
      p_title: "chairman",
    },
  ],
  ["setupGetState", [ID], "setup_get_state", { p_society_id: ID }],
  [
    "setupUpsertWing",
    [{ societyId: ID, name: "A" }],
    "setup_upsert_wing",
    { p_society_id: ID, p_name: "A", p_code: null, p_wing_id: null },
  ],
  ["setupDeleteWing", [ID], "setup_delete_wing", { p_wing_id: ID }],
  [
    "setupUpsertFloor",
    [{ societyId: ID, wingId: ID, number: 0 }],
    "setup_upsert_floor",
    {
      p_society_id: ID,
      p_wing_id: ID,
      p_number: 0,
      p_name: null,
      p_flat_count: 0,
      p_floor_id: null,
    },
  ],
  ["setupDeleteFloor", [ID], "setup_delete_floor", { p_floor_id: ID }],
  [
    "setupUpsertFlat",
    [{ societyId: ID, wingId: ID, number: "101", bedrooms: 0 }],
    "setup_upsert_flat",
    {
      p_society_id: ID,
      p_wing_id: ID,
      p_floor_id: null,
      p_number: "101",
      p_flat_type: null,
      p_area_sqft: null,
      p_bedrooms: 0,
      p_parking_slot: null,
      p_status: "vacant",
      p_flat_id: null,
    },
  ],
  [
    "setupBulkCreateFlats",
    [{ societyId: ID, floorId: ID, flats: [] }],
    "setup_bulk_create_flats",
    { p_society_id: ID, p_floor_id: ID, p_flats: [] },
  ],
  ["setupDeleteFlat", [ID], "setup_delete_flat", { p_flat_id: ID }],
  [
    "setupSaveDraft",
    [{ societyId: ID, step: "wings", draft: {} }],
    "setup_save_draft",
    { p_society_id: ID, p_step: "wings", p_draft: {} },
  ],
  [
    "setupCompleteStep",
    [{ societyId: ID, step: "wings" }],
    "setup_complete_step",
    { p_society_id: ID, p_step: "wings" },
  ],
  [
    "setupSkipStep",
    [{ societyId: ID, step: "staff" }],
    "setup_skip_step",
    { p_society_id: ID, p_step: "staff" },
  ],
  ["setupComplete", [ID], "setup_complete", { p_society_id: ID }],
  [
    "importValidateRows",
    [{ societyId: ID, rows: [] }],
    "import_validate_rows",
    { p_society_id: ID, p_file_name: null, p_rows: [] },
  ],
  ["importConfirmBatch", [ID], "import_confirm_batch", { p_batch_id: ID }],
  ["importCancelBatch", [ID], "import_cancel_batch", { p_batch_id: ID }],
  [
    "importListBatches",
    [{ societyId: ID }],
    "import_list_batches",
    { p_society_id: ID, p_limit: 25, p_offset: 0 },
  ],
  [
    "importGetBatch",
    [{ batchId: ID }],
    "import_get_batch",
    { p_batch_id: ID, p_status: null, p_limit: 100, p_offset: 0 },
  ],
  ["residentConfirmRecord", [ID], "resident_confirm_record", { p_record_id: ID }],
  [
    "residentSubmitCorrection",
    [{ recordId: ID, changes: {} }],
    "resident_submit_correction",
    { p_record_id: ID, p_changes: {}, p_note: null },
  ],
  [
    "residentReportIncorrect",
    [{ recordId: ID, reason: "R" }],
    "resident_report_incorrect",
    { p_record_id: ID, p_reason: "R" },
  ],
  [
    "managerListResidentRecords",
    [{ societyId: ID, status: "pending" }],
    "manager_list_resident_records",
    {
      p_society_id: ID,
      p_status: "pending",
      p_resident_type: null,
      p_search: null,
      p_flat_id: null,
      p_batch_id: null,
      p_limit: 25,
      p_offset: 0,
    },
  ],
  [
    "managerReviewResidentRecord",
    [{ recordId: ID, action: "reject", reason: "R" }],
    "manager_review_resident_record",
    {
      p_record_id: ID,
      p_action: "reject",
      p_changes: null,
      p_flat_id: null,
      p_reason: "R",
    },
  ],
  [
    "managerAddResidentRecord",
    [{ societyId: ID, flatId: ID, fullName: "N", phone: "9", residentType: "owner" }],
    "manager_add_resident_record",
    {
      p_society_id: ID,
      p_flat_id: ID,
      p_full_name: "N",
      p_phone: "9",
      p_resident_type: "owner",
      p_email: null,
    },
  ],
  ["managerPrepareResidentInvite", [ID], "manager_prepare_resident_invite", { p_record_id: ID }],
  [
    "attachProof",
    [{ subjectKind: "owner", subjectId: ID, docType: "sale_deed", storagePath: "p" }],
    "attach_proof",
    {
      p_subject_kind: "owner",
      p_subject_id: ID,
      p_doc_type: "sale_deed",
      p_storage_path: "p",
      p_file_name: null,
    },
  ],
  [
    "listProofs",
    [{ subjectKind: "owner", subjectId: ID }],
    "list_proofs",
    { p_subject_kind: "owner", p_subject_id: ID },
  ],
  [
    "ownerSaveMyDetails",
    [{ flatId: ID, fullName: "N" }],
    "owner_save_my_details",
    {
      p_flat_id: ID,
      p_full_name: "N",
      p_is_primary: false,
      p_start_date: null,
      p_membership_number: null,
    },
  ],
  [
    "managerSaveFlatOwner",
    [{ flatId: ID, fullName: "N" }],
    "manager_save_flat_owner",
    {
      p_flat_id: ID,
      p_full_name: "N",
      p_phone: null,
      p_is_primary: false,
      p_start_date: null,
      p_membership_number: null,
      p_owner_id: null,
    },
  ],
  ["listFlatOwners", [ID], "list_flat_owners", { p_flat_id: ID }],
  [
    "managerVerifyFlatOwner",
    [{ ownerId: ID }],
    "manager_verify_flat_owner",
    { p_owner_id: ID, p_verified: true },
  ],
  [
    "managerVerifyFlatOwner",
    [{ ownerId: ID, verified: false }],
    "manager_verify_flat_owner",
    { p_owner_id: ID, p_verified: false },
  ],
  ["managerRemoveFlatOwner", [ID], "manager_remove_flat_owner", { p_owner_id: ID }],
  [
    "tenantRegister",
    [{ code: "C", flatId: ID, fullName: "N" }],
    "tenant_register",
    {
      p_code: "C",
      p_flat_id: ID,
      p_full_name: "N",
      p_agreement_start: null,
      p_agreement_end: null,
      p_owner_name: null,
      p_owner_phone: null,
      p_police_status: "not_submitted",
      p_police_reference: null,
    },
  ],
  [
    "tenantSaveMyDetails",
    [{ societyId: ID, fullName: "N" }],
    "tenant_save_my_details",
    {
      p_society_id: ID,
      p_full_name: "N",
      p_agreement_start: null,
      p_agreement_end: null,
      p_owner_name: null,
      p_owner_phone: null,
      p_police_status: "not_submitted",
      p_police_reference: null,
    },
  ],
  [
    "tenantOwnerDecide",
    [{ tenantId: ID, approve: false, reason: "R" }],
    "tenant_owner_decide",
    { p_tenant_id: ID, p_approve: false, p_reason: "R" },
  ],
  [
    "tenantAdminDecide",
    [{ tenantId: ID, approve: true }],
    "tenant_admin_decide",
    { p_tenant_id: ID, p_approve: true, p_reason: null },
  ],
  ["tenantActivate", [ID], "tenant_activate", { p_tenant_id: ID }],
  [
    "managerSetTenantPoliceStatus",
    [{ tenantId: ID, status: "verified" }],
    "manager_set_tenant_police_status",
    {
      p_tenant_id: ID,
      p_status: "verified",
      p_reference: null,
    },
  ],
  [
    "managerListTenants",
    [{ societyId: ID }],
    "manager_list_tenants",
    { p_society_id: ID, p_status: null, p_limit: 25, p_offset: 0 },
  ],
  [
    "familyInviteCreate",
    [{ societyId: ID, fullName: "N", relationship: "spouse" }],
    "family_invite_create",
    {
      p_society_id: ID,
      p_full_name: "N",
      p_relationship: "spouse",
      p_phone: null,
    },
  ],
  ["familyInviteList", [ID], "family_invite_list", { p_society_id: ID }],
  ["familyInviteRevoke", [ID], "family_invite_revoke", { p_invite_id: ID }],
  ["familyInvitePreview", ["t"], "family_invite_preview", { p_token: "t" }],
  ["familyInviteAccept", ["t"], "family_invite_accept", { p_token: "t" }],
  [
    "householdLookup",
    [{ code: "C", wing: "A", flat: "101" }],
    "household_lookup",
    { p_code: "C", p_wing: "A", p_floor: null, p_flat: "101" },
  ],
  [
    "householdRequestAccess",
    [{ code: "C", flatId: ID, fullName: "N", relationship: "child" }],
    "household_request_access",
    {
      p_code: "C",
      p_flat_id: ID,
      p_full_name: "N",
      p_relationship: "child",
      p_resident_type: "family_member",
      p_message: null,
    },
  ],
  ["householdCancelRequest", [ID], "household_cancel_request", { p_request_id: ID }],
  [
    "householdDecideRequest",
    [{ requestId: ID, approve: true }],
    "household_decide_request",
    { p_request_id: ID, p_approve: true, p_reason: null },
  ],
  [
    "managerSaveStaff",
    [{ societyId: ID, name: "N", category: "security" }],
    "manager_save_staff",
    {
      p_society_id: ID,
      p_name: "N",
      p_category: "security",
      p_phone: null,
      p_last_name: null,
      p_email: null,
      p_joining_date: null,
      p_employee_id: null,
      p_vendor_name: null,
      p_shift: null,
      p_emergency_contact_name: null,
      p_emergency_contact_phone: null,
      p_id_proof_type: null,
      p_staff_id: null,
    },
  ],
  [
    "managerListStaff",
    [{ societyId: ID }],
    "manager_list_staff",
    { p_society_id: ID, p_category: null, p_search: null, p_limit: 25, p_offset: 0 },
  ],
  ["managerGetStaff", [ID], "manager_get_staff", { p_staff_id: ID }],
  ["societyAdminDashboard", [ID], "society_admin_dashboard", { p_society_id: ID }],
  ["residentDashboard", [], "resident_dashboard", { p_society_id: null }],
  ["securityDashboard", [ID], "security_dashboard", { p_society_id: ID }],
];

const NO_ARG_CASES = [
  ["adminOnboardingMetrics", "admin_onboarding_metrics"],
  ["adminFeatureCatalogue", "admin_feature_catalogue"],
  ["myAuthoritySocieties", "my_authority_societies"],
  ["myOnboardingState", "my_onboarding_state"],
  ["myResidentRecords", "my_resident_records"],
  ["myTenantRegistrations", "my_tenant_registrations"],
  ["ownerListTenantRequests", "owner_list_tenant_requests"],
  ["householdMyRequests", "household_my_requests"],
  ["householdPendingForMe", "household_pending_for_me"],
];

describe("onboarding wrappers call the documented RPC with exact params", () => {
  it.each(CASES)("%s", async (name, input, fn, params) => {
    const sb = client();
    const res = await api[name](sb, ...input);
    expect(sb.rpc).toHaveBeenCalledWith(fn, params);
    expect(res).toEqual({ ok: true });
  });

  it.each(NO_ARG_CASES)("%s", async (name, fn) => {
    const sb = client();
    await api[name](sb);
    expect(sb.rpc).toHaveBeenCalledWith(fn);
  });
});

describe("error normalisation", () => {
  it("turns a raised code into { error }", async () => {
    const sb = client({ data: null, error: { message: "NOT_SOCIETY_MANAGER" } });
    expect(await api.setupComplete(sb, ID)).toEqual({ error: "NOT_SOCIETY_MANAGER" });
  });

  it("keeps the code when the message has a suffix", async () => {
    const sb = client({ data: null, error: { message: "FLAT_EXISTS: 101" } });
    expect(await api.setupBulkCreateFlats(sb, { societyId: ID, floorId: ID, flats: [] })).toEqual({
      error: "FLAT_EXISTS",
    });
  });

  it("passes a returned { error } straight through", async () => {
    const sb = client({ data: { error: "INVALID_CODE" }, error: null });
    expect(await api.householdLookup(sb, { code: "x", wing: "A", flat: "1" })).toEqual({
      error: "INVALID_CODE",
    });
  });

  it("throws anything that is not a code, so an outage is never a business result", async () => {
    const failure = { message: "network down" };
    const sb = client({ data: null, error: failure });
    await expect(api.adminOnboardingMetrics(sb)).rejects.toBe(failure);
  });

  it("does not read a single capitalised word as a code", () => {
    expect(api.onboardingErrorCode({ message: "ERROR occurred" })).toBeNull();
    expect(api.onboardingErrorCode({ message: "SLOT_IN_PAST" })).toBe("SLOT_IN_PAST");
    expect(api.onboardingErrorCode(null)).toBeNull();
  });
});

describe("proof files", () => {
  const storage = (bucketApi) => ({ from: vi.fn(() => bucketApi) });

  it("builds the only path the storage policy accepts", () => {
    const path = api.buildProofPath({
      societyId: "soc",
      userId: "usr",
      fileName: "../My Deed (1).pdf",
    });
    const [society, user, file, extra] = path.split("/");
    expect([society, user, extra]).toEqual(["soc", "usr", undefined]);
    expect(file).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
    expect(file.endsWith(".pdf")).toBe(true);
  });

  it("uploads to the private bucket without overwriting", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const sb = { storage: storage({ upload }) };
    const res = await api.uploadProofFile(sb, {
      societyId: "soc",
      userId: "usr",
      file: { name: "a.png", type: "image/png" },
    });
    expect(sb.storage.from).toHaveBeenCalledWith("parisar-proofs");
    expect(res.path.startsWith("soc/usr/")).toBe(true);
    expect(upload.mock.calls[0][2]).toEqual({ contentType: "image/png", upsert: false });
  });

  it("reports an upload failure instead of pretending", async () => {
    const sb = {
      storage: storage({ upload: vi.fn().mockResolvedValue({ error: { message: "denied" } }) }),
    };
    expect(await api.uploadProofFile(sb, { societyId: "s", userId: "u", file: {} })).toEqual({
      error: "PROOF_UPLOAD_FAILED",
      message: "denied",
    });
  });

  it("signs a link, or says it could not", async () => {
    const ok = {
      storage: storage({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "u" }, error: null }),
      }),
    };
    expect(await api.createProofSignedUrl(ok, "p")).toEqual({ url: "u" });
    const no = {
      storage: storage({
        createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: "x" } }),
      }),
    };
    expect((await api.createProofSignedUrl(no, "p")).error).toBe("PROOF_NOT_ACCESSIBLE");
  });

  it("removeProof removes the record, then the file", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { deleted: ID, storage_path: "s/u/f" }, error: null }),
      storage: storage({ remove }),
    };
    const res = await api.removeProof(sb, ID);
    expect(sb.rpc).toHaveBeenCalledWith("remove_proof", { p_document_id: ID });
    expect(remove).toHaveBeenCalledWith(["s/u/f"]);
    expect(res.deleted).toBe(ID);
  });

  it("removeProof stops when the RPC refuses, and reports a stuck file", async () => {
    const remove = vi.fn();
    const refused = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "PROOF_NOT_FOUND" } }),
      storage: storage({ remove }),
    };
    expect(await api.removeProof(refused, ID)).toEqual({ error: "PROOF_NOT_FOUND" });
    expect(remove).not.toHaveBeenCalled();

    const stuck = {
      rpc: vi.fn().mockResolvedValue({ data: { storage_path: "p" }, error: null }),
      storage: storage({ remove: vi.fn().mockResolvedValue({ error: { message: "x" } }) }),
    };
    expect((await api.removeProof(stuck, ID)).error).toBe("PROOF_FILE_NOT_REMOVED");
  });
});
