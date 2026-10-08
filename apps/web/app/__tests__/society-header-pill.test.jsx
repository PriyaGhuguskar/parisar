/**
 * Unit tests for apps/web/components/dashboard/SocietyHeaderPill.jsx.
 *   - Renders the society name as the page heading.
 *   - No "% joined" suffix (removed at the user's request).
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SocietyHeaderPill } from "../../components/dashboard/SocietyHeaderPill";

describe("SocietyHeaderPill (web)", () => {
  it("renders societyName as the page heading", () => {
    render(<SocietyHeaderPill societyName="Lotus Heights" />);
    expect(screen.getByRole("heading", { name: "Lotus Heights" })).toBeInTheDocument();
  });

  it("does not show a joined percentage", () => {
    render(<SocietyHeaderPill societyName="Lotus Heights" />);
    expect(screen.queryByText(/joined/)).toBeNull();
  });
});
