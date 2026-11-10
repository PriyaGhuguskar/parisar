import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DatePicker } from "../DatePicker";

vi.mock("../DatePickerCalendar", () => {
  throw new Error("chunk failed");
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

it("shows a retry when the calendar chunk fails, not an endless spinner", async () => {
  render(<DatePicker value="" onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button"));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("couldn't load");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByText("Loading…")).toBeNull();
});
