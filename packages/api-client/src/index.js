export * from "./bookings.js";
export * from "./community.js";
export * from "./complaints.js";
export * from "./dashboard.js";
// Phase 7 IN-02 — unified fine-overdue helpers (single source, 3-arg signature
// (fineStatus, dueDate, nowMs)). Both apps re-export from this module.
export { isOverdue, overdueDays } from "./fines/fine-overdue.js";
export * from "./flat-actions.js";
export {
  fileNotification,
  getNoticeDetail,
  listNotices,
  markNoticeRead,
  NOTICES_BUCKET,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_KIND,
  pickAndUploadNoticeAttachment,
  subscribeToNotices,
  uploadNoticeAttachmentWeb,
} from "./notifications.js";
export * from "./otp.js";
export * from "./polls.js";
// Phase 5 — notifications, polls, bookings, preferences.
// preferences.js owns ensureNotificationPreferences; notifications.js re-exports it
// for its own module consumers. Export preferences explicitly (named) so the
// shared name is unambiguous at the package boundary, then star-export the rest
// (excluding that one name from notifications' wildcard would otherwise be omitted
// by the ES "ambiguous re-export" rule).
export {
  ensureNotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreference,
} from "./preferences.js";
export * from "./society.js";
export * from "./supabase.js";
// Phase 7 WR-03 — shared grapheme helper for cross-platform avatar initials/color.
export { graphemes } from "./text/graphemes.js";
