// Excel import. The browser parses the file; the server decides what is valid.
// See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

/**
 * Validate parsed rows and store them as a batch. Creates no resident.
 * rows: [{ row_number, society_code, wing, floor, flat, full_name, resident_type, mobile, email }]
 */
export function importValidateRows(supabase, { societyId, fileName, rows }) {
  return callOnboardingRpc(supabase, "import_validate_rows", {
    p_society_id: societyId,
    p_file_name: fileName ?? null,
    p_rows: rows,
  });
}

/** Import the valid rows of a batch, re-checking each one first. */
export function importConfirmBatch(supabase, batchId) {
  return callOnboardingRpc(supabase, "import_confirm_batch", { p_batch_id: batchId });
}

export function importCancelBatch(supabase, batchId) {
  return callOnboardingRpc(supabase, "import_cancel_batch", { p_batch_id: batchId });
}

export function importListBatches(supabase, { societyId, limit, offset }) {
  return callOnboardingRpc(supabase, "import_list_batches", {
    p_society_id: societyId,
    p_limit: limit ?? 25,
    p_offset: offset ?? 0,
  });
}

export function importGetBatch(supabase, { batchId, status, limit, offset }) {
  return callOnboardingRpc(supabase, "import_get_batch", {
    p_batch_id: batchId,
    p_status: status ?? null,
    p_limit: limit ?? 100,
    p_offset: offset ?? 0,
  });
}
