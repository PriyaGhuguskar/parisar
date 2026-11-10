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

import { InviteAccept } from "../InviteAccept";
import { InviteLanding } from "../InviteLanding";

const TOKEN = "0123456789abcdef".repeat(4);
const PREVIEW = {
  society_name: "Green Meadows",
  flat_label: "A-101",
  invited_by: "A**** P****",
  full_name: "Neha Patil",
  relationship: "child",
  expires_at: "2026-11-21T00:00:00Z",
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

describe("InviteLanding", () => {
  it("asks a visitor to sign in and reveals nothing about the invite", () => {
    render(<InviteLanding token={TOKEN} />);
    expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/join/invite/${TOKEN}`)}`,
    );
    expect(screen.queryByText("Green Meadows")).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says when the link is incomplete", () => {
    render(<InviteLanding token="abc" />);
    expect(screen.getByText("This link is not complete")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in to continue" })).not.toBeInTheDocument();
  });
});

describe("InviteAccept", () => {
  it("previews, accepts, takes the name, sets a PIN and opens the app", async () => {
    respond({
      family_invite_preview: { data: PREVIEW, error: null },
      family_invite_accept: {
        data: { society_id: "s1", flat_id: "a101", membership_id: "m1", refresh_required: true },
        error: null,
      },
      upsert_my_profile: { data: { ok: true }, error: null },
    });
    render(<InviteAccept token={TOKEN} pinSet={false} />);
    expect(await screen.findByText("Join A-101, Green Meadows")).toBeInTheDocument();
    expect(screen.getByText("A**** P****")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("family_invite_preview", { p_token: TOKEN });
    expect(rpc).not.toHaveBeenCalledWith("family_invite_accept", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Accept and join" }));
    expect(await screen.findByText("You are linked to the flat")).toBeInTheDocument();
    expect(refreshSession).toHaveBeenCalled();

    const name = screen.getByRole("textbox", { name: /^Full name/ });
    expect(name).toHaveValue("Neha Patil");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    fireEvent.change(name, { target: { value: "Neha P" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    await screen.findByText("Choose a 4-digit PIN");
    fireEvent.change(screen.getByLabelText(/^PIN/), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText(/^Enter the PIN again/), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Save PIN and open Parisar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(rpc).toHaveBeenCalledWith(
      "upsert_my_profile",
      expect.objectContaining({ p_full_name: "Neha P" }),
    );
  });

  it("explains an expired invite instead of a generic error", async () => {
    respond({ family_invite_preview: { data: { error: "INVITE_EXPIRED" }, error: null } });
    render(<InviteAccept token={TOKEN} pinSet />);
    expect(await screen.findByText("This invitation cannot be used")).toBeInTheDocument();
    expect(screen.getByText("This invitation has expired. Ask for a new one.")).toBeInTheDocument();
  });

  it("keeps the person on the preview when accepting fails", async () => {
    respond({
      family_invite_preview: { data: PREVIEW, error: null },
      family_invite_accept: { data: null, error: { message: "ALREADY_MEMBER_OTHER_FLAT" } },
    });
    render(<InviteAccept token={TOKEN} pinSet />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept and join" }));
    expect(
      await screen.findByText("You are already a resident of another flat in this society."),
    ).toBeInTheDocument();
    expect(screen.queryByText("You are linked to the flat")).not.toBeInTheDocument();
  });

  it("offers a retry when the preview cannot load", async () => {
    respond({ family_invite_preview: { data: null, error: { message: "gateway timeout" } } });
    render(<InviteAccept token={TOKEN} pinSet />);
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
