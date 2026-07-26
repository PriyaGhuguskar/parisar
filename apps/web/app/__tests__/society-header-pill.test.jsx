/**
 * Unit tests for apps/web/components/dashboard/SocietyHeaderPill.jsx
 * — Phase 04.1 Wave 2, Plan 03, Task 1.
 *
 * Web mirror of apps/mobile/__tests__/society-header-pill.test.jsx. Same
 * behavior:
 *   - Renders the society name.
 *   - Renders " · {percent}% joined" suffix when fetchJoinPercent resolves.
 *   - Hides the suffix silently on fetch rejection (no error UI).
 *   - Does NOT fetch when societyId is undefined.
 *   - Renders "0% joined" when percent === 0 (distinct from null/hidden).
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchJoinPercent = vi.fn();
vi.mock("@parisar/api-client", () => ({
  fetchJoinPercent: (...a) => fetchJoinPercent(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({}),
}));

import { SocietyHeaderPill } from "../../components/dashboard/SocietyHeaderPill";

describe("SocietyHeaderPill (web)", () => {
  beforeEach(() => {
    fetchJoinPercent.mockReset();
  });

  it("renders societyName", () => {
    fetchJoinPercent.mockResolvedValue(50);
    render(<SocietyHeaderPill societyId="abc" societyName="Lotus Heights" />);
    expect(screen.getByText("Lotus Heights")).toBeInTheDocument();
  });

  it("renders ' · 50% joined' when fetchJoinPercent resolves to 50", async () => {
    fetchJoinPercent.mockResolvedValue(50);
    render(<SocietyHeaderPill societyId="abc" societyName="Lotus Heights" />);
    await waitFor(() => expect(screen.getByText(/50% joined/)).toBeInTheDocument());
  });

  it("hides suffix on fetch rejection", async () => {
    fetchJoinPercent.mockRejectedValue(new Error("net"));
    render(<SocietyHeaderPill societyId="abc" societyName="X" />);
    await waitFor(() => expect(fetchJoinPercent).toHaveBeenCalled());
    expect(screen.queryByText(/joined/)).toBeNull();
  });

  it("does not fetch when societyId is undefined", () => {
    render(<SocietyHeaderPill societyId={undefined} societyName="X" />);
    expect(fetchJoinPercent).not.toHaveBeenCalled();
  });

  it("renders ' · 0% joined' when percent is 0 (not null)", async () => {
    fetchJoinPercent.mockResolvedValue(0);
    render(<SocietyHeaderPill societyId="abc" societyName="X" />);
    await waitFor(() => expect(screen.getByText(/0% joined/)).toBeInTheDocument());
  });
});
