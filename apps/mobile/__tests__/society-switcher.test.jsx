import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { SocietySwitcherSheet } from "../components/dashboard/SocietySwitcherSheet";

const memberships = [
  { society_id: "soc-1", society_name: "Lotus Heights" },
  { society_id: "soc-2", society_name: "Green Valley" },
];

describe("SocietySwitcherSheet", () => {
  it("renders nothing when visible=false", () => {
    const { queryByText } = render(
      <SocietySwitcherSheet visible={false} memberships={memberships} activeSocietyId="soc-1" />,
    );
    expect(queryByText("Switch society")).toBeNull();
  });

  it("renders title when visible=true", () => {
    const { getByText } = render(
      <SocietySwitcherSheet visible={true} memberships={memberships} activeSocietyId="soc-1" />,
    );
    expect(getByText("Switch society")).toBeTruthy();
  });

  it("renders one row per membership", () => {
    const { getByText } = render(
      <SocietySwitcherSheet visible={true} memberships={memberships} activeSocietyId="soc-1" />,
    );
    expect(getByText("Lotus Heights")).toBeTruthy();
    expect(getByText("Green Valley")).toBeTruthy();
  });

  it("marks the active society with accessibilityState.selected=true", () => {
    const { getByLabelText } = render(
      <SocietySwitcherSheet visible={true} memberships={memberships} activeSocietyId="soc-1" />,
    );
    expect(getByLabelText("Lotus Heights").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(getByLabelText("Green Valley").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it("tapping an inactive row calls onSelect with its societyId and then onClose", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <SocietySwitcherSheet
        visible={true}
        memberships={memberships}
        activeSocietyId="soc-1"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByLabelText("Green Valley"));
    expect(onSelect).toHaveBeenCalledWith("soc-2");
    expect(onClose).toHaveBeenCalled();
  });

  it("tapping the active row does NOT call onSelect but still calls onClose", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <SocietySwitcherSheet
        visible={true}
        memberships={memberships}
        activeSocietyId="soc-1"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByLabelText("Lotus Heights"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
