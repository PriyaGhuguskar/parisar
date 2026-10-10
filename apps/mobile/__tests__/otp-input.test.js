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
  it("renders 6 boxes with accessibilityLabel matching /OTP digit/", () => {
    const { getAllByLabelText } = render(<OtpInput value="" onChangeText={() => {}} />);
    expect(getAllByLabelText(/OTP digit/)).toHaveLength(6);
  });

  it("typing the whole code in one go fills it and completes once", () => {
    const onChangeText = jest.fn();
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <OtpInput value="" onChangeText={onChangeText} onComplete={onComplete} />,
    );
    fireEvent.changeText(getByLabelText("One-time password"), "123456");
    expect(onChangeText).toHaveBeenLastCalledWith("123456");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("shows each digit in its own box, in order", () => {
    const { getAllByLabelText } = render(<OtpInput value="1234" onChangeText={() => {}} />);
    const boxes = getAllByLabelText(/OTP digit/);
    const shown = boxes.map((b) => {
      const child = b.props.children;
      return child?.props?.children ?? "";
    });
    expect(shown).toEqual(["1", "2", "3", "4", "", ""]);
  });

  it("strips non-digits and caps at 6 (paste / autofill)", () => {
    const onChangeText = jest.fn();
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <OtpInput value="" onChangeText={onChangeText} onComplete={onComplete} />,
    );
    fireEvent.changeText(getByLabelText("One-time password"), "Code: 987-654-3");
    expect(onChangeText).toHaveBeenLastCalledWith("987654");
    expect(onComplete).toHaveBeenCalledWith("987654");
  });

  it("does not complete on a partial code", () => {
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <OtpInput value="" onChangeText={() => {}} onComplete={onComplete} />,
    );
    fireEvent.changeText(getByLabelText("One-time password"), "123");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("applies error styling when hasError is true", () => {
    const { getAllByLabelText } = render(
      <OtpInput value="" onChangeText={() => {}} hasError={true} />,
    );
    for (const box of getAllByLabelText(/OTP digit/)) {
      expect(box.props.className).toMatch(/danger/);
    }
  });
});
