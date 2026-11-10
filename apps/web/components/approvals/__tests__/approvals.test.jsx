import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    auth: { refreshSession: vi.fn() },
    storage: { from: vi.fn() },
  }),
}));

import { ApprovalsHome } from "../ApprovalsHome";
import { HouseholdRequests } from "../HouseholdRequests";
import { OwnerTenantRequests } from "../OwnerTenantRequests";

const REQUEST = {
  id: "hr-1",
  society_id: "s1",
  flat_id: "a102",
  flat_label: "A-102",
  full_name: "Neha Patil",
  relationship: "sibling",
  resident_type: "family_member",
  message: "Asha's sister",
  phone_last4: "4321",
  created_at: "2026-11-07T05:00:00Z",
};

const TENANT = {
  id: "t-1",
  society_id: "s1",
  flat_id: "a101",
  flat_label: "A-101",
  full_name: "Ravi Kumar",
  status: "registered",
  agreement_start: "2026-12-01",
  agreement_end: "2027-11-30",
  police_status: "submitted",
  owner_step_skipped: false,
  created_at: "2026-11-07T05:00:00Z",
  owner_name: null,
  owner_phone: null,
  phone: null,
};

function respond(map) {
  rpc.mockImplementation(async (fn, args) => {
    const handler = map[fn];
    if (!handler) return { data: null, error: { message: `unexpected ${fn}` } };
    return typeof handler === "function" ? handler(args) : handler;
  });
}

beforeEach(() => rpc.mockReset());
afterEach(cleanup);

describe("HouseholdRequests", () => {
  it("shows the request with only the last four digits of the mobile", async () => {
    respond({ household_pending_for_me: { data: [REQUEST], error: null } });
    render(<HouseholdRequests />);
    expect(await screen.findByText("Neha Patil")).toBeInTheDocument();
    expect(screen.getByText("Mobile ending 4321")).toBeInTheDocument();
    expect(screen.getByText("A-102 · Sibling · Family member")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{10}/);
  });

  it("approves after confirmation and reloads", async () => {
    let decided = false;
    respond({
      household_pending_for_me: () => ({ data: decided ? [] : [REQUEST], error: null }),
      household_decide_request: () => {
        decided = true;
        return {
          data: { request_id: "hr-1", status: "approved", membership_id: "m1" },
          error: null,
        };
      },
    });
    render(<HouseholdRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Add Neha Patil to A-102?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Neha Patil approved.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "household_decide_request",
      expect.objectContaining({ p_request_id: "hr-1", p_approve: true }),
    );
    expect(await screen.findByText("No household requests.")).toBeInTheDocument();
  });

  it("needs a reason to reject, and keeps the dialog open on a server error", async () => {
    respond({
      household_pending_for_me: { data: [REQUEST], error: null },
      household_decide_request: { data: null, error: { message: "REQUEST_CLOSED" } },
    });
    render(<HouseholdRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect((await within(dialog).findAllByText("Enter a reason.")).length).toBeGreaterThan(0);
    expect(rpc).not.toHaveBeenCalledWith("household_decide_request", expect.anything());

    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Reason/ }), {
      target: { value: "Not known to us" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(
      await within(dialog).findByText("This request has already been decided."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Neha Patil turned down.")).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    respond({ household_pending_for_me: { data: [], error: null } });
    render(<HouseholdRequests />);
    expect(await screen.findByText("No household requests.")).toBeInTheDocument();
  });

  it("shows an error state when the list cannot load", async () => {
    respond({ household_pending_for_me: { data: null, error: { message: "upstream timeout" } } });
    render(<HouseholdRequests />);
    expect(await screen.findByText("We could not load these requests.")).toBeInTheDocument();
  });
});

describe("OwnerTenantRequests", () => {
  it("shows the tenant, the approval chain and no phone numbers", async () => {
    respond({ owner_list_tenant_requests: { data: [TENANT], error: null } });
    render(<OwnerTenantRequests />);
    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("Tenant for A-101")).toBeInTheDocument();
    expect(screen.getByText("Owner approval")).toBeInTheDocument();
    expect(screen.getByText("Society approval")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting for owner").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\d{10}/);
  });
});

describe("ApprovalsHome", () => {
  it("shows owner and society sections only to those who can act on them", async () => {
    respond({
      household_pending_for_me: { data: [], error: null },
      owner_list_tenant_requests: { data: [], error: null },
      manager_list_tenants: { data: { items: [], total: 0, limit: 100, offset: 0 }, error: null },
    });
    const { rerender } = render(
      <ApprovalsHome societyId="s1" userId="u1" isManager={false} isOwner={false} />,
    );
    expect(screen.getByRole("heading", { name: "Household requests" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Tenants for your flat" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Tenant approvals for the society" }),
    ).not.toBeInTheDocument();

    rerender(<ApprovalsHome societyId="s1" userId="u1" isManager isOwner />);
    expect(screen.getByRole("heading", { name: "Tenants for your flat" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tenant approvals for the society" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No tenant requests waiting for the society."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "manager_list_tenants",
        expect.objectContaining({ p_society_id: "s1" }),
      ),
    );
  });
});
