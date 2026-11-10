// Role dashboards: society admin, resident and security overviews render real
// counts, hide switched-off modules, and offer a retry when the load fails.
// JavaScript only — no TypeScript per CLAUDE.md.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  societyAdminDashboard: vi.fn(),
  residentDashboard: vi.fn(),
  securityDashboard: vi.fn(),
}));
vi.mock("@parisar/api-client", () => api);
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("@/components/sos/SosButton", () => ({
  SosButton: () => <button type="button">SOS</button>,
}));

import { SecurityOverview, securityTiles } from "../../guard/SecurityOverview";
import { ResidentOverview, residentMetricCards } from "../ResidentOverview";
import { adminMetricCards, SocietyAdminOverview } from "../SocietyAdminOverview";

const ALL_ON = () => true;
const ADMIN = {
  flats: 36,
  occupied: 3,
  vacant: 33,
  under_construction: 0,
  maintenance: 0,
  residents: 4,
  pending_requests: { memberships: 1, household: 2, tenants: 0 },
  pending_verification: 5,
  open_complaints: 7,
  todays_visitors: 9,
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

function cardValue(label) {
  const card = screen.getByText(label).closest("a, div[class*='rounded-xl']");
  return card?.querySelector(".type-metric")?.textContent;
}

describe("SocietyAdminOverview", () => {
  it("shows every brief metric from the server result", () => {
    render(<SocietyAdminOverview societyId="s1" initial={{ data: ADMIN }} isEnabled={ALL_ON} />);
    expect(cardValue("Total residents")).toBe("4");
    expect(cardValue("Total flats")).toBe("36");
    expect(cardValue("Occupied flats")).toBe("3");
    expect(cardValue("Vacant flats")).toBe("33");
    expect(cardValue("Pending resident requests")).toBe("3");
    expect(cardValue("Pending verification")).toBe("5");
    expect(cardValue("Open complaints")).toBe("7");
    expect(cardValue("Today's visitors")).toBe("9");
    expect(screen.getByText("Join 1 · Household 2 · Tenant 0")).toBeInTheDocument();
    expect(api.societyAdminDashboard).not.toHaveBeenCalled();
  });

  it("links each actionable card to its screen", () => {
    render(<SocietyAdminOverview societyId="s1" initial={{ data: ADMIN }} isEnabled={ALL_ON} />);
    expect(screen.getByText("Pending verification").closest("a")).toHaveAttribute(
      "href",
      "/verification/admin",
    );
    expect(screen.getByText("Pending resident requests").closest("a")).toHaveAttribute(
      "href",
      "/approvals",
    );
  });

  it("leaves out cards for switched-off modules", () => {
    const cards = adminMetricCards(
      ADMIN,
      (k) => k !== "visitors",
      (k) => k,
    );
    expect(cards.map((c) => c.id)).not.toContain("todaysVisitors");
    expect(cards.map((c) => c.id)).toContain("openComplaints");
  });

  it("points to setup when the society has no flats", () => {
    render(
      <SocietyAdminOverview
        societyId="s1"
        initial={{ data: { ...ADMIN, flats: 0, occupied: 0, vacant: 0 } }}
        isEnabled={ALL_ON}
      />,
    );
    expect(screen.getByText("No flats yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/setup");
  });

  it("shows an error with a working retry", async () => {
    api.societyAdminDashboard.mockResolvedValue(ADMIN);
    render(<SocietyAdminOverview societyId="s1" initial={{ error: true }} isEnabled={ALL_ON} />);
    expect(screen.getByText("We couldn't load the society overview.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await waitFor(() => expect(cardValue("Total flats")).toBe("36"));
    expect(api.societyAdminDashboard).toHaveBeenCalledWith({}, "s1");
  });
});

const RESIDENT = {
  society_id: "s1",
  role: "member",
  society_title: "treasurer",
  resident_type: "owner",
  flat_id: "f1",
  flat_label: "A-101",
  household_members: 3,
  my_open_complaints: 1,
  pending_visitors: 2,
  upcoming_bookings: 0,
  open_polls: 1,
  notices_last_7_days: 4,
  pending_household_requests: 1,
  pending_tenant_approvals: 0,
};

describe("ResidentOverview", () => {
  it("shows the flat, the counts and emergency", () => {
    render(<ResidentOverview societyId="s1" initial={{ data: RESIDENT }} isEnabled={ALL_ON} />);
    expect(screen.getByText("A-101")).toBeInTheDocument();
    expect(screen.getByText("Owner · Treasurer · 3 in household")).toBeInTheDocument();
    expect(cardValue("Visitors waiting")).toBe("2");
    expect(cardValue("Notices this week")).toBe("4");
    expect(screen.getByRole("button", { name: "SOS" })).toBeInTheDocument();
    expect(screen.getByText("Household requests waiting for you: 1")).toBeInTheDocument();
    expect(screen.queryByText(/Tenant requests waiting/)).not.toBeInTheDocument();
  });

  it("says so when no flat is linked", () => {
    render(
      <ResidentOverview
        societyId="s1"
        initial={{ data: { ...RESIDENT, flat_id: null, flat_label: null } }}
        isEnabled={ALL_ON}
      />,
    );
    expect(screen.getByText("No flat is linked to your account yet.")).toBeInTheDocument();
  });

  it("hides switched-off modules, including emergency", () => {
    const onlyCore = (k) => ["notices", "complaints"].includes(k);
    render(<ResidentOverview societyId="s1" initial={{ data: RESIDENT }} isEnabled={onlyCore} />);
    expect(screen.queryByText("Visitors waiting")).not.toBeInTheDocument();
    expect(screen.queryByText("Open polls")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SOS" })).not.toBeInTheDocument();
    expect(residentMetricCards(RESIDENT, onlyCore).map((c) => c.id)).toEqual([
      "myComplaints",
      "noticesWeek",
    ]);
  });

  it("shows an error state when the load failed", () => {
    render(<ResidentOverview societyId="s1" initial={{ error: true }} isEnabled={ALL_ON} />);
    expect(screen.getByText("We couldn't load your home summary.")).toBeInTheDocument();
  });
});

describe("SecurityOverview", () => {
  it("loads today's numbers into large tiles", async () => {
    api.securityDashboard.mockResolvedValue({
      todays_visitors: 12,
      pending: 2,
      approved: 9,
      denied: 1,
      active_sos: 0,
    });
    render(<SecurityOverview societyId="s1" onNewVisitor={() => {}} />);
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByText("Allowed in")).toBeInTheDocument();
    expect(screen.getByText("Emergency alerts")).toBeInTheDocument();
  });

  it("New visitor is a large button that calls back", async () => {
    api.securityDashboard.mockResolvedValue({
      todays_visitors: 0,
      pending: 0,
      approved: 0,
      active_sos: 0,
    });
    const onNewVisitor = vi.fn();
    render(<SecurityOverview societyId="s1" onNewVisitor={onNewVisitor} />);
    const button = screen.getByRole("button", { name: "New visitor" });
    expect(button.className).toMatch(/min-h-16/);
    fireEvent.click(button);
    expect(onNewVisitor).toHaveBeenCalled();
    await waitFor(() => expect(api.securityDashboard).toHaveBeenCalled());
  });

  it("shows an error with retry when the guard check fails", async () => {
    api.securityDashboard.mockResolvedValue({ error: "NOT_A_GUARD" });
    render(<SecurityOverview societyId="s1" onNewVisitor={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("We couldn't load today's numbers.")).toBeInTheDocument(),
    );
  });

  it("marks active SOS alerts as danger", () => {
    const tiles = securityTiles({ active_sos: 2 });
    expect(tiles.find((t) => t.id === "emergency").tone).toBe("danger");
  });
});
