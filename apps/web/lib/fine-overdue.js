// apps/web/lib/fine-overdue.js
// Phase 7 IN-02 — thin re-export of the unified helper.
// Single source: @parisar/api-client/fines/fine-overdue.
// Kept for import-path stability (FineDetailBlock, FineStatusBadge).
export { isOverdue, overdueDays } from "@parisar/api-client";
