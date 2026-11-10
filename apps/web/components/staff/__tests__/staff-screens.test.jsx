// Staff Management list and the add/edit staff form: required markers, field
// validation with focus, server error placement, success, and the ID proof area.
// JavaScript only — no TypeScript per CLAUDE.md.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  managerListStaff: vi.fn(),
  managerSaveStaff: vi.fn(),
  listProofs: vi.fn(),
  attachProof: vi.fn(),
  createProofSignedUrl: vi.fn(),
  removeProof: vi.fn(),
  uploadProofFile: vi.fn(),
  PROOFS_BUCKET: "parisar-proofs",
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("@parisar/api-client", () => api);
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/staff/manage" }));

import { StaffForm } from "../StaffForm";
import { StaffManagement } from "../StaffManagement";

beforeEach(() => {
  for (const fn of Object.values(api)) if (typeof fn === "function") fn.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
  api.listProofs.mockResolvedValue([]);
});

const STAFF = {
  id: "st1",
  society_id: "s1",
  name: "Ramesh",
  last_name: "Patil",
  category: "security",
  phone: "9876543210",
  shift: "night",
  employee_id: "G-01",
  vendor_name: "SafeGuard",
  id_proof_type: "aadhaar",
};

describe("StaffManagement", () => {
  it("lists staff from manager_list_staff with details", async () => {
    api.managerListStaff.mockResolvedValue({ items: [STAFF], total: 1 });
    render(<StaffManagement societyId="s1" />);
    await waitFor(() => expect(screen.getAllByText("Ramesh Patil").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Night").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Aadhaar").length).toBeGreaterThan(0);
    expect(api.managerListStaff).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ societyId: "s1", offset: 0 }),
    );
  });

  it("shows an empty state with an add link", async () => {
    api.managerListStaff.mockResolvedValue({ items: [], total: 0 });
    render(<StaffManagement societyId="s1" />);
    await waitFor(() => expect(screen.getByText("No staff yet")).toBeInTheDocument());
    const adds = screen.getAllByRole("link", { name: "Add staff" });
    for (const link of adds) expect(link).toHaveAttribute("href", "/staff/manage/new");
  });

  it("shows an error state when the list fails", async () => {
    api.managerListStaff.mockRejectedValue(new Error("network"));
    render(<StaffManagement societyId="s1" />);
    await waitFor(() =>
      expect(screen.getByText("We couldn't load the staff list.")).toBeInTheDocument(),
    );
  });
});

describe("StaffForm (add)", () => {
  it("marks name and staff type required and explains proofs come after saving", () => {
    render(<StaffForm societyId="s1" userId="u1" />);
    expect(document.getElementById("staff-name")).toHaveAttribute("aria-required", "true");
    expect(document.getElementById("staff-category")).toHaveAttribute("aria-required", "true");
    expect(document.getElementById("staff-phone")).not.toHaveAttribute("aria-required");
    expect(screen.getAllByText("(required)")).toHaveLength(2);
    expect(
      screen.getByText("Save the staff member first. The ID proof upload appears here after that."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Adding staff does not give them a login or any access/),
    ).toBeInTheDocument();
  });

  it("blocks submit with field errors and focuses the first", async () => {
    render(<StaffForm societyId="s1" userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByText("Enter the first name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a staff type.")).toBeInTheDocument();
    expect(document.activeElement?.id).toBe("staff-name");
    expect(api.managerSaveStaff).not.toHaveBeenCalled();
  });

  it("saves and opens the new record's page", async () => {
    api.managerSaveStaff.mockResolvedValue({ ...STAFF, id: "new1" });
    render(<StaffForm societyId="s1" userId="u1" />);
    fireEvent.change(document.getElementById("staff-name"), { target: { value: "Ramesh" } });
    fireEvent.change(document.getElementById("staff-category"), { target: { value: "cleaner" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/staff/manage/new1?created=1"));
    expect(api.managerSaveStaff).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        societyId: "s1",
        name: "Ramesh",
        category: "cleaner",
        staffId: null,
      }),
    );
  });

  it("puts a server field error on its field", async () => {
    api.managerSaveStaff.mockResolvedValue({ error: "EMPLOYEE_ID_TAKEN" });
    render(<StaffForm societyId="s1" userId="u1" />);
    fireEvent.change(document.getElementById("staff-name"), { target: { value: "Ramesh" } });
    fireEvent.change(document.getElementById("staff-category"), { target: { value: "security" } });
    fireEvent.change(document.getElementById("staff-employeeId"), { target: { value: "G-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    expect(
      await screen.findByText("Another staff member already has this employee ID."),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a form error when the save throws", async () => {
    api.managerSaveStaff.mockRejectedValue(new Error("boom"));
    render(<StaffForm societyId="s1" userId="u1" />);
    fireEvent.change(document.getElementById("staff-name"), { target: { value: "Ramesh" } });
    fireEvent.change(document.getElementById("staff-category"), { target: { value: "security" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });
});

describe("StaffForm (edit)", () => {
  it("prefills the record, confirms a new one and loads its ID proofs", async () => {
    render(<StaffForm societyId="s1" userId="u1" staff={STAFF} justCreated />);
    expect(screen.getByRole("heading", { level: 1, name: "Ramesh Patil" })).toBeInTheDocument();
    expect(document.getElementById("staff-employeeId")).toHaveValue("G-01");
    expect(screen.getByText("Staff member added")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No ID proof uploaded yet.")).toBeInTheDocument());
    expect(api.listProofs).toHaveBeenCalledWith({}, { subjectKind: "staff", subjectId: "st1" });
  });

  it("saves changes in place", async () => {
    api.managerSaveStaff.mockResolvedValue({ ...STAFF, vendor_name: "New Agency" });
    render(<StaffForm societyId="s1" userId="u1" staff={STAFF} />);
    fireEvent.change(document.getElementById("staff-vendorName"), {
      target: { value: "New Agency" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(api.managerSaveStaff).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ staffId: "st1", vendorName: "New Agency" }),
    );
  });

  it("lists uploaded proofs and shows a load error with retry", async () => {
    api.listProofs
      .mockResolvedValueOnce({ error: "NOT_SOCIETY_MANAGER" })
      .mockResolvedValueOnce([
        { id: "p1", file_name: "aadhaar.pdf", byte_size: 2048, storage_path: "s1/u1/a.pdf" },
      ]);
    render(<StaffForm societyId="s1" userId="u1" staff={STAFF} />);
    expect(await screen.findByText("We couldn't load the documents.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("aadhaar.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });
});
