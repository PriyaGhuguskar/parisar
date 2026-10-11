// packages/api-client/src/fines/fine-overdue.js
// Phase 7 IN-02 — unified fine-overdue helpers. Single source for both apps.
//
// The Phase 6 code review found the mobile and web copies of fine-overdue.js
// had drifted: the mobile `overdueDays` took 2 args (dueDate, nowMs) while
// the web `overdueDays` took 3 args (fineStatus, dueDate, nowMs). The web
// signature is canonical here (see 07-RESEARCH.md §IN-02): an acknowledged
// fine is NEVER overdue regardless of due date, and putting `fineStatus` as
// the first arg makes that gate impossible to forget.
//
// CRITICAL (D-04, Phase 6): there is NO stored `overdue` status. The fine_status
// enum is exactly { outstanding, acknowledged, waived }. "Overdue" is a
// VISUAL-ONLY derived display state of an `outstanding` fine whose due_date
// has elapsed. It is computed client-side at render time. It triggers NO push,
// NO escalation, NO status change.
//
// `dueDate` semantics:
//   - bare 'YYYY-MM-DD'   → end-of-day local (23:59:59.999). A fine due "today"
//                           is not overdue until the day fully elapses.
//   - full ISO timestamp  → honored as-is.
//   - epoch ms number     → honored as-is.
//   - Date instance       → uses .getTime().
//   - null / undefined / "" / invalid → never overdue.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * Resolve a due date string/number/Date to an end-of-day epoch ms.
 * @param {string|number|Date|null|undefined} dueDate
 * @returns {number|null}
 */
function dueDateEndOfDayMs(dueDate) {
  if (dueDate === null || dueDate === undefined || dueDate === "") return null;
  if (typeof dueDate === "number") {
    return Number.isNaN(dueDate) ? null : dueDate;
  }
  if (dueDate instanceof Date) {
    const t = dueDate.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const s = String(dueDate);
  // Bare 'YYYY-MM-DD' → 23:59:59.999 LOCAL that day.
  const bare = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (bare) {
    const d = new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]), 23, 59, 59, 999);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * True ONLY for an OUTSTANDING fine whose due date has elapsed.
 * Acknowledged / waived fines are never overdue. Missing/invalid due date is
 * never overdue.
 *
 * @param {string|null|undefined} fineStatus - 'outstanding' | 'acknowledged' | 'waived'
 * @param {string|number|Date|null|undefined} dueDate
 * @param {number} [nowMs] - injectable for testing; defaults to Date.now()
 * @returns {boolean}
 */
export function isOverdue(fineStatus, dueDate, nowMs = Date.now()) {
  if (fineStatus !== "outstanding") return false;
  const due = dueDateEndOfDayMs(dueDate);
  if (due === null) return false;
  return nowMs > due;
}

/**
 * Whole days a fine is overdue, rounded UP, clamped to >= 0. Returns 0 when
 * the fine is not overdue (per `isOverdue`) so callers can safely render
 * "Overdue by {N} days" without an extra guard.
 *
 * @param {string|null|undefined} fineStatus
 * @param {string|number|Date|null|undefined} dueDate
 * @param {number} [nowMs] - injectable; defaults to Date.now()
 * @returns {number}
 */
export function overdueDays(fineStatus, dueDate, nowMs = Date.now()) {
  if (!isOverdue(fineStatus, dueDate, nowMs)) return 0;
  const due = dueDateEndOfDayMs(dueDate);
  if (due === null) return 0;
  return Math.max(0, Math.ceil((nowMs - due) / 86400000));
}
