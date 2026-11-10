// Society setup: wings, floors, flats, draft progress, completion.
// See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

export function setupGetState(supabase, societyId) {
  return callOnboardingRpc(supabase, "setup_get_state", { p_society_id: societyId });
}

export function setupUpsertWing(supabase, { societyId, name, code, wingId }) {
  return callOnboardingRpc(supabase, "setup_upsert_wing", {
    p_society_id: societyId,
    p_name: name,
    p_code: code ?? null,
    p_wing_id: wingId ?? null,
  });
}

export function setupDeleteWing(supabase, wingId) {
  return callOnboardingRpc(supabase, "setup_delete_wing", { p_wing_id: wingId });
}

export function setupUpsertFloor(
  supabase,
  { societyId, wingId, number, name, flatCount, floorId },
) {
  return callOnboardingRpc(supabase, "setup_upsert_floor", {
    p_society_id: societyId,
    p_wing_id: wingId,
    p_number: number,
    p_name: name ?? null,
    p_flat_count: flatCount ?? 0,
    p_floor_id: floorId ?? null,
  });
}

export function setupDeleteFloor(supabase, floorId) {
  return callOnboardingRpc(supabase, "setup_delete_floor", { p_floor_id: floorId });
}

export function setupUpsertFlat(supabase, input) {
  return callOnboardingRpc(supabase, "setup_upsert_flat", {
    p_society_id: input.societyId,
    p_wing_id: input.wingId,
    p_floor_id: input.floorId ?? null,
    p_number: input.number,
    p_flat_type: input.flatType ?? null,
    p_area_sqft: input.areaSqft ?? null,
    p_bedrooms: input.bedrooms ?? null,
    p_parking_slot: input.parkingSlot ?? null,
    p_status: input.status ?? "vacant",
    p_flat_id: input.flatId ?? null,
  });
}

/** All or nothing. flats: [{ number, flat_type, area_sqft, bedrooms, parking_slot, status }] */
export function setupBulkCreateFlats(supabase, { societyId, floorId, flats }) {
  return callOnboardingRpc(supabase, "setup_bulk_create_flats", {
    p_society_id: societyId,
    p_floor_id: floorId,
    p_flats: flats,
  });
}

export function setupDeleteFlat(supabase, flatId) {
  return callOnboardingRpc(supabase, "setup_delete_flat", { p_flat_id: flatId });
}

export function setupSaveDraft(supabase, { societyId, step, draft }) {
  return callOnboardingRpc(supabase, "setup_save_draft", {
    p_society_id: societyId,
    p_step: step,
    p_draft: draft,
  });
}

export function setupCompleteStep(supabase, { societyId, step }) {
  return callOnboardingRpc(supabase, "setup_complete_step", {
    p_society_id: societyId,
    p_step: step,
  });
}

export function setupSkipStep(supabase, { societyId, step }) {
  return callOnboardingRpc(supabase, "setup_skip_step", { p_society_id: societyId, p_step: step });
}

export function setupComplete(supabase, societyId) {
  return callOnboardingRpc(supabase, "setup_complete", { p_society_id: societyId });
}
