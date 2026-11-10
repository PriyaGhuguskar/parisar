import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: vi.fn(() => ({})) }));
vi.mock("@parisar/api-client", () => ({
  societyAdminDashboard: vi.fn(),
  getSocietyRegistration: vi.fn(),
}));

import * as api from "@parisar/api-client";
import { SocietyMetrics } from "../SocietyMetrics";

const DASH = {
  flats: 40,
  occupied: 30,
  vacant: 6,
  under_construction: 3,
  maintenance: 1,
  residents: 52,
  pending_requests: { memberships: 2, household: 1, tenants: 1 },
  pending_verification: 5,
  open_complaints: 7,
  todays_visitors: 9,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getSocietyRegistration.mockResolvedValue({ setup_completed_at: "2026-11-01T00:00:00Z" });
});

describe("SocietyMetrics", () => {
  it("shows only the real numbers from society_admin_dashboard", async () => {
    api.societyAdminDashboard.mockResolvedValue(DASH);
    render(<SocietyMetrics societyId="s1" />);
    expect(await screen.findByText("52")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Joins: 2 · Household: 1 · Tenants: 1")).toBeInTheDocument();
    expect(screen.getByText("Visitors today: 9")).toBeInTheDocument();
    expect(screen.queryByText(/parking|dues|vendor|event/i)).toBeNull();
    expect(screen.queryByText("Society setup isn't finished")).toBeNull();
  });

  it("prompts to finish setup while it is incomplete", async () => {
    api.getSocietyRegistration.mockResolvedValue({ setup_completed_at: null });
    api.societyAdminDashboard.mockResolvedValue(DASH);
    render(<SocietyMetrics societyId="s1" />);
    expect(await screen.findByText("Society setup isn't finished")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/setup");
  });

  it("offers a retry when the numbers fail to load", async () => {
    api.societyAdminDashboard.mockResolvedValueOnce({ error: "UNKNOWN" }).mockResolvedValue(DASH);
    render(<SocietyMetrics societyId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("52")).toBeInTheDocument();
  });

  it("explains, without a retry, when the authority has no manager powers", async () => {
    api.societyAdminDashboard.mockResolvedValue({ error: "NOT_SOCIETY_MANAGER" });
    render(<SocietyMetrics societyId="s1" />);
    expect(
      await screen.findByText(
        "Only the society's chairman, secretary and treasurer can see these numbers.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again|retry/i })).toBeNull();
  });
});
