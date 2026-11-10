import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, refreshSession, push, setMyPin } = vi.hoisted(() => ({
  rpc: vi.fn(),
  refreshSession: vi.fn(),
  push: vi.fn(),
  setMyPin: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ rpc, auth: { refreshSession } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));
vi.mock("@/app/actions/codeLogin", () => ({ setMyPin }));

import { AdminVerification } from "../AdminVerification";
import { ResidentVerification } from "../ResidentVerification";

const RECORD = {
  id: "rec-1",
  society_id: "s1",
  society_name: "Green Meadows",
  flat_id: "a101",
  flat_label: "A-101",
  full_name: "Asha Patil",
  email: "",
  resident_type: "owner",
  status: "pending",
  source: "import",
  proposed_changes: null,
  reported_incorrect: false,
};

function respond(map) {
  rpc.mockImplementation(async (fn, args) => {
    const handler = map[fn];
    if (!handler) return { data: null, error: { message: `unexpected ${fn}` } };
    return typeof handler === "function" ? handler(args) : handler;
  });
}

beforeEach(() => {
  rpc.mockReset();
  refreshSession.mockReset().mockResolvedValue({});
  push.mockReset();
  setMyPin.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("ResidentVerification", () => {
  it("shows an empty state with a way to join by code", async () => {
    respond({ my_resident_records: { data: [], error: null } });
    render(<ResidentVerification pinSet />);
    expect(await screen.findByText("No details found for your number")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join with a society code" })).toHaveAttribute(
      "href",
      "/onboarding?manual=1",
    );
  });

  it("shows a friendly error with retry when loading fails", async () => {
    rpc.mockRejectedValueOnce(new Error("network down"));
    render(<ResidentVerification pinSet />);
    expect(await screen.findByText("We could not load your details.")).toBeInTheDocument();
    respond({ my_resident_records: { data: [RECORD], error: null } });
    fireEvent.click(screen.getByRole("button", { name: /Try again|Retry/ }));
    expect(await screen.findByText("Asha Patil")).toBeInTheDocument();
  });

  it("shows the imported details with the three choices, and confirms on the server", async () => {
    respond({
      my_resident_records: { data: [RECORD], error: null },
      resident_confirm_record: {
        data: { record_id: "rec-1", status: "verified", society_id: "s1", refresh_required: true },
        error: null,
      },
    });
    render(<ResidentVerification pinSet={false} />);
    expect(await screen.findByText("Asha Patil")).toBeInTheDocument();
    expect(screen.getByText("A-101")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report incorrect" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Everything is correct" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and join" }));

    expect(await screen.findByText("You have joined")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("resident_confirm_record", { p_record_id: "rec-1" });
    expect(refreshSession).toHaveBeenCalled();
    // No PIN yet, so the PIN form follows.
    expect(screen.getByText("Choose a 4-digit PIN")).toBeInTheDocument();
  });

  it("keeps the dialog open with the reason when confirming fails", async () => {
    respond({
      my_resident_records: { data: [RECORD], error: null },
      resident_confirm_record: { data: null, error: { message: "ALREADY_MEMBER_OTHER_FLAT" } },
    });
    render(<ResidentVerification pinSet />);
    fireEvent.click(await screen.findByRole("button", { name: "Everything is correct" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and join" }));
    expect(
      await within(dialog).findByText(
        "You are already a resident of another flat in this society.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("You have joined")).not.toBeInTheDocument();
  });

  it("sends only changed fields as a correction", async () => {
    respond({
      my_resident_records: { data: [RECORD], error: null },
      resident_submit_correction: (args) => ({
        data: { ...RECORD, status: "needs_correction", proposed_changes: args.p_changes },
        error: null,
      }),
    });
    render(<ResidentVerification pinSet />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    fireEvent.click(screen.getByRole("button", { name: "Send changes" }));
    expect(
      await screen.findByText("Change at least one detail before sending."),
    ).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("resident_submit_correction", expect.anything());

    fireEvent.click(screen.getByRole("radio", { name: "Tenant" }));
    fireEvent.click(screen.getByRole("button", { name: "Send changes" }));
    expect(
      await screen.findByText("Changes sent. The society will review them."),
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "resident_submit_correction",
      expect.objectContaining({ p_record_id: "rec-1", p_changes: { resident_type: "tenant" } }),
    );
    expect(screen.getByText("Under review")).toBeInTheDocument();
  });

  it("requires a reason to report details as incorrect", async () => {
    respond({
      my_resident_records: { data: [RECORD], error: null },
      resident_report_incorrect: {
        data: { ...RECORD, status: "needs_correction", reported_incorrect: true },
        error: null,
      },
    });
    render(<ResidentVerification pinSet />);
    fireEvent.click(await screen.findByRole("button", { name: "Report incorrect" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("Enter a reason.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /What is wrong/ }), {
      target: { value: "I do not live here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("Report sent. The society will review it.")).toBeInTheDocument();
  });
});

const MANAGER_RECORD = { ...RECORD, phone: "9876543210", batch_id: "b1" };

describe("AdminVerification", () => {
  function adminRespond(extra = {}) {
    respond({
      manager_list_resident_records: {
        data: {
          items: [MANAGER_RECORD],
          total: 1,
          limit: 25,
          offset: 0,
          counts: { all: 7, pending: 3, verified: 2, rejected: 1, needs_correction: 1 },
        },
        error: null,
      },
      setup_get_state: {
        data: {
          wings: [
            {
              name: "A",
              floors: [{ flats: [{ id: "a101", number: "101" }] }],
              unassigned_flats: [],
            },
          ],
        },
        error: null,
      },
      ...extra,
    });
  }

  it("shows counts, the records table and filters", async () => {
    adminRespond();
    render(<AdminVerification societyId="s1" />);
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Asha Patil")).toBeInTheDocument();
    expect(within(table).getByText("9876543210")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search by name or mobile" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "manager_list_resident_records",
      expect.objectContaining({ p_society_id: "s1" }),
    );
  });

  it("prepares an invitation and says plainly that nothing was sent", async () => {
    adminRespond({
      manager_prepare_resident_invite: {
        data: {
          record_id: "rec-1",
          phone: "9876543210",
          full_name: "Asha Patil",
          flat_label: "A-101",
          sent: false,
        },
        error: null,
      },
    });
    render(<AdminVerification societyId="s1" />);
    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: "Invitation" }));
    expect(await screen.findByText("Not sent automatically")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Invitation sent/i);
  });

  it("validates the add-resident form before calling the server", async () => {
    adminRespond();
    render(<AdminVerification societyId="s1" />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Add resident" }));
    const submit = await screen.findAllByRole("button", { name: "Add resident" });
    fireEvent.click(submit[submit.length - 1]);
    expect(await screen.findByText("Choose a flat.")).toBeInTheDocument();
    expect(screen.getByText("Enter a mobile number.")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("manager_add_resident_record", expect.anything());
  });

  it("shows a load error with retry", async () => {
    respond({
      manager_list_resident_records: { data: null, error: { message: "NOT_SOCIETY_MANAGER" } },
      setup_get_state: { data: { wings: [] }, error: null },
    });
    render(<AdminVerification societyId="s1" />);
    expect(await screen.findByText("We could not load the resident records.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Try again|Retry/ }).length).toBeGreaterThan(0),
    );
  });
});
