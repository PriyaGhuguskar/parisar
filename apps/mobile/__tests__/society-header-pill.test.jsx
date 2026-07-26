import { render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("@parisar/api-client", () => ({
  fetchJoinPercent: jest.fn(),
}));
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({}) }));

import { fetchJoinPercent } from "@parisar/api-client";
import { SocietyHeaderPill } from "../components/dashboard/SocietyHeaderPill";

describe("SocietyHeaderPill", () => {
  beforeEach(() => {
    fetchJoinPercent.mockReset();
  });

  it("renders societyName as heading text", () => {
    fetchJoinPercent.mockResolvedValue(50);
    const { getByText } = render(<SocietyHeaderPill societyId="abc" societyName="Lotus Heights" />);
    expect(getByText("Lotus Heights")).toBeTruthy();
  });

  it("renders ' · 50% joined' suffix when fetchJoinPercent resolves to 50", async () => {
    fetchJoinPercent.mockResolvedValue(50);
    const { findByText } = render(
      <SocietyHeaderPill societyId="abc" societyName="Lotus Heights" />,
    );
    expect(await findByText(/50% joined/)).toBeTruthy();
  });

  it("hides suffix on fetchJoinPercent rejection", async () => {
    fetchJoinPercent.mockRejectedValue(new Error("network"));
    const { queryByText, getByText } = render(
      <SocietyHeaderPill societyId="abc" societyName="Lotus Heights" />,
    );
    await waitFor(() => expect(fetchJoinPercent).toHaveBeenCalled());
    expect(getByText("Lotus Heights")).toBeTruthy();
    expect(queryByText(/joined/)).toBeNull();
  });

  it("does not fetch when societyId is undefined", () => {
    render(<SocietyHeaderPill societyId={undefined} societyName="Lotus Heights" />);
    expect(fetchJoinPercent).not.toHaveBeenCalled();
  });

  it("renders ' · 0% joined' when percent is 0 (not null)", async () => {
    fetchJoinPercent.mockResolvedValue(0);
    const { findByText } = render(<SocietyHeaderPill societyId="abc" societyName="X" />);
    expect(await findByText(/0% joined/)).toBeTruthy();
  });

  it("society name uses numberOfLines=1", () => {
    fetchJoinPercent.mockResolvedValue(null);
    const { getByText } = render(<SocietyHeaderPill societyId="abc" societyName="Lotus Heights" />);
    expect(getByText("Lotus Heights").props.numberOfLines).toBe(1);
  });
});
