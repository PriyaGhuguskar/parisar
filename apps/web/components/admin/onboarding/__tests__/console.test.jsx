import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, createPlatformUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createPlatformUser: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ rpc }),
}));
vi.mock("@/app/actions/platformUsers", () => ({
  createPlatformUser,
  approveSalesApplication: vi.fn(),
  listPlatformUsers: vi.fn(async () => ({ users: [] })),
  revokePlatformUser: vi.fn(),
}));

import { AdminConsole } from "../../AdminConsole";

const METRICS = {
  total_societies: 12,
  active_societies: 10,
  pending_requests: 4,
  pending_calls: 3,
  total_residents: 1520,
};
const REQUEST = {
  id: "req-1",
  request_code: "PR-AAAA-BBBB",
  society_name: "Lake View",
  contact_name: "Meera Joshi",
  phone: "+919822012345",
  authority_numbers: [],
  status: "new",
  call_now: true,
};

function respond(map) {
  rpc.mockImplementation(async (fn, args) => {
    const handler = map[fn];
    if (!handler) return { data: null, error: { message: `unexpected ${fn}` } };
    return typeof handler === "function" ? handler(args) : handler;
  });
}

const DEFAULT = {
  admin_onboarding_metrics: { data: METRICS },
  admin_list_connect_requests: { data: { items: [REQUEST], total: 1, limit: 3, offset: 0 } },
  admin_get_connect_request: { data: { ...REQUEST, history: [] } },
};

beforeEach(() => {
  rpc.mockReset();
  createPlatformUser.mockReset();
});
afterEach(cleanup);

describe("AdminConsole overview", () => {
  it("shows the five onboarding metrics and the next call", async () => {
    respond(DEFAULT);
    render(<AdminConsole isAdmin initialStats={{ mrr: 4500, past_due: 1 }} />);
    expect(await screen.findByText("1,520")).toBeInTheDocument();
    for (const label of [
      "Total societies",
      "Active societies",
      "Pending requests",
      "Pending calls",
      "Total residents",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(await screen.findByText("Lake View")).toBeInTheDocument();
    expect(screen.getByText("Monthly recurring")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "admin_list_connect_requests",
      expect.objectContaining({ p_status: "open", p_limit: 3 }),
    );
  });

  it("hides billing and appointing from sales", async () => {
    respond(DEFAULT);
    render(<AdminConsole isAdmin={false} initialStats={{ mrr: null, past_due: null }} />);
    expect(await screen.findByText("Total societies")).toBeInTheDocument();
    expect(screen.queryByText("Monthly recurring")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create staff" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create sales" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Register society" }).length).toBeGreaterThan(0);
  });

  it("shows an error state with retry when metrics fail", async () => {
    respond({ ...DEFAULT, admin_onboarding_metrics: { data: null, error: { message: "down" } } });
    render(<AdminConsole />);
    expect(await screen.findByText("We couldn't load the onboarding numbers.")).toBeInTheDocument();
  });

  it("opens a request's detail drawer from the next calls", async () => {
    respond(DEFAULT);
    render(<AdminConsole />);
    fireEvent.click(await screen.findByRole("button", { name: /Lake View/ }));
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Request PR-AAAA-BBBB")).toBeInTheDocument();
  });

  it("opens the requests table from the sidebar section", async () => {
    respond(DEFAULT);
    render(<AdminConsole />);
    const chips = await screen.findAllByRole("button", { name: "Society requests" });
    fireEvent.click(chips[chips.length - 1]);
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});

describe("Appointing platform users", () => {
  it("validates the number and reports the appointment honestly", async () => {
    respond(DEFAULT);
    createPlatformUser.mockResolvedValue({ ok: true, role: "staff" });
    render(<AdminConsole isAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Create staff" }));
    const dialog = await screen.findByRole("dialog", { name: "Create staff" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Appoint" }));
    expect(
      await within(dialog).findByText("Enter a 10-digit mobile number starting with 6 to 9."),
    ).toBeInTheDocument();
    expect(createPlatformUser).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/^Mobile number/), {
      target: { value: "9822012345" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Appoint" }));
    await waitFor(() =>
      expect(createPlatformUser).toHaveBeenCalledWith({
        phone: "9822012345",
        name: undefined,
        role: "staff",
      }),
    );
    expect(await within(dialog).findByText(/is now Parisar staff/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Nothing was sent to them/)).toBeInTheDocument();
  });

  it("shows a translated refusal", async () => {
    respond(DEFAULT);
    createPlatformUser.mockResolvedValue({ error: "NOT_PLATFORM_ADMIN" });
    render(<AdminConsole isAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Create sales" }));
    const dialog = await screen.findByRole("dialog", { name: "Create sales" });
    fireEvent.change(within(dialog).getByLabelText(/^Mobile number/), {
      target: { value: "9822012345" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Appoint" }));
    expect(
      await within(dialog).findByText("Only a Parisar admin can do this."),
    ).toBeInTheDocument();
  });
});
