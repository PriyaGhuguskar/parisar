import { describe, expect, it } from "vitest";
import { formatDateValue, parseDateValue, toDateValue } from "../lib/dateValue";
import { describeAccept, formatBytes, validateFile } from "../lib/fileValidation";
import { isValidIndianMobile, normalizeIndianMobile, toE164 } from "../lib/phone";
import { pageRange, paginate, queryRows, totalPages } from "../lib/tableQuery";

describe("phone", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+91-9876543210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["00919876543210", "9876543210"],
    ["9198765432", "9198765432"],
    ["+9198", "98"],
    ["98765432109999", "9876543210"],
    ["abc", ""],
    [null, ""],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizeIndianMobile(raw)).toBe(expected);
  });

  it.each([
    ["9000000001", true],
    ["6000000000", true],
    ["5999999999", false],
    ["987654321", false],
    ["98765432100", false],
    [9876543210, false],
  ])("%s valid: %s", (digits, expected) => {
    expect(isValidIndianMobile(digits)).toBe(expected);
  });

  it("builds E.164 only for a valid number", () => {
    expect(toE164("9876543210")).toBe("+919876543210");
    expect(toE164("123")).toBeNull();
  });
});

describe("dateValue", () => {
  it("round-trips without a timezone shift", () => {
    expect(toDateValue(parseDateValue("2026-01-01"))).toBe("2026-01-01");
  });

  it.each(["2026-02-31", "2026-13-01", "06/11/2026", "", null, 20261106])("rejects %s", (value) => {
    expect(parseDateValue(value)).toBeUndefined();
    expect(formatDateValue(value)).toBe("");
  });

  it("formats in the viewer's language", () => {
    expect(formatDateValue("2026-11-06", "en")).toBe("6 Nov 2026");
    expect(formatDateValue("2026-11-06", "hi")).toMatch(/नव/);
  });

  it("keeps Latin digits in Marathi, where Intl defaults to Devanagari ones", () => {
    const text = formatDateValue("2026-11-06", "mr");
    expect(text).toMatch(/नोव्हें/);
    expect(text).toContain("2026");
    expect(text).not.toMatch(/[०-९]/);
  });
});

describe("fileValidation", () => {
  const file = (name, type, size = 10) => ({ name, type, size });

  it("matches extensions case-insensitively, wildcards and exact types", () => {
    expect(validateFile(file("A.PDF", ""), { accept: [".pdf"] })).toBeNull();
    expect(validateFile(file("a.png", "image/png"), { accept: ["image/*"] })).toBeNull();
    expect(validateFile(file("a", "application/pdf"), { accept: ["application/pdf"] })).toBeNull();
    expect(validateFile(file("a.exe", "x"), { accept: [".pdf", "image/*"] })).toEqual({
      code: "type",
    });
  });

  it("does not let a double extension pass", () => {
    expect(validateFile(file("a.pdf.exe", ""), { accept: [".pdf"] })).toEqual({ code: "type" });
  });

  it("checks size at the boundary, and emptiness first", () => {
    expect(validateFile(file("a", "", 5), { maxBytes: 5 })).toBeNull();
    expect(validateFile(file("a", "", 6), { maxBytes: 5 })).toEqual({ code: "size" });
    expect(validateFile(file("a", "", 0), { maxBytes: 5, accept: [".pdf"] })).toEqual({
      code: "empty",
    });
  });

  it("describes rules for people", () => {
    expect(describeAccept([".pdf", "application/pdf", "image/*"])).toBe("PDF, IMAGE");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("tableQuery", () => {
  const rows = [
    { id: 1, name: "Green Acres", units: 40, status: "new" },
    { id: 2, name: "ग्रीन पार्क", units: 12, status: "registered" },
  ];
  const columns = [{ key: "name" }, { key: "units" }];

  it("searches text, numbers and Devanagari", () => {
    expect(queryRows(rows, { search: "green", columns })).toHaveLength(1);
    expect(queryRows(rows, { search: "12", columns })).toHaveLength(1);
    expect(queryRows(rows, { search: "ग्रीन", columns })).toHaveLength(1);
    expect(queryRows(rows, { search: "  ", columns })).toHaveLength(2);
  });

  it("uses searchValue and a custom match", () => {
    const custom = [{ key: "x", searchValue: (row) => row.status }];
    expect(queryRows(rows, { search: "regist", columns: custom })).toHaveLength(1);
    const filters = [{ key: "big", match: (row) => row.units > 20 }];
    expect(queryRows(rows, { filterValues: { big: "yes" }, filters })).toHaveLength(1);
  });

  it("does not mutate its input", () => {
    const frozen = Object.freeze([...rows]);
    expect(() => queryRows(frozen, { search: "green", columns })).not.toThrow();
  });

  it("pages safely", () => {
    expect(totalPages(0, 10)).toBe(1);
    expect(totalPages(21, 10)).toBe(3);
    expect(paginate([1, 2, 3], 2, 2)).toEqual([3]);
    expect(pageRange(1, 10, 0)).toEqual({ from: 0, to: 0 });
    expect(pageRange(3, 10, 25)).toEqual({ from: 21, to: 25 });
  });
});
