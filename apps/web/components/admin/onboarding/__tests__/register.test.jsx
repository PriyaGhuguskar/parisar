import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

// jsdom has no PointerEvent; Base UI's Switch builds one on click.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class PointerEvent extends MouseEvent {};
}
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ rpc }),
}));

import { RegistrationPane } from "../../society-detail/RegistrationPane";
import { RegisterSocietySection } from "../RegisterSocietySection";

const REQUEST = {
  id: "req-1",
  request_code: "PR-8K9M-6K43",
  society_name: "Green Meadows",
  contact_name: "Asha Patil",
  phone: "+919876543210",
  authority_numbers: [
    { name: "Asha Patil", phone: "9876543210" },
    { name: null, phone: "9812345678" },
  ],
  status: "contacted",
};

const CATALOGUE = {
  features: [
    {
      key: "notices",
      name: "Notice board",
      description: "Posts",
      price_monthly: 0,
      is_core: true,
      has_module: true,
    },
    {
      key: "visitors",
      name: "Visitors",
      description: "Gate log",
      price_monthly: 199,
      is_core: false,
      has_module: true,
    },
  ],
  unavailable: [{ key: "parking", name: "Parking", reason: "No module", has_module: false }],
};

function respond(map) {
  rpc.mockImplementation(async (fn, args) => {
    const handler = map[fn];
    if (!handler) return { data: null, error: { message: `unexpected ${fn}` } };
    return typeof handler === "function" ? handler(args) : handler;
  });
}

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
}

beforeEach(() => rpc.mockReset());
afterEach(cleanup);

describe("RegisterSocietySection", () => {
  it("prefills from the request and locks the request's numbers", async () => {
    respond({ admin_feature_catalogue: { data: CATALOGUE } });
    render(<RegisterSocietySection request={REQUEST} onOpenSociety={vi.fn()} />);
    expect(screen.getByLabelText(/^Society name/)).toHaveValue("Green Meadows");
    expect(screen.getByText(/From request PR-8K9M-6K43/)).toBeInTheDocument();
    const rows = screen.getAllByTestId("authority-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("+91 98765 43210")).toBeInTheDocument();
    expect(within(rows[1]).getByText("+91 98123 45678")).toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(await screen.findByText("Visitors")).toBeInTheDocument();
    expect(screen.getByText("Included")).toBeInTheDocument();
    expect(screen.getByText("Parking")).toBeInTheDocument();
  });

  it("shows field errors and does not call the RPC when the form is incomplete", async () => {
    respond({ admin_feature_catalogue: { data: CATALOGUE } });
    render(<RegisterSocietySection request={REQUEST} onOpenSociety={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Register society" }));
    expect(await screen.findByText("Check the highlighted fields.")).toBeInTheDocument();
    expect(
      screen.getByText("Enter the street address (at least 5 characters)."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("PIN code must be 6 digits and can't start with 0."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter a name of 2 to 80 characters.")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("admin_register_society", expect.anything());
  });

  it("registers with the request, chosen features and names, then shows the code", async () => {
    respond({
      admin_feature_catalogue: { data: CATALOGUE },
      admin_register_society: {
        data: {
          society_id: "soc-1",
          code: "GRN4K2",
          authority_count: 2,
          request_id: "req-1",
          features: ["visitors"],
        },
      },
      get_society_registration: {
        data: { id: "soc-1", service_status: "active", setup_completed_at: null },
      },
    });
    const onRegistered = vi.fn();
    const onOpenSociety = vi.fn();
    render(
      <RegisterSocietySection
        request={REQUEST}
        onRegistered={onRegistered}
        onOpenSociety={onOpenSociety}
      />,
    );
    fill("Street address", "12 MG Road, Shivajinagar");
    fill("City", "Pune");
    fireEvent.change(screen.getByLabelText(/^State/), { target: { value: "Maharashtra" } });
    fill("PIN code", "411005");
    const rows = screen.getAllByTestId("authority-row");
    fireEvent.change(within(rows[1]).getByLabelText(/^Name/), {
      target: { value: "Ravi Kulkarni" },
    });
    fireEvent.click(await screen.findByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Register society" }));

    expect(await screen.findByText("Green Meadows is registered")).toBeInTheDocument();
    expect(screen.getByTestId("society-code")).toHaveTextContent("GRN4K2");
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    expect(screen.getByText("Request PR-8K9M-6K43 is now marked registered.")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText(/Invitation sent/i)).toBeNull();

    expect(rpc).toHaveBeenCalledWith(
      "admin_register_society",
      expect.objectContaining({
        p_name: "Green Meadows",
        p_request_id: "req-1",
        p_state: "Maharashtra",
        p_features: ["visitors"],
        p_authorities: [
          { name: "Asha Patil", phone: "9876543210" },
          { name: "Ravi Kulkarni", phone: "9812345678" },
        ],
      }),
    );
    expect(onRegistered).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open society" }));
    expect(onOpenSociety).toHaveBeenCalledWith("soc-1");
  });

  it("puts a server refusal on its field and keeps what was typed", async () => {
    respond({
      admin_feature_catalogue: { data: CATALOGUE },
      admin_register_society: { data: null, error: { message: "DUPLICATE_REGISTRATION_NUMBER" } },
    });
    render(<RegisterSocietySection onOpenSociety={vi.fn()} />);
    fill("Society name", "Lake View CHS");
    fill("Registration number", "MH/PN/123");
    fill("Street address", "4 Lake Road");
    fill("City", "Pune");
    fireEvent.change(screen.getByLabelText(/^State/), { target: { value: "Maharashtra" } });
    fill("PIN code", "411001");
    fill("Name", "Meera Joshi");
    fireEvent.change(screen.getByLabelText(/^Mobile number/), { target: { value: "9822012345" } });
    fireEvent.click(screen.getByRole("button", { name: "Register society" }));
    expect(
      await screen.findByText(
        "Another society in this state already has this registration number.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Registration number/)).toHaveValue("MH/PN/123");
    expect(screen.queryByTestId("society-code")).toBeNull();
  });

  it("still lets staff register when the catalogue fails to load", async () => {
    respond({ admin_feature_catalogue: { data: null, error: { message: "boom" } } });
    render(<RegisterSocietySection onOpenSociety={vi.fn()} />);
    expect(await screen.findByText(/We couldn't load the feature catalogue/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register society" })).toBeEnabled();
  });
});

describe("RegistrationPane", () => {
  const REG = {
    id: "soc-1",
    registration_number: "MH/1",
    society_type: "cooperative_housing",
    registration_date: null,
    official_email: null,
    official_phone: null,
    country: "India",
    setup_completed_at: null,
  };

  it("shows registration details and saves only what changed", async () => {
    respond({
      get_society_registration: { data: REG },
      admin_update_society_registration: (args) => ({
        data: { ...REG, official_email: args.p_official_email },
      }),
    });
    render(<RegistrationPane societyId="soc-1" />);
    expect(await screen.findByText("MH/1")).toBeInTheDocument();
    expect(screen.getByText("Cooperative housing society")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.change(screen.getByLabelText(/^Official email/), {
      target: { value: "office@lake.in" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Registration details saved.")).toBeInTheDocument();
    expect(screen.getByText("office@lake.in")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "admin_update_society_registration",
      expect.objectContaining({
        p_society_id: "soc-1",
        p_official_email: "office@lake.in",
        p_registration_number: null,
      }),
    );
  });

  it("refuses to clear a saved value", async () => {
    respond({ get_society_registration: { data: REG } });
    render(<RegistrationPane societyId="soc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    fireEvent.change(screen.getByLabelText(/^Registration number/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(screen.getAllByText("A saved value can be corrected but not cleared.")).toHaveLength(
        2,
      ),
    );
    expect(rpc).not.toHaveBeenCalledWith("admin_update_society_registration", expect.anything());
  });

  it("shows an error state when loading fails", async () => {
    respond({ get_society_registration: { data: null, error: { message: "NOT_A_MEMBER" } } });
    render(<RegistrationPane societyId="soc-1" />);
    expect(
      await screen.findByText("We couldn't load the registration details."),
    ).toBeInTheDocument();
  });
});
