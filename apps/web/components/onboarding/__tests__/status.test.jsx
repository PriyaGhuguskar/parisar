import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, refreshSession, push } = vi.hoisted(() => ({
  rpc: vi.fn(),
  refreshSession: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    auth: { refreshSession },
    storage: { from: vi.fn() },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));

import { OnboardingStatus } from "../OnboardingStatus";

const TENANT = {
  id: "t-1",
  society_id: "s1",
  society_name: "Green Meadows",
  flat_id: "a101",
  flat_label: "A-101",
  full_name: "Ravi Kumar",
  status: "registered",
  agreement_start: "2026-12-01",
  agreement_end: "2027-11-30",
  police_status: "not_submitted",
  owner_step_skipped: false,
  created_at: "2026-11-07T05:00:00Z",
  owner_name: "Asha Patil",
  owner_phone: "9876543210",
  phone: "9123456780",
};

const REQUEST = {
  id: "hr-1",
  society_id: "s1",
  society_name: "Green Meadows",
  flat_id: "a102",
  flat_label: "A-102",
  relationship: "spouse",
  resident_type: "family_member",
  status: "pending",
  created_at: "2026-11-07T05:00:00Z",
};

function respond(map) {
  rpc.mockImplementation(async (fn, args) => {
    const handler = map[fn];
    if (!handler) return { data: null, error: { message: `unexpected ${fn}` } };
    return typeof handler === "function" ? handler(args) : handler;
  });
}

function state(overrides = {}) {
  return {
    data: {
      authority_societies: [],
      resident_records: [],
      tenant_registrations: [],
      household_requests: [],
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  rpc.mockReset();
  refreshSession.mockReset().mockResolvedValue({});
  push.mockReset();
});
afterEach(cleanup);

describe("OnboardingStatus", () => {
  it("shows an empty state when nothing is waiting", async () => {
    respond({ my_onboarding_state: state() });
    render(<OnboardingStatus userId="u1" />);
    expect(await screen.findByText("Nothing waiting")).toBeInTheDocument();
  });

  it("shows a load error with retry", async () => {
    respond({ my_onboarding_state: { data: null, error: { message: "boom" } } });
    render(<OnboardingStatus userId="u1" />);
    expect(await screen.findByText("We could not load your requests.")).toBeInTheDocument();
  });

  it("shows the tenant chain, required documents and the household request", async () => {
    respond({
      my_onboarding_state: state({ tenant_registrations: [TENANT], household_requests: [REQUEST] }),
      list_proofs: { data: [], error: null },
    });
    render(<OnboardingStatus userId="u1" />);
    expect(await screen.findByText("Tenant of A-101, Green Meadows")).toBeInTheDocument();
    expect(screen.getByText("Owner approval")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting for owner").length).toBeGreaterThan(0);
    const required = await screen.findByRole("list", { name: "Required documents" });
    expect(within(required).getByText("Rent agreement")).toBeInTheDocument();
    expect(within(required).getByText("ID proof")).toBeInTheDocument();

    expect(screen.getByText("Request to join A-102, Green Meadows")).toBeInTheDocument();
    expect(
      screen.getByText("Waiting for an owner of the flat, or the society, to approve."),
    ).toBeInTheDocument();
    // Nothing here says the person is in yet.
    expect(screen.queryByText("You have been approved")).not.toBeInTheDocument();
  });

  it("cancels a pending household request after confirmation", async () => {
    let cancelled = false;
    respond({
      my_onboarding_state: () =>
        state({
          household_requests: [{ ...REQUEST, status: cancelled ? "cancelled" : "pending" }],
        }),
      household_cancel_request: () => {
        cancelled = true;
        return { data: { request_id: "hr-1", status: "cancelled" }, error: null };
      },
    });
    render(<OnboardingStatus userId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText("Request cancelled.")).toBeInTheDocument();
    expect(await screen.findByText("You cancelled this request.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("household_cancel_request", { p_request_id: "hr-1" });
  });

  it("offers to open the app once approved, refreshing the session first", async () => {
    respond({
      my_onboarding_state: state({ household_requests: [{ ...REQUEST, status: "approved" }] }),
    });
    render(<OnboardingStatus userId="u1" />);
    expect(await screen.findByText("You have been approved")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Open Parisar" })[0]);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refreshSession).toHaveBeenCalled();
  });
});
