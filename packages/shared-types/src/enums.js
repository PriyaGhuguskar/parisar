// Domain enums — mirror Postgres enum types defined in supabase/migrations.
// Keep in sync with Plan 02's migration. The DB is the source of truth.

export const RESIDENCY_KIND = ["owner", "tenant"];

export const MEMBERSHIP_ROLE = ["member", "board_member", "co_secretary", "secretary"];

export const HOUSEHOLD_KIND = ["family", "bachelor"];

export const MEMBERSHIP_STATUS = ["active", "pending_review", "revoked", "deleted"];

// ---------------------------------------------------------------------------
// Phase 4 — Complaints
// ---------------------------------------------------------------------------
// Mirror the `complaint_kind` and `complaint_status` Postgres enums declared in
// supabase/migrations/20260526000007_phase4_complaints.sql.

export const COMPLAINT_KIND = {
  SOCIETY: "society",
  MEMBER: "member",
};

export const COMPLAINT_STATUS = {
  OPEN: "open",
  CHECKING: "checking",
  WILL_RESOLVE: "will_resolve",
  NEED_INFO: "need_info",
  RESOLVED: "resolved",
};

// Human-readable labels for response chips and status badges.
// i18n keys (preferred for UI): response.checking, response.willResolve,
// response.needInfo, response.resolved.
// These English fallbacks are for non-i18n contexts (e.g., push notification
// bodies, server-rendered emails, audit-log payloads).
export const RESPONSE_LABELS = {
  checking: "Checking",
  will_resolve: "Will resolve soon",
  need_info: "Need more info",
  resolved: "Resolved",
};

// ---------------------------------------------------------------------------
// Phase 5 — Notifications, Polls & Bookings
// ---------------------------------------------------------------------------
// Mirror the `notification_kind`, `notification_category`, `poll_status`, and
// `booking_status` Postgres enums declared in
// supabase/migrations/20260528000008_phase5_notifications_bookings.sql.

export const NOTIFICATION_KIND = {
  GENERAL: "general",
  POLL: "poll",
};

// The 5 categories map 1:1 to the mute_* columns on notification_preferences
// (A1 cross-phase preference contract). Phase 5 emits 'general' / 'polls'.
export const NOTIFICATION_CATEGORY = {
  COMPLAINTS: "complaints",
  POLLS: "polls",
  COMMUNITY: "community",
  FINES: "fines",
  GENERAL: "general",
};

export const POLL_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
};

export const BOOKING_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// Generic, lock-screen-safe English push bodies (Phase 7 localizes). These never
// leak notice content to the lock screen (T-04-10 / DD-10). Mirror RESPONSE_LABELS
// intent: English fallbacks for non-i18n contexts (push payloads, audit log).
export const PUSH_BODY_LABELS = {
  notice: "New notice in your society",
  poll: "New poll in your society",
  bookingApproved: "Your booking was approved",
  bookingUpdate: "There's an update on your booking",
  // Phase 6 — flat actions + community. A single generic flat-action body across
  // ALL kinds (warning/fine/notify) is intentional: it never leaks even the *kind*
  // of action on the lock screen (DD-9). Content is revealed only in-app.
  flatAction: "Your flat has a new notice",
  communityPost: "New post in your community",
};

// ---------------------------------------------------------------------------
// Phase 6 — Flat Actions & Community Feed
// ---------------------------------------------------------------------------
// Mirror the `flat_action_kind`, `fine_status`, `post_kind`, `report_target_kind`,
// and `moderation_event_kind` Postgres enums declared in
// supabase/migrations/20260529000009_phase6_flat_actions_community.sql.

// FLAT-01: a flat action is one of Warning / Fine / Notify.
export const FLAT_ACTION_KIND = {
  WARNING: "warning",
  FINE: "fine",
  NOTIFY: "notify",
};

// FLAT-05 / D-04: the fine lifecycle is exactly outstanding -> acknowledged | waived.
// There is deliberately NO 'overdue' value — overdue is a derived DISPLAY state of an
// `outstanding` fine whose due_date has passed (computed client-side at render), never
// a stored status. No payment, ever (PROJECT.md hard constraint).
export const FINE_STATUS = {
  OUTSTANDING: "outstanding",
  ACKNOWLEDGED: "acknowledged",
  WAIVED: "waived",
};

// COMM-01: a community post is sell / ask-for-help / general.
export const POST_KIND = {
  SELL: "sell",
  HELP: "help",
  GENERAL: "general",
};

// COMM-04: a report (and the same auto-hide flow) targets either a post or a comment.
export const REPORT_TARGET_KIND = {
  POST: "post",
  COMMENT: "comment",
};

// COMM-07: the moderation audit log records report | takedown | restore events.
export const MODERATION_EVENT_KIND = {
  REPORT: "report",
  TAKEDOWN: "takedown",
  RESTORE: "restore",
};

// Human-readable English labels for flat-action kind / fine status / post type /
// report reasons in non-i18n contexts (audit payloads, server-rendered text).
// UI surfaces prefer the i18n keys (flatAction.kind*, flatAction.status*,
// community.type*, community.reason.*).
export const FLAT_ACTION_KIND_LABELS = {
  warning: "Warning",
  fine: "Fine",
  notify: "Notify",
};

export const FINE_STATUS_LABELS = {
  outstanding: "Outstanding",
  acknowledged: "Acknowledged",
  waived: "Waived",
};

export const POST_KIND_LABELS = {
  sell: "Sell",
  help: "Ask for help",
  general: "General",
};

// ---------------------------------------------------------------------------
// Society onboarding (migrations 058-074). Resident type, society title and staff
// role are separate fields: one person can hold one of each.
// ---------------------------------------------------------------------------
export const RESIDENT_TYPE = ["owner", "tenant", "family_member"];

export const SOCIETY_TITLE = ["resident", "chairman", "secretary", "treasurer", "committee_member"];

// Which membership_role each title grants. Mirrors app_private.society_title_role.
export const SOCIETY_TITLE_ROLE = {
  resident: "member",
  committee_member: "board_member",
  treasurer: "co_secretary",
  secretary: "secretary",
  chairman: "secretary",
};

// The brief's staff roles first; maid, driver and cook are older directory values.
export const STAFF_ROLE = [
  "security",
  "plumber",
  "electrician",
  "cleaner",
  "gardener",
  "maintenance_staff",
  "other",
  "maid",
  "driver",
  "cook",
];

export const CONNECT_REQUEST_STATUS = [
  "new",
  "call_scheduled",
  "rescheduled",
  "contacted",
  "rejected",
  "registered",
];

export const SOCIETY_TYPE = [
  "cooperative_housing",
  "apartment_association",
  "gated_community",
  "condominium",
  "rwa",
  "mixed_use",
  "commercial",
  "other",
];

export const SETUP_STATE = ["needs_setup", "needs_personal_onboarding", "complete"];

export const SETUP_STEP = [
  "society_details",
  "authorities",
  "wings",
  "floors",
  "flats",
  "amenities",
  "staff",
  "guards",
  "residents_import",
];
export const SETUP_REQUIRED_STEPS = ["wings", "floors", "flats"];

export const FLAT_TYPE = [
  "1rk",
  "1bhk",
  "2bhk",
  "3bhk",
  "4bhk",
  "5bhk_plus",
  "studio",
  "duplex",
  "penthouse",
  "shop",
  "office",
  "other",
];

export const FLAT_STATUS = ["occupied", "vacant", "under_construction", "maintenance"];

export const RESIDENT_RECORD_STATUS = ["pending", "verified", "rejected", "needs_correction"];

export const IMPORT_ROW_STATUS = ["valid", "warning", "error", "imported"];

export const TENANT_STATUS = [
  "registered",
  "owner_approved",
  "admin_approved",
  "active",
  "rejected",
];

export const POLICE_VERIFICATION_STATUS = ["not_submitted", "submitted", "verified", "rejected"];

export const FAMILY_RELATIONSHIP = ["spouse", "parent", "child", "sibling", "other"];

export const HOUSEHOLD_REQUEST_STATUS = ["pending", "approved", "rejected", "cancelled"];

export const STAFF_SHIFT = ["morning", "afternoon", "evening", "night", "general", "rotational"];

export const ID_PROOF_TYPE = ["aadhaar", "pan", "voter_id", "driving_licence", "passport", "other"];

export const PROOF_DOC_TYPE = [
  "ownership_proof",
  "sale_deed",
  "share_certificate",
  "id_proof",
  "address_proof",
  "rent_agreement",
  "police_verification",
  "photo",
  "other",
];
