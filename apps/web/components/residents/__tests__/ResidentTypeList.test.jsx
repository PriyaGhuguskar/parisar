// Owners, Tenants and Family Members lists: real RPC rows, tabs with counts,
// empty and error states, and the status filter sent to the server.
// JavaScript only — no TypeScript per CLAUDE.md.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  managerListSocietyResidents: vi.fn(),
  managerResidentTypeCounts: vi.fn(),
}));
vi.mock("@parisar/api-client", () => api);
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));

import { ResidentTypeList, residentColumns } from "../ResidentTypeList";

beforeEach(() => {
  api.managerListSocietyResidents.mockReset();
  api.managerResidentTypeCounts.mockReset();
  api.managerResidentTypeCounts.mockResolvedValue({ owner: 2, tenant: 1, family_member: 0 });
});

const OWNER = {
  id: "o1",
  source: "owner_record",
  full_name: "Rahul Sharma",
  flat_label: "A-101",
  status: "active",
  is_primary: true,
  verified: true,
  membership_number: "M-7",
  society_title: "chairman",
};

describe("ResidentTypeList", () => {
  it("lists owners with title, flat and status", async () => {
    api.managerListSocietyResidents.mockResolvedValue({ items: [OWNER], total: 1 });
    render(<ResidentTypeList societyId="s1" slug="owners" />);
    expect(screen.getByRole("heading", { level: 1, name: "Owners" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Rahul Sharma").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Chairman").length).toBeGreaterThan(0);
    expect(screen.getAllByText("On the app").length).toBeGreaterThan(0);
    expect(api.managerListSocietyResidents).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ societyId: "s1", residentType: "owner", offset: 0 }),
    );
  });

  it("shows tabs for all three types with their counts", async () => {
    api.managerListSocietyResidents.mockResolvedValue({ items: [], total: 0 });
    render(<ResidentTypeList societyId="s1" slug="tenants" />);
    const tabs = screen.getByRole("navigation", { name: "Resident type" });
    await waitFor(() => expect(within(tabs).getByText("2")).toBeInTheDocument());
    expect(within(tabs).getByRole("link", { name: /Tenants/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: /Family members/ })).toHaveAttribute(
      "href",
      "/residents/family",
    );
  });

  it("shows the empty state for a type with no one", async () => {
    api.managerListSocietyResidents.mockResolvedValue({ items: [], total: 0 });
    render(<ResidentTypeList societyId="s1" slug="family" />);
    await waitFor(() => expect(screen.getByText("No family members yet")).toBeInTheDocument());
  });

  it("shows an error and retries", async () => {
    api.managerListSocietyResidents
      .mockResolvedValueOnce({ error: "NOT_SOCIETY_MANAGER" })
      .mockResolvedValueOnce({ items: [OWNER], total: 1 });
    render(<ResidentTypeList societyId="s1" slug="owners" />);
    await waitFor(() =>
      expect(screen.getByText("We couldn't load this list.")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await waitFor(() => expect(screen.getAllByText("Rahul Sharma").length).toBeGreaterThan(0));
  });

  it("links tenants to approvals and every type to import", async () => {
    api.managerListSocietyResidents.mockResolvedValue({ items: [], total: 0 });
    render(<ResidentTypeList societyId="s1" slug="tenants" />);
    expect(screen.getByRole("link", { name: "Review approvals" })).toHaveAttribute(
      "href",
      "/approvals",
    );
    expect(screen.getByRole("link", { name: "Import residents" })).toHaveAttribute(
      "href",
      "/import",
    );
  });
});

describe("residentColumns", () => {
  const t = (k) => k;
  it("shows tenancy columns for tenants", () => {
    expect(residentColumns("tenant", t).map((c) => c.key)).toEqual([
      "full_name",
      "flat_label",
      "status",
      "agreement_end",
      "police_status",
    ]);
  });

  it("shows relationship and who added them for family", () => {
    const keys = residentColumns("family_member", t).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["relationship", "added_by_name"]));
  });

  it("never has a phone column", () => {
    for (const type of ["owner", "tenant", "family_member"]) {
      expect(residentColumns(type, t).map((c) => c.key)).not.toContain("phone");
    }
  });
});
