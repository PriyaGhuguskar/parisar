// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildErrorReport,
  buildTemplate,
  COLUMNS,
  cellText,
  MAX_ROWS,
  parseWorkbook,
  TEMPLATE_SHEET,
} from "../lib/excel";

async function sheetWith(rows, headers = COLUMNS.map((c) => c.header)) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const r of rows) sheet.addRow(r);
  return wb.xlsx.writeBuffer();
}

describe("cellText", () => {
  it("reads every exceljs value shape", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(" A ")).toBe("A");
    expect(cellText(9876543210)).toBe("9876543210");
    expect(cellText({ richText: [{ text: "Ri" }, { text: "ya" }] })).toBe("Riya");
    expect(cellText({ text: "a@b.in", hyperlink: "mailto:a@b.in" })).toBe("a@b.in");
    expect(cellText({ formula: "A1", result: 101 })).toBe("101");
  });
});

describe("template", () => {
  it("is a real workbook with the brief's columns and a resident type list", async () => {
    const buffer = await buildTemplate({
      societyCode: "ABCD-EF23",
      instructions: ["Fill one row per resident."],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet(TEMPLATE_SHEET);
    const headers = [];
    sheet.getRow(1).eachCell((cell) => headers.push(cell.value));
    expect(headers).toEqual([
      "Society Code",
      "Wing",
      "Floor",
      "Flat",
      "Full Name",
      "Resident Type",
      "Mobile",
      "Email",
    ]);
    expect(sheet.getCell("F2").dataValidation.formulae[0]).toContain("Family Member");
    const help = wb.getWorksheet("Instructions");
    expect(help.getCell("A2").value).toBe("Society Code: ABCD-EF23");
  });

  it("parses back as having no rows", async () => {
    const buffer = await buildTemplate();
    expect(await parseWorkbook(buffer)).toEqual({ error: "NO_ROWS" });
  });
});

describe("parseWorkbook", () => {
  it("maps columns by header, keeps sheet row numbers and skips blank rows", async () => {
    const buffer = await sheetWith([
      ["ABCD-EF23", "A", 1, 101, "Riya Sharma", "Owner", 9876543210, ""],
      [],
      ["ABCD-EF23", "A", "1", "102", "Kabir", "Tenant", "98765 43211", "k@x.in"],
    ]);
    const res = await parseWorkbook(buffer);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toEqual({
      row_number: 2,
      society_code: "ABCD-EF23",
      wing: "A",
      floor: "1",
      flat: "101",
      full_name: "Riya Sharma",
      resident_type: "Owner",
      mobile: "9876543210",
      email: "",
    });
    expect(res.rows[1].row_number).toBe(4);
  });

  it("accepts header aliases in any order", async () => {
    const buffer = await sheetWith(
      [["9876543210", "Riya", "owner", "101", "1", "A", "ABCD-EF23"]],
      ["Phone", "Name", "Type", "Flat No", "Floor Number", "Wing", "Society Code"],
    );
    const res = await parseWorkbook(buffer);
    expect(res.rows[0]).toMatchObject({ mobile: "9876543210", full_name: "Riya", flat: "101" });
  });

  it("reports missing required columns", async () => {
    const buffer = await sheetWith([["x"]], ["Wing", "Flat"]);
    const res = await parseWorkbook(buffer);
    expect(res.error).toBe("MISSING_COLUMNS");
    expect(res.missing).toContain("Mobile");
  });

  it("enforces the row limit", async () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => [
      "C",
      "A",
      "1",
      String(i),
      "N",
      "Owner",
      "9876543210",
      "",
    ]);
    expect(await parseWorkbook(await sheetWith(rows))).toEqual({ error: "TOO_MANY_ROWS" });
  });

  it("rejects a file that is not a workbook", async () => {
    expect(await parseWorkbook(new TextEncoder().encode("not a zip").buffer)).toEqual({
      error: "UNREADABLE",
    });
  });
});

describe("error report", () => {
  it("lists each row with its status and problems", async () => {
    const buffer = await buildErrorReport(
      [
        {
          row_number: 3,
          status: "error",
          errors: [{ code: "INVALID_MOBILE", field: "mobile" }],
          warnings: [],
          raw: {
            society_code: "C",
            wing: "A",
            floor: "1",
            flat: "101",
            full_name: "R",
            resident_type: "Owner",
            mobile: "12",
          },
        },
      ],
      {
        headers: { row: "Row", status: "Status", problems: "Problems" },
        status: (s) => s.toUpperCase(),
        problems: (row) => row.errors.map((e) => e.code).join("; "),
      },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    expect(sheet.getRow(2).values.slice(1)).toEqual([
      3,
      "ERROR",
      "C",
      "A",
      "1",
      "101",
      "R",
      "Owner",
      "12",
      "",
      "INVALID_MOBILE",
    ]);
  });

  it("neutralises formula-like cell text so spreadsheets never evaluate it", async () => {
    const evil = '=HYPERLINK("http://evil.example","x")';
    const buffer = await buildErrorReport(
      [
        {
          row_number: 4,
          status: "error",
          errors: [{ code: "INVALID_NAME", field: "full_name" }],
          warnings: [],
          raw: {
            society_code: "+SUM(1,2)",
            wing: "-2+3",
            floor: "@cmd",
            flat: "\t=1+1",
            full_name: evil,
            resident_type: "Owner",
            mobile: "9876543210",
          },
        },
      ],
      {
        headers: { row: "Row", status: "Status", problems: "Problems" },
        status: (s) => s,
        problems: () => "=1+1",
      },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const row = wb.worksheets[0].getRow(2);
    row.eachCell((cell) => {
      expect(cell.type).not.toBe(ExcelJS.ValueType.Formula);
      if (typeof cell.value === "string") expect(cell.value).not.toMatch(/^[=+\-@\t\r]/);
    });
    expect(row.getCell(7).value).toBe(`'${evil}`);
    expect(row.getCell(9).value).toBe("9876543210");
  });

  it("reads a neutralised cell back as the original text", () => {
    expect(cellText("'=1+1")).toBe("=1+1");
    expect(cellText("'Rahul")).toBe("'Rahul");
  });
});
