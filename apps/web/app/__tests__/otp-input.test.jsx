import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OtpInput from "../../components/auth/OtpInput";

describe("OtpInput", () => {
  it("renders 6 boxes with accessible labels", () => {
    render(<OtpInput value="" onChange={() => {}} />);
    const boxes = screen.getAllByLabelText(/OTP digit/);
    expect(boxes).toHaveLength(6);
    boxes.forEach((box, i) => {
      expect(box).toHaveAttribute("aria-label", `OTP digit ${i + 1} of 6`);
    });
  });

  it("calls onChange when a digit is typed in box 1", () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/OTP digit/);
    fireEvent.change(boxes[0], { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("reflects the current value in the correct boxes", () => {
    render(<OtpInput value="12" onChange={() => {}} />);
    const boxes = screen.getAllByLabelText(/OTP digit/);
    expect(boxes[0]).toHaveValue("1");
    expect(boxes[1]).toHaveValue("2");
    expect(boxes[2]).toHaveValue("");
  });

  it("applies otp-error class to the group when hasError is true", () => {
    const { container } = render(<OtpInput value="" onChange={() => {}} hasError={true} />);
    const group = container.querySelector('[role="group"]');
    expect(group).toHaveClass("otp-error");
  });

  it("does NOT apply otp-error class when hasError is false", () => {
    const { container } = render(<OtpInput value="" onChange={() => {}} hasError={false} />);
    const group = container.querySelector('[role="group"]');
    expect(group).not.toHaveClass("otp-error");
  });
});
