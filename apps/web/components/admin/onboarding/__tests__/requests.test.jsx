import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ rpc }),
}));

import { ConnectRequestDetail } from "../ConnectRequestDetail";
import { ConnectRequestsSection } from "../ConnectRequestsSection";

const OPEN_REQUEST = {
  id: "req-1",
  request_code: "PR-8K9M-6K43",
  society_name: "Green Meadows",
  contact_name: "Asha Patil",
  phone: "+919876543210",
  email: "asha@example.com",
  authority_numbers: [
    { name: "Asha Patil", phone: "9876543210" },
    { name: null, phone: "9812345678" },
  ],
  status: "call_scheduled",
  call_now: false,
  preferred_at: "2026-11-08T11:00:00Z",
  scheduled_at: "2026-11-08T11:00:00Z",
  alternate_at: null,
  message: "Two wings, 80 flats",
  reschedule_count: 0,
  created_at: "2026-11-07T05:00:00Z",
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

describe("ConnectRequestsSection", () => {
  it("lists requests with every column and working row actions", async () => {
    respond({
      admin_list_connect_requests: {
        data: { items: [OPEN_REQUEST], total: 1, limit: 20, offset: 0 },
      },
    });
    const onView = vi.fn();
    render(<ConnectRequestsSection onView={onView} />);

    const table = await screen.findByRole("table");
    const t = within(table);
    expect(t.getByText("Green Meadows")).toBeInTheDocument();
    expect(t.getByText(/PR-8K9M-6K43/)).toBeInTheDocument();
    expect(t.getByText("Asha Patil")).toBeInTheDocument();
    expect(t.getByText("+91 98765 43210")).toBeInTheDocument();
    for (const header of ["Society", "Contact", "Preferred call", "Status"]) {
      expect(t.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(t.getByRole("link", { name: "Call Asha Patil" })).toHaveAttribute(
      "href",
      "tel:+919876543210",
    );

    fireEvent.click(t.getByRole("button", { name: "View details" }));
    expect(onView).toHaveBeenCalledWith(OPEN_REQUEST);
    expect(rpc).toHaveBeenCalledWith(
      "admin_list_connect_requests",
      expect.objectContaining({ p_limit: 20, p_offset: 0, p_status: null }),
    );
  });

  it("sends the status filter to the RPC", async () => {
    respond({
      admin_list_connect_requests: {
        data: { items: [OPEN_REQUEST], total: 1, limit: 20, offset: 0 },
      },
    });
    render(<ConnectRequestsSection onView={vi.fn()} />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } });
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith(
        "admin_list_connect_requests",
        expect.objectContaining({ p_status: "open", p_offset: 0 }),
      ),
    );
  });

  it("shows the empty state", async () => {
    respond({
      admin_list_connect_requests: { data: { items: [], total: 0, limit: 20, offset: 0 } },
    });
    render(<ConnectRequestsSection onView={vi.fn()} />);
    expect(await screen.findByText("No requests yet")).toBeInTheDocument();
  });

  it("shows a friendly error with retry, never the raw message", async () => {
    respond({ admin_list_connect_requests: { data: null, error: { message: "fetch failed" } } });
    render(<ConnectRequestsSection onView={vi.fn()} />);
    expect(await screen.findByText("We couldn't load the requests.")).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/)).toBeNull();
    respond({
      admin_list_connect_requests: { data: { items: [], total: 0, limit: 20, offset: 0 } },
    });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("No requests yet")).toBeInTheDocument();
  });
});

describe("ConnectRequestDetail", () => {
  function renderDetail(request = OPEN_REQUEST, extra = {}) {
    const props = {
      requestId: request.id,
      onClose: vi.fn(),
      onChanged: vi.fn(),
      onRegister: vi.fn(),
      onOpenSociety: vi.fn(),
      ...extra,
    };
    render(<ConnectRequestDetail {...props} />);
    return props;
  }

  it("shows the request, its numbers and every action while open", async () => {
    respond({ admin_get_connect_request: { data: { ...OPEN_REQUEST, history: [] } } });
    const props = renderDetail();
    expect(await screen.findByRole("heading", { name: "Green Meadows" })).toBeInTheDocument();
    expect(screen.getByText("Request PR-8K9M-6K43")).toBeInTheDocument();
    expect(screen.getByText("Name not given")).toBeInTheDocument();
    expect(screen.getByText("Two wings, 80 flats")).toBeInTheDocument();
    for (const name of ["Mark as called", "Reschedule", "Reject"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Register society" }));
    expect(props.onRegister).toHaveBeenCalledWith(expect.objectContaining({ id: "req-1" }));
  });

  it("offers no actions on a closed request", async () => {
    respond({
      admin_get_connect_request: {
        data: {
          ...OPEN_REQUEST,
          status: "registered",
          society: { id: "soc-1", name: "Green Meadows CHS", code: "GRN123" },
          history: [
            {
              action: "connect.registered",
              actor_name: "Ravi",
              payload: {},
              at: "2026-11-07T06:00:00Z",
            },
          ],
        },
      },
    });
    const props = renderDetail();
    expect(
      await screen.findByText("This request is closed, so it can't be changed."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Register society" })).toBeNull();
    expect(screen.getByText("Society registered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open society" }));
    expect(props.onOpenSociety).toHaveBeenCalledWith("soc-1");
  });

  it("requires a reason before rejecting, then rejects and reports it", async () => {
    let rejected = false;
    respond({
      admin_get_connect_request: () => ({
        data: { ...OPEN_REQUEST, status: rejected ? "rejected" : "call_scheduled", history: [] },
      }),
      admin_reject_connect_request: (args) => {
        rejected = true;
        return { data: { ...OPEN_REQUEST, status: "rejected", rejected_reason: args.p_reason } };
      },
    });
    const props = renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(
      await within(dialog).findAllByText("Give a reason of 3 to 500 characters."),
    ).not.toHaveLength(0);
    expect(rpc).not.toHaveBeenCalledWith("admin_reject_connect_request", expect.anything());

    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "Duplicate request" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(await screen.findByText("Request rejected.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("admin_reject_connect_request", {
      p_request_id: "req-1",
      p_reason: "Duplicate request",
    });
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("keeps the dialog open with a translated message when the server refuses", async () => {
    respond({
      admin_get_connect_request: { data: { ...OPEN_REQUEST, history: [] } },
      admin_mark_connect_called: { data: null, error: { message: "REQUEST_CLOSED" } },
    });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Mark as called" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark as called" }));
    expect(await within(dialog).findByText("This request is already closed.")).toBeInTheDocument();
    expect(screen.queryByText("Marked as called.")).toBeNull();
  });

  it("marks a request as called with the note and reports it", async () => {
    let called = false;
    respond({
      admin_get_connect_request: () => ({
        data: { ...OPEN_REQUEST, status: called ? "contacted" : "call_scheduled", history: [] },
      }),
      admin_mark_connect_called: () => {
        called = true;
        return { data: { ...OPEN_REQUEST, status: "contacted" } };
      },
    });
    const props = renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Mark as called" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "  Spoke to Asha, demo on Monday  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark as called" }));
    expect(await screen.findByText("Marked as called.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("admin_mark_connect_called", {
      p_request_id: "req-1",
      p_note: "Spoke to Asha, demo on Monday",
    });
    expect(props.onChanged).toHaveBeenCalled();
    // A contacted request is still open, so its actions stay available.
    expect(await screen.findByRole("button", { name: "Reschedule" })).toBeInTheDocument();
  });

  it("validates the reschedule before calling the RPC", async () => {
    respond({ admin_get_connect_request: { data: { ...OPEN_REQUEST, history: [] } } });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new time" }));
    expect(await within(dialog).findByText("Choose a date.")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose a time.")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("admin_reschedule_connect_request", expect.anything());
  });

  it("shows an error state when the request cannot be loaded", async () => {
    respond({ admin_get_connect_request: { data: null, error: { message: "REQUEST_NOT_FOUND" } } });
    renderDetail();
    expect(await screen.findByText("This request no longer exists.")).toBeInTheDocument();
  });
});
