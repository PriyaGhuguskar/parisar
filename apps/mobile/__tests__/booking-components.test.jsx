/**
 * Unit tests for the Phase 5 Plan 05-05 booking + settings components.
 *
 * Locks the load-bearing UI-SPEC contracts:
 *   - BookingStatusBadge maps pending → AMBER (#fffbeb / #f59e0b), NOT neutral (DD-6),
 *     and always renders a label.
 *   - validateRange (TimeSlotPicker) enforces end>start, <=4h, >=1h lead, within
 *     amenity open/close hours, and emits ISO startsAt/endsAt when valid.
 *   - ApproverBanner renders "Approved by …" / "Rejected by …" with the right tint.
 *   - BookingCard renders the status badge + time range + (board mode) requested-by.
 *   - PreferenceToggleRow uses INVERTED semantics (DD-11): checked = !muted; toggling
 *     OFF reports muted=true.
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

// The native datetimepicker is not needed for these assertions; stub it so the
// TimeSlotPicker module imports cleanly under jest without a native binding.
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

import { ApproverBanner } from "../components/bookings/ApproverBanner";
import { BookingCard } from "../components/bookings/BookingCard";
import { BookingStatusBadge } from "../components/bookings/BookingStatusBadge";
import { validateRange } from "../components/bookings/TimeSlotPicker";
import { PreferenceToggleRow } from "../components/settings/PreferenceToggleRow";

// --------------------------------------------------------------------------
// BookingStatusBadge (DD-6 — pending is AMBER, not neutral)
// --------------------------------------------------------------------------
describe("BookingStatusBadge", () => {
  it("renders the pending label", () => {
    const { getByText } = render(<BookingStatusBadge status="pending" />);
    expect(getByText("Pending")).toBeTruthy();
  });

  it("pending pill uses amber text (#f59e0b), NOT neutral", () => {
    const { getByText } = render(<BookingStatusBadge status="pending" />);
    const label = getByText("Pending");
    const flat = [].concat(label.props.style).reduce((a, s) => ({ ...a, ...s }), {});
    expect(flat.color).toBe("#f59e0b");
  });

  it("approved + rejected always render a label", () => {
    expect(render(<BookingStatusBadge status="approved" />).getByText("Approved")).toBeTruthy();
    expect(render(<BookingStatusBadge status="rejected" />).getByText("Rejected")).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// validateRange — the client-side booking-window enforcement (BOOK-01)
// --------------------------------------------------------------------------
describe("validateRange", () => {
  // Phase 7 Plan 07-05 retrofit: validateRange now accepts a `t` function for
  // localized error messages. Provide one that resolves keys against the actual
  // English bookings shard so the existing regex assertions still pass.
  const enBookings = require("@parisar/i18n/locales/en/bookings.json");
  function t(key, params) {
    const segs = String(key).split(".");
    let cur = enBookings;
    for (const seg of segs) {
      if (cur && typeof cur === "object" && seg in cur) cur = cur[seg];
      else return key;
    }
    if (typeof cur !== "string") return key;
    if (!params) return cur;
    return cur.replace(/\{\{(\w+)\}\}/g, (m, name) =>
      params[name] !== undefined && params[name] !== null ? String(params[name]) : m,
    );
  }

  const amenity = { open_time: "06:00:00", close_time: "22:00:00" };
  const today = new Date();

  function at(h, m = 0) {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // A date 3 days out keeps us inside the 30d horizon and clear of the 1h lead.
  const date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  it("is invalid (no error) until all three fields are chosen", () => {
    const r = validateRange({ date: null, start: null, end: null, amenity, t });
    expect(r.valid).toBe(false);
    expect(r.error).toBeNull();
  });

  it("rejects end <= start with timeOrderError", () => {
    const r = validateRange({ date, start: at(20), end: at(18), amenity, t });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/after start/i);
  });

  it("rejects a duration > 4h with durationError", () => {
    const r = validateRange({ date, start: at(10), end: at(15), amenity, t });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/4 hours/i);
  });

  it("rejects a slot outside the amenity hours with hoursError", () => {
    const r = validateRange({ date, start: at(5), end: at(6), amenity, t });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/within/i);
  });

  it("rejects a slot less than 1h ahead with leadTimeError", () => {
    // Start 30 minutes from now (same day) → fails the >=1h lead check.
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const start = new Date(soon);
    const end = new Date(soon.getTime() + 60 * 60 * 1000);
    const wideAmenity = { open_time: "00:00:00", close_time: "23:59:00" };
    const r = validateRange({ date: soon, start, end, amenity: wideAmenity, t });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/1 hour ahead/i);
  });

  it("accepts a valid 2h slot inside hours and emits ISO startsAt/endsAt", () => {
    const r = validateRange({ date, start: at(18), end: at(20), amenity, t });
    expect(r.valid).toBe(true);
    expect(r.error).toBeNull();
    expect(typeof r.startsAt).toBe("string");
    expect(typeof r.endsAt).toBe("string");
    expect(new Date(r.endsAt) > new Date(r.startsAt)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// ApproverBanner (BOOK-06 attribution)
// --------------------------------------------------------------------------
describe("ApproverBanner", () => {
  it("renders 'Approved by {name} ({flat})'", () => {
    const { getByText } = render(<ApproverBanner kind="approved" name="Amit" flat="A-102" />);
    expect(getByText("Approved by Amit (A-102)")).toBeTruthy();
  });

  it("renders 'Rejected by {name} ({flat})'", () => {
    const { getByText } = render(<ApproverBanner kind="rejected" name="Sara" flat="C-7" />);
    expect(getByText("Rejected by Sara (C-7)")).toBeTruthy();
  });

  it("renders nothing when there is no name", () => {
    const { toJSON } = render(<ApproverBanner kind="approved" name={null} flat="A-1" />);
    expect(toJSON()).toBeNull();
  });
});

// --------------------------------------------------------------------------
// BookingCard
// --------------------------------------------------------------------------
describe("BookingCard", () => {
  const baseBooking = {
    id: "b1",
    status: "pending",
    purpose: "Birthday party",
    time_range: "[2026-06-18 18:00:00+00,2026-06-18 20:00:00+00)",
    amenity: { name: "Clubhouse" },
    requester: { full_name: "Rahul" },
    requester_flat: { number: "203", wing: { name: "B" } },
  };

  it("renders the amenity name + status badge", () => {
    const { getByText } = render(<BookingCard booking={baseBooking} />);
    expect(getByText("Clubhouse")).toBeTruthy();
    expect(getByText("Pending")).toBeTruthy();
  });

  it("shows 'Requested by …' only in board mode", () => {
    const member = render(<BookingCard booking={baseBooking} boardMode={false} />);
    expect(member.queryByText(/Requested by/)).toBeNull();
    const board = render(<BookingCard booking={baseBooking} boardMode />);
    expect(board.getByText("Requested by Rahul (B-203)")).toBeTruthy();
  });

  it("shows the rejection reason for a rejected booking", () => {
    const rejected = {
      ...baseBooking,
      status: "rejected",
      rejection_reason: "Already booked that evening",
      rejecter: { full_name: "Amit" },
      rejecter_flat: { number: "102", wing: { name: "A" } },
    };
    const { getByText } = render(<BookingCard booking={rejected} boardMode />);
    expect(getByText("Already booked that evening")).toBeTruthy();
    expect(getByText("Rejected by Amit (A-102)")).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// PreferenceToggleRow (DD-11 — inverted mute semantics)
// --------------------------------------------------------------------------
describe("PreferenceToggleRow", () => {
  function Icon() {
    return null;
  }

  it("checked = NOT muted (a muted category shows the switch OFF)", () => {
    const { getByRole } = render(
      <PreferenceToggleRow icon={Icon} label="Polls" muted onChangeMuted={() => {}} />,
    );
    const sw = getByRole("switch");
    expect(sw.props.value).toBe(false); // muted → OFF
  });

  it("an un-muted category shows the switch ON", () => {
    const { getByRole } = render(
      <PreferenceToggleRow icon={Icon} label="Polls" muted={false} onChangeMuted={() => {}} />,
    );
    expect(getByRole("switch").props.value).toBe(true);
  });

  it("toggling OFF reports muted=true (inverted write)", () => {
    const onChangeMuted = jest.fn();
    const { getByRole } = render(
      <PreferenceToggleRow icon={Icon} label="Polls" muted={false} onChangeMuted={onChangeMuted} />,
    );
    fireEvent(getByRole("switch"), "valueChange", false); // user switches OFF
    expect(onChangeMuted).toHaveBeenCalledWith(true);
  });

  it("toggling ON reports muted=false", () => {
    const onChangeMuted = jest.fn();
    const { getByRole } = render(
      <PreferenceToggleRow icon={Icon} label="Polls" muted onChangeMuted={onChangeMuted} />,
    );
    fireEvent(getByRole("switch"), "valueChange", true); // user switches ON
    expect(onChangeMuted).toHaveBeenCalledWith(false);
  });
});
