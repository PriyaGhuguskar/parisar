import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { OtpInput } from "../components/auth/OtpInput";

// Mock react-native-reanimated so the animation doesn't fail in Jest
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

describe("OtpInput", () => {
  it("renders 6 input boxes with accessibilityLabel matching /OTP digit/", () => {
    const { getAllByLabelText } = render(<OtpInput value="" onChangeText={() => {}} />);
    const boxes = getAllByLabelText(/OTP digit/);
    expect(boxes).toHaveLength(6);
  });

  it("typing a digit in box 1 calls onChangeText with the accumulated value", () => {
    const onChangeText = jest.fn();
    const { getAllByLabelText } = render(<OtpInput value="" onChangeText={onChangeText} />);
    const boxes = getAllByLabelText(/OTP digit/);
    // Simulate typing "5" in box 1 (index 0)
    fireEvent.changeText(boxes[0], "5");
    // onChangeText should have been called with a string containing "5"
    expect(onChangeText).toHaveBeenCalled();
    const calledWith = onChangeText.mock.calls[0][0];
    expect(calledWith).toContain("5");
  });

  it("applies error styling when hasError is true", () => {
    const { getAllByLabelText } = render(
      <OtpInput value="" onChangeText={() => {}} hasError={true} />,
    );
    const boxes = getAllByLabelText(/OTP digit/);
    // Each box should have a className containing danger
    boxes.forEach((box) => {
      const classNameProp =
        box.props.className || (box.props.style ? JSON.stringify(box.props.style) : "");
      // The component applies border-danger-500 class when hasError is true
      expect(classNameProp).toMatch(/danger/);
    });
  });
});
