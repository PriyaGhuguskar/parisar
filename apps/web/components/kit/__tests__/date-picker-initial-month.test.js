import { describe, expect, it } from "vitest";
import { initialMonth } from "../DatePickerCalendar";

const d = (s) => new Date(`${s}T00:00:00`);
const today = d("2026-11-07");

describe("initialMonth", () => {
  it("opens on the selected date when there is one", () => {
    expect(initialMonth(d("2026-12-20"), today, d("2027-02-05"), today)).toEqual(d("2026-12-20"));
  });
  it("opens on today, not on max, for a forward-looking range", () => {
    expect(initialMonth(undefined, today, d("2027-02-05"), today)).toEqual(today);
  });
  it("clamps to max when today is past it", () => {
    expect(initialMonth(undefined, undefined, d("2026-01-01"), today)).toEqual(d("2026-01-01"));
  });
  it("clamps to min when today is before it", () => {
    expect(initialMonth(undefined, d("2027-01-01"), undefined, today)).toEqual(d("2027-01-01"));
  });
});
