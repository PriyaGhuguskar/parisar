// Unit tests for components/dashboard/SocietyHeaderPill.jsx — matches the
// website: society name as the heading, no "% joined" suffix.
// JavaScript only — no TypeScript per CLAUDE.md.

import { render } from "@testing-library/react-native";
import { SocietyHeaderPill } from "../components/dashboard/SocietyHeaderPill";

describe("SocietyHeaderPill", () => {
  it("renders the society name as a header", () => {
    const { getByText, getByRole } = render(<SocietyHeaderPill societyName="Lotus Heights" />);
    expect(getByText("Lotus Heights")).toBeTruthy();
    expect(getByRole("header")).toBeTruthy();
  });

  it("shows no joined percentage", () => {
    const { queryByText } = render(<SocietyHeaderPill societyName="Lotus Heights" />);
    expect(queryByText(/joined/)).toBeNull();
  });
});
