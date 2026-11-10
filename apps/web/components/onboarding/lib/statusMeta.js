// Tone and label key for the statuses this area shows. Labels live in the
// resident-onboarding shard (status.<kind>.<value>) so the shared kit shard and
// lib/statuses.js need no edits for values only these screens use.

const TONES = {
  record: {
    pending: "warning",
    verified: "success",
    rejected: "danger",
    needs_correction: "warning",
  },
  tenant: {
    registered: "warning",
    owner_approved: "info",
    admin_approved: "info",
    active: "success",
    rejected: "danger",
  },
  household: { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" },
  invite: { pending: "info", accepted: "success", revoked: "neutral", expired: "neutral" },
  police: { not_submitted: "neutral", submitted: "info", verified: "success", rejected: "danger" },
  owner: { verified: "success", unverified: "warning" },
};

export function statusTone(kind, value) {
  return TONES[kind]?.[value] ?? "neutral";
}

export function hasStatusLabel(kind, value) {
  return Boolean(TONES[kind] && value in TONES[kind]);
}
