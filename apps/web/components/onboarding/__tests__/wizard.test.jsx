import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/app/actions/codeLogin", () => ({ setMyPin }));

import { OnboardingWizard } from "../OnboardingWizard";
import { STRUCTURE } from "./fixtures";

function respond(map) {
  rpc.mockImplementation(async (fn, args) => {
    const handler = map[fn];
    if (!handler) return { data: null, error: { message: `unexpected ${fn}` } };
    return typeof handler === "function" ? handler(args) : handler;
  });
}

function pick(label, option) {
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${label}`) }));
  fireEvent.click(screen.getByRole("option", { name: new RegExp(`^${option}`) }));
}

async function enterCode() {
  fireEvent.change(screen.getByRole("textbox", { name: /Society code/ }), {
    target: { value: "abcd1234" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByRole("heading", { name: "Your details and flat" });
}

async function setPin() {
  await screen.findByRole("heading", { name: "Set your PIN" });
  fireEvent.change(screen.getByLabelText(/^PIN/), { target: { value: "4821" } });
  fireEvent.change(screen.getByLabelText(/^Enter the PIN again/), { target: { value: "4821" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
}

beforeEach(() => {
  rpc.mockReset();
  refreshSession.mockReset().mockResolvedValue({});
  push.mockReset();
  setMyPin.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("OnboardingWizard", () => {
  it("validates the code before calling the server", async () => {
    render(<OnboardingWizard phone="+919876543210" />);
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(
      await screen.findByText("Enter the 8-character code, like ABCD-1234."),
    ).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows a server code error in plain words", async () => {
    respond({ onboard_structure_for_code: { data: { error: "INVALID_CODE" }, error: null } });
    render(<OnboardingWizard phone="+919876543210" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Society code/ }), {
      target: { value: "ABCD1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(
      await screen.findByText("That code is not right. Check it with your society."),
    ).toBeInTheDocument();
  });

  it("joins a free flat as owner: structure pickers, family, PIN, then the dashboard", async () => {
    respond({
      onboard_structure_for_code: { data: STRUCTURE, error: null },
      onboard_resident: { data: { society_id: "s1", status: "active" }, error: null },
    });
    render(<OnboardingWizard phone="+919876543210" />);
    await enterCode();
    expect(rpc).toHaveBeenCalledWith("onboard_structure_for_code", { p_code: "ABCD-1234" });
    // The signed-in mobile is shown read-only.
    expect(screen.getByDisplayValue("+91 9876543210")).toBeDisabled();

    // Required fields are checked on submit.
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Choose your wing.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /^Full name/ }), {
      target: { value: "Asha Patil" },
    });
    pick("Wing", "A");
    pick("Floor", "Floor 1");
    pick("Flat", "A-101");
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    await screen.findByRole("heading", { name: "Who lives with you" });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await setPin();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(rpc).toHaveBeenCalledWith(
      "onboard_resident",
      expect.objectContaining({
        p_code: "ABCD-1234",
        p_flat_id: "a101",
        p_full_name: "Asha Patil",
        p_residency: "owner",
      }),
    );
    expect(setMyPin).toHaveBeenCalledWith("4821");
    expect(refreshSession).toHaveBeenCalled();
  });

  it("asks before joining an occupied flat and never grants access itself", async () => {
    respond({
      onboard_structure_for_code: { data: STRUCTURE, error: null },
      upsert_my_profile: { data: { ok: true }, error: null },
      household_lookup: {
        data: {
          society_id: "s1",
          society_name: "Green Meadows",
          flat_id: "a102",
          flat_label: "A-102",
          member_count: 2,
          masked_members: ["R**** S****", "N****"],
          already_on_flat: false,
        },
        error: null,
      },
      household_request_access: {
        data: { request_id: "r1", status: "pending", society_id: "s1", flat_id: "a102" },
        error: null,
      },
    });
    render(<OnboardingWizard phone="+919876543210" />);
    await enterCode();
    fireEvent.change(screen.getByRole("textbox", { name: /^Full name/ }), {
      target: { value: "Neha Patil" },
    });
    pick("Wing", "A");
    pick("Floor", "Floor 1");
    pick("Flat", "A-102");
    fireEvent.click(screen.getByRole("radio", { name: "Family member" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByText("Are you already part of this household?")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("household_lookup", {
      p_code: "ABCD-1234",
      p_wing: "A",
      p_floor: "1",
      p_flat: "102",
    });
    expect(screen.getByText("R**** S****")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{10}/);

    fireEvent.click(screen.getByRole("button", { name: "Yes, I live here with them" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Choose a relationship.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Sibling" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await setPin();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/status"));
    expect(rpc).toHaveBeenCalledWith(
      "household_request_access",
      expect.objectContaining({
        p_flat_id: "a102",
        p_relationship: "sibling",
        p_resident_type: "family_member",
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith("onboard_resident", expect.anything());
  });

  it("sends a tenant to the tenancy step with required dates", async () => {
    respond({ onboard_structure_for_code: { data: STRUCTURE, error: null } });
    render(<OnboardingWizard phone="+919876543210" />);
    await enterCode();
    fireEvent.change(screen.getByRole("textbox", { name: /^Full name/ }), {
      target: { value: "Ravi Kumar" },
    });
    pick("Wing", "Main");
    pick("Flat", "1");
    fireEvent.click(screen.getByRole("radio", { name: "Tenant" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    await screen.findByRole("heading", { name: "Your tenancy" });
    expect(screen.getByText("Documents come next")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Choose the start date.")).toBeInTheDocument();
    expect(screen.getByText("Choose the end date.")).toBeInTheDocument();
  });
});
