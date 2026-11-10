import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => search,
}));

const loginState = { current: {} };
const sb = {
  auth: {
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
    refreshSession: vi.fn(async () => ({ data: {}, error: null })),
  },
  rpc: vi.fn(async (name) =>
    name === "my_login_state"
      ? { data: loginState.current, error: null }
      : { data: null, error: null },
  ),
};
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => sb }));
vi.mock("@parisar/api-client", () => ({
  myAuthoritySocieties: vi.fn(),
  claimAuthorityForSociety: vi.fn(),
}));
vi.mock("@/app/actions/codeLogin", () => ({
  claimAuthority: vi.fn(),
  claimFamilyMember: vi.fn(),
  claimGuard: vi.fn(),
  pinLogin: vi.fn(),
  setMyPin: vi.fn(),
}));

import * as api from "@parisar/api-client";
import LoginPage from "@/app/(auth)/login/page";
import VerifyPage from "@/app/(auth)/verify/page";
import * as actions from "@/app/actions/codeLogin";
import { authorityDestination, claimErrorKey, managerDestination } from "../authorityFlow";

function typeOtp() {
  const boxes = screen.getAllByRole("textbox");
  "123456".split("").forEach((d, i) => {
    fireEvent.change(boxes[i], { target: { value: d } });
  });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  loginState.current = {};
});

describe("authorityFlow helpers", () => {
  it("routes by setup_state", () => {
    expect(authorityDestination("needs_setup")).toBe("/setup");
    expect(authorityDestination("needs_personal_onboarding")).toBe("/setup/personal");
    expect(authorityDestination("complete")).toBe("/society-dashboard");
  });
  it("maps claim errors to known keys only", () => {
    expect(claimErrorKey("NOT_AN_AUTHORITY")).toBe(
      "setup-wizard:authLogin.errors.NOT_AN_AUTHORITY",
    );
    expect(claimErrorKey("WHATEVER")).toBe("setup-wizard:authLogin.errors.generic");
  });
  it("sends a returning manager to unfinished setup, not a finished one", () => {
    const state = { membership: { role: "secretary", society_id: "s1", flat_id: "f1" } };
    expect(
      managerDestination(state, [{ society_id: "s1", claimed: true, setup_state: "needs_setup" }]),
    ).toBe("/setup");
    expect(
      managerDestination(state, [{ society_id: "s1", claimed: true, setup_state: "complete" }]),
    ).toBeNull();
    expect(managerDestination({ membership: { role: "member" } }, [])).toBeNull();
  });
});

describe("/login is one sign-in for everyone", () => {
  it("has no Resident / Society authority choice", () => {
    render(<LoginPage />);
    expect(screen.queryByRole("button", { name: "Resident" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Society authority" })).toBeNull();
  });

  it("sends the OTP and looks nothing up before it", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /Send OTP/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(sb.auth.signInWithOtp).toHaveBeenCalledWith({ phone: "+919876543210" });
    expect(api.myAuthoritySocieties).not.toHaveBeenCalled();
    expect(push.mock.calls[0][0]).not.toContain("as=authority");
  });
});

describe("/verify detects an authority after the OTP", () => {
  it("lists unclaimed societies only after the OTP, then claims, refreshes and asks for the PIN", async () => {
    search = new URLSearchParams({ phone: "+919876543210" });
    loginState.current = { pin_set: true, membership: null };
    api.myAuthoritySocieties.mockResolvedValue({
      societies: [
        {
          society_id: "s1",
          society_name: "Green Meadows",
          society_code: "GRMD-AB12",
          setup_state: "needs_setup",
          claimed: false,
        },
        {
          society_id: "s2",
          society_name: "Blue Ridge",
          society_code: "BLRD-CD34",
          setup_state: "complete",
          claimed: false,
        },
      ],
    });
    api.claimAuthorityForSociety.mockResolvedValue({
      society_id: "s1",
      setup_state: "needs_setup",
      refresh_required: true,
    });
    actions.pinLogin.mockResolvedValue({ ok: true });

    render(<VerifyPage />);
    expect(screen.queryByText("Green Meadows")).toBeNull();
    expect(api.myAuthoritySocieties).not.toHaveBeenCalled();
    typeOtp();

    fireEvent.click(await screen.findByRole("button", { name: /Green Meadows/ }));
    await waitFor(() => expect(api.claimAuthorityForSociety).toHaveBeenCalledWith(sb, "s1"));
    expect(sb.auth.refreshSession).toHaveBeenCalled();

    const pin = await screen.findByPlaceholderText("••••");
    fireEvent.change(pin, { target: { value: "4826" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/setup"));
  });

  it("claims a single unclaimed society directly, ignoring ones already claimed", async () => {
    search = new URLSearchParams({ phone: "+919876543210" });
    loginState.current = { pin_set: false };
    api.myAuthoritySocieties.mockResolvedValue({
      societies: [
        {
          society_id: "s1",
          society_name: "Green Meadows",
          setup_state: "needs_setup",
          claimed: false,
        },
        { society_id: "s2", society_name: "Blue Ridge", setup_state: "complete", claimed: true },
      ],
    });
    api.claimAuthorityForSociety.mockResolvedValue({
      society_id: "s1",
      setup_state: "needs_setup",
      refresh_required: true,
    });
    render(<VerifyPage />);
    typeOtp();
    await waitFor(() => expect(api.claimAuthorityForSociety).toHaveBeenCalledWith(sb, "s1"));
    expect(screen.queryByRole("button", { name: /Blue Ridge/ })).toBeNull();
  });

  it("sends a number that is not an authority straight on as a resident", async () => {
    search = new URLSearchParams({ phone: "+919876543210" });
    loginState.current = {};
    api.myAuthoritySocieties.mockResolvedValue({ societies: [] });
    render(<VerifyPage />);
    typeOtp();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
    expect(screen.queryByText("Not an authority number")).toBeNull();
  });

  it("shows a claim refusal on the society list", async () => {
    search = new URLSearchParams({ phone: "+919876543210" });
    loginState.current = { pin_set: false };
    api.myAuthoritySocieties.mockResolvedValue({
      societies: [{ society_id: "s1", society_name: "Green Meadows", setup_state: "needs_setup" }],
    });
    api.claimAuthorityForSociety.mockResolvedValue({ error: "SOCIETY_BLOCKED" });
    render(<VerifyPage />);
    typeOtp();
    expect(
      await screen.findByText("Parisar has blocked this society. Contact Parisar for help."),
    ).toBeInTheDocument();
    expect(sb.auth.refreshSession).not.toHaveBeenCalled();
  });

  it("leaves a resident with a PIN on the normal PIN step", async () => {
    search = new URLSearchParams({ phone: "+919876543210" });
    loginState.current = {
      pin_set: true,
      membership: { role: "member", society_id: "s1", flat_id: "f1" },
    };
    api.myAuthoritySocieties.mockResolvedValue({ societies: [] });
    render(<VerifyPage />);
    typeOtp();
    expect(await screen.findByPlaceholderText("••••")).toBeInTheDocument();
    expect(api.claimAuthorityForSociety).not.toHaveBeenCalled();
  });
});
