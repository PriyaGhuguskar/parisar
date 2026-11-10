import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    auth: { refreshSession: vi.fn() },
    storage: { from: vi.fn() },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { FamilyInvites } from "../FamilyInvites";
import { HouseholdHome } from "../HouseholdHome";
import { OwnerSection } from "../OwnerSection";

const TOKEN = "a".repeat(64);

function respond(map) {
  rpc.mockImplementation(async (fn, args) => {
    const handler = map[fn];
    if (!handler) return { data: null, error: { message: `unexpected ${fn}` } };
    return typeof handler === "function" ? handler(args) : handler;
  });
}

beforeEach(() => rpc.mockReset());
afterEach(cleanup);

describe("FamilyInvites", () => {
  it("shows an empty list, then creates an invite with a copyable link that says nothing was sent", async () => {
    let created = false;
    respond({
      family_invite_list: () => ({
        data: created
          ? [
              {
                id: "i1",
                full_name: "Neha Patil",
                relationship: "child",
                status: "pending",
                mine: true,
              },
            ]
          : [],
        error: null,
      }),
      family_invite_create: () => {
        created = true;
        return {
          data: { invite_id: "i1", token: TOKEN, expires_at: "2026-11-21T00:00:00Z", sent: false },
          error: null,
        };
      },
    });
    render(<FamilyInvites societyId="s1" />);
    expect(
      await screen.findByText("You have not created any invitations yet."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a relationship.")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("family_invite_create", expect.anything());

    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), {
      target: { value: "Neha Patil" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Child" }));
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));

    expect(await screen.findByText("Invitation link for Neha Patil")).toBeInTheDocument();
    expect(screen.getByText(`http://localhost:3000/invite/${TOKEN}`)).toBeInTheDocument();
    expect(screen.getByText("Not sent automatically")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Invitation sent/i);
    expect(rpc).toHaveBeenCalledWith(
      "family_invite_create",
      expect.objectContaining({
        p_society_id: "s1",
        p_full_name: "Neha Patil",
        p_relationship: "child",
      }),
    );
    expect(await screen.findByText("Not accepted yet")).toBeInTheDocument();
  });

  it("shows the server's reason when an invite cannot be created", async () => {
    respond({
      family_invite_list: { data: [], error: null },
      family_invite_create: { data: null, error: { message: "INVITE_ALREADY_PENDING" } },
    });
    render(<FamilyInvites societyId="s1" />);
    await screen.findByText("You have not created any invitations yet.");
    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "Neha" } });
    fireEvent.click(screen.getByRole("radio", { name: "Spouse" }));
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    expect(
      await screen.findByText("There is already an open invitation for this person."),
    ).toBeInTheDocument();
    // What was typed is kept.
    expect(screen.getByRole("textbox", { name: /^Name/ })).toHaveValue("Neha");
  });
});

describe("OwnerSection", () => {
  it("lists several owners without phones and lets an owner save their details", async () => {
    respond({
      list_flat_owners: {
        data: [
          {
            id: "o1",
            user_id: "u1",
            full_name: "Asha Patil",
            is_primary: true,
            verified: true,
            phone: null,
          },
          {
            id: "o2",
            user_id: null,
            full_name: "Ravi Patil",
            is_primary: false,
            verified: false,
            phone: null,
          },
        ],
        error: null,
      },
      list_proofs: { data: [], error: null },
      owner_save_my_details: { data: { id: "o1" }, error: null },
    });
    render(<OwnerSection societyId="s1" flatId="a101" userId="u1" isOwner />);
    expect(await screen.findByText("Asha Patil (you)")).toBeInTheDocument();
    expect(screen.getByText("Ravi Patil")).toBeInTheDocument();
    expect(screen.getByText("Primary owner")).toBeInTheDocument();
    expect(screen.getByText("Not verified yet")).toBeInTheDocument();
    expect(screen.getByText("Ownership documents")).toBeInTheDocument();
    const required = await screen.findByRole("list", { name: "Required documents" });
    expect(within(required).getByText("Ownership proof")).toBeInTheDocument();
    expect(within(required).getByText("Missing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Owner details saved.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "owner_save_my_details",
      expect.objectContaining({ p_flat_id: "a101" }),
    );
  });

  it("shows an error with retry", async () => {
    respond({ list_flat_owners: { data: null, error: { message: "NOT_ALLOWED" } } });
    render(<OwnerSection societyId="s1" flatId="a101" userId="u1" isOwner={false} />);
    expect(await screen.findByText("We could not load the owners.")).toBeInTheDocument();
  });
});

describe("HouseholdHome", () => {
  it("hides family invites from family members", async () => {
    respond({ list_flat_owners: { data: [], error: null } });
    render(
      <HouseholdHome
        societyId="s1"
        flatId="a101"
        flatLabel="A-101"
        residentType="family_member"
        userId="u3"
      />,
    );
    expect(screen.getByRole("heading", { name: "My household, A-101" })).toBeInTheDocument();
    expect(
      screen.getByText("Only owners and tenants can invite family members."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create invitation link" }),
    ).not.toBeInTheDocument();
    const owners = await screen.findByText("No owners recorded yet.");
    expect(within(owners.closest("div")).queryByRole("button")).toBeNull();
  });
});
