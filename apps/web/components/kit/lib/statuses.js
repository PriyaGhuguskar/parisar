// Every status the onboarding flows can show, and the tone it renders in. Labels are
// `status.<value>` in the `kit` i18n shard; a test keeps this map and the shards
// aligned. Values match the database spelling (see supabase/migrations/*onboarding*).

export const STATUS_TONES = Object.freeze({
  // Connect requests (enrollment_status)
  new: "info",
  contacted: "info",
  call_scheduled: "info",
  rescheduled: "warning",
  registered: "success",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  closed: "neutral",
  // Society setup progress
  not_started: "neutral",
  draft: "neutral",
  in_progress: "info",
  submitted: "info",
  completed: "success",
  // Residents, tenants, family, household
  invited: "info",
  invite_expired: "warning",
  invite_revoked: "neutral",
  pending: "warning",
  pending_verification: "warning",
  pending_review: "warning",
  pending_owner_approval: "warning",
  pending_committee_approval: "warning",
  pending_documents: "warning",
  verified: "success",
  active: "success",
  inactive: "neutral",
  suspended: "danger",
  declined: "danger",
  removed: "neutral",
  moved_out: "neutral",
  // Documents
  missing: "warning",
  uploaded: "info",
  under_review: "warning",
  expired: "danger",
  // Excel import, per file and per row
  queued: "info",
  validating: "info",
  valid: "success",
  invalid: "danger",
  importing: "info",
  imported: "success",
  partial: "warning",
  failed: "danger",
  skipped: "neutral",
  duplicate: "warning",
});

export const STATUS_VALUES = Object.freeze(Object.keys(STATUS_TONES));

/**
 * @param {string} status
 * @returns {"success" | "warning" | "danger" | "info" | "neutral"}
 */
export function statusTone(status) {
  return Object.hasOwn(STATUS_TONES, status) ? STATUS_TONES[status] : "neutral";
}

/** Readable fallback for a value this map does not know: "on_hold" -> "On hold". */
export function humanizeStatus(status) {
  const words = String(status ?? "").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
