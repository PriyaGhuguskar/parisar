/**
 * Unit + render tests for the Phase 6 Plan 06-04 flat-action components.
 *
 * Locks the load-bearing UI-SPEC / decision contracts:
 *   - fine-overdue.js: isOverdue is TRUE only for an outstanding fine past its due date;
 *     FALSE for acknowledged/waived (overdue is never a stored status — D-04 / Pitfall 6).
 *   - FineDetailBlock renders the LOCKED no-payment footer verbatim (FLAT-05) on every
 *     fine render, AND gates Waive on isAdmin (secretary/co_secretary) — a board_member
 *     does NOT see Waive; an admin DOES (D-04, matches the admin-only waive_fine RPC).
 *   - FineStatusBadge swaps to the derived red "Overdue" label for an outstanding+past-due
 *     fine, but shows "Acknowledged" for an acknowledged fine even when past due.
 *   - FlatActionKindBadge always renders a label (Devanagari-safe, color never the sole signal).
 *   - FlatActionCard shows the "Issued by …" attribution and only shows the target-flat
 *     pill in board mode (showFlatPill).
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import en from "@parisar/i18n/locales/en/flat-actions.json";
import { render } from "@testing-library/react-native";
import { FineDetailBlock } from "../components/flat-actions/FineDetailBlock";
import { FineStatusBadge } from "../components/flat-actions/FineStatusBadge";
import { FlatActionCard } from "../components/flat-actions/FlatActionCard";
import { FlatActionKindBadge } from "../components/flat-actions/FlatActionKindBadge";
import { isOverdue, overdueDays } from "../lib/fine-overdue";

// A fixed "now" so the overdue math is deterministic.
const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const PAST = "2026-06-01"; // 14 days before NOW
const FUTURE = "2026-07-30";

// --------------------------------------------------------------------------
// fine-overdue.js — the pure derived-overdue helper (D-04)
// --------------------------------------------------------------------------
describe("fine-overdue.isOverdue", () => {
  it("is TRUE for an outstanding fine past its due date", () => {
    expect(isOverdue("outstanding", PAST, NOW)).toBe(true);
  });

  it("is FALSE for an outstanding fine still before its due date", () => {
    expect(isOverdue("outstanding", FUTURE, NOW)).toBe(false);
  });

  it("is FALSE for an acknowledged fine even when past due", () => {
    expect(isOverdue("acknowledged", PAST, NOW)).toBe(false);
  });

  it("is FALSE for a waived fine even when past due", () => {
    expect(isOverdue("waived", PAST, NOW)).toBe(false);
  });

  it("is FALSE when the due date is missing/invalid", () => {
    expect(isOverdue("outstanding", null, NOW)).toBe(false);
    expect(isOverdue("outstanding", "not-a-date", NOW)).toBe(false);
  });

  it("treats a bare 'YYYY-MM-DD' as end-of-day (due today is not yet overdue)", () => {
    // Same calendar day as NOW, earlier clock time → NOT overdue until the day ends.
    const today = "2026-06-15";
    expect(isOverdue("outstanding", today, NOW)).toBe(false);
  });
});

describe("fine-overdue.overdueDays", () => {
  // Phase 7 IN-02 — unified signature is now (fineStatus, dueDate, nowMs).
  // The prior 2-arg mobile signature dropped the status gate, which made
  // overdueDays look reasonable for an acknowledged fine. Callsites are now
  // 3-arg uniformly across mobile + web (re-exported from @parisar/api-client).
  it("returns the whole days past due (rounded up) for an outstanding fine", () => {
    expect(overdueDays("outstanding", PAST, NOW)).toBeGreaterThanOrEqual(13);
  });

  it("returns 0 when not past due", () => {
    expect(overdueDays("outstanding", FUTURE, NOW)).toBe(0);
    expect(overdueDays("outstanding", null, NOW)).toBe(0);
  });

  it("returns 0 for acknowledged / waived even when past due (status gate)", () => {
    expect(overdueDays("acknowledged", PAST, NOW)).toBe(0);
    expect(overdueDays("waived", PAST, NOW)).toBe(0);
  });
});

// --------------------------------------------------------------------------
// FineStatusBadge — derived overdue is display-only
// --------------------------------------------------------------------------
describe("FineStatusBadge", () => {
  it("renders the derived 'Overdue' label for an outstanding+past-due fine", () => {
    const { getByText } = render(
      <FineStatusBadge status="outstanding" dueDate={PAST} nowMs={NOW} />,
    );
    expect(getByText(en.flatAction.statusOverdue)).toBeTruthy();
  });

  it("renders 'Outstanding' for an outstanding fine not yet due", () => {
    const { getByText } = render(
      <FineStatusBadge status="outstanding" dueDate={FUTURE} nowMs={NOW} />,
    );
    expect(getByText(en.flatAction.statusOutstanding)).toBeTruthy();
  });

  it("never shows overdue for an acknowledged fine (shows 'Acknowledged')", () => {
    const { getByText, queryByText } = render(
      <FineStatusBadge status="acknowledged" dueDate={PAST} nowMs={NOW} />,
    );
    expect(getByText(en.flatAction.statusAcknowledged)).toBeTruthy();
    expect(queryByText(en.flatAction.statusOverdue)).toBeNull();
  });
});

// --------------------------------------------------------------------------
// FineDetailBlock — LOCKED footer (FLAT-05) + admin-only Waive (D-04)
// --------------------------------------------------------------------------
describe("FineDetailBlock", () => {
  const base = { amount: 500, dueDate: FUTURE, status: "outstanding", nowMs: NOW };

  it("renders the LOCKED no-payment footer verbatim on every fine render (FLAT-05)", () => {
    const { getByText } = render(<FineDetailBlock {...base} />);
    expect(getByText(en.flatAction.noPaymentFooter)).toBeTruthy();
  });

  it("shows the footer even for an acknowledged fine", () => {
    const { getByText } = render(<FineDetailBlock {...base} status="acknowledged" />);
    expect(getByText(en.flatAction.noPaymentFooter)).toBeTruthy();
  });

  it("does NOT show Waive for a regular board_member (non-admin)", () => {
    const { queryByText } = render(<FineDetailBlock {...base} isAdmin={false} />);
    expect(queryByText(en.flatAction.waiveCta)).toBeNull();
  });

  it("DOES show Waive for an admin (secretary/co_secretary)", () => {
    const { getByText } = render(<FineDetailBlock {...base} isAdmin />);
    expect(getByText(en.flatAction.waiveCta)).toBeTruthy();
  });

  it("shows Acknowledge for the target-flat member on an outstanding fine, with the not-a-payment hint", () => {
    const { getByText } = render(<FineDetailBlock {...base} isMemberResident />);
    expect(getByText(en.flatAction.acknowledgeCta)).toBeTruthy();
    expect(getByText(en.flatAction.acknowledgeHint)).toBeTruthy();
  });

  it("hides Acknowledge once the fine is acknowledged", () => {
    const { queryByText } = render(
      <FineDetailBlock {...base} status="acknowledged" isMemberResident />,
    );
    expect(queryByText(en.flatAction.acknowledgeCta)).toBeNull();
  });

  it("hides Waive once the fine is waived (admin sees no action row)", () => {
    const { queryByText } = render(<FineDetailBlock {...base} status="waived" isAdmin />);
    expect(queryByText(en.flatAction.waiveCta)).toBeNull();
  });
});

// --------------------------------------------------------------------------
// FlatActionKindBadge
// --------------------------------------------------------------------------
describe("FlatActionKindBadge", () => {
  it("always renders a label for each kind", () => {
    expect(
      render(<FlatActionKindBadge kind="warning" />).getByText(en.flatAction.kindWarning),
    ).toBeTruthy();
    expect(
      render(<FlatActionKindBadge kind="fine" />).getByText(en.flatAction.kindFine),
    ).toBeTruthy();
    expect(
      render(<FlatActionKindBadge kind="notify" />).getByText(en.flatAction.kindNotify),
    ).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// FlatActionCard — attribution + board-only flat pill
// --------------------------------------------------------------------------
describe("FlatActionCard", () => {
  const action = {
    id: "fa-1",
    kind: "fine",
    body: "Late maintenance payment",
    amount: 500,
    due_date: PAST,
    fine_status: "outstanding",
    created_at: "2026-06-14T10:00:00Z",
    issuer: { full_name: "Amit" },
    issuer_flat: { number: "102", wing: { name: "A" } },
    flat: { number: "203", wing: { name: "B" } },
  };

  it("renders the 'Issued by …' attribution (FLAT-02)", () => {
    const { getByText } = render(<FlatActionCard action={action} nowMs={NOW} />);
    expect(getByText("Issued by Amit (A-102)")).toBeTruthy();
  });

  it("shows the target-flat pill only in board mode (showFlatPill)", () => {
    const member = render(<FlatActionCard action={action} nowMs={NOW} />);
    expect(member.queryByText("B-203")).toBeNull();
    const board = render(<FlatActionCard action={action} showFlatPill nowMs={NOW} />);
    expect(board.getByText("B-203")).toBeTruthy();
  });

  it("shows the derived Overdue badge for an outstanding+past-due fine card", () => {
    const { getByText } = render(<FlatActionCard action={action} nowMs={NOW} />);
    expect(getByText(en.flatAction.statusOverdue)).toBeTruthy();
  });
});
