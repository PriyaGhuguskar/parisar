// Excel template, parsing and error report for the resident import (/import).
//
// exceljs is large, so it is only ever loaded inside these functions with a
// dynamic import (docs/onboarding/DESIGN.md, Excel). Never import it at the top
// of a file. Parsing is a preview: import_validate_rows checks every row again
// on the server, and import_confirm_batch checks once more before creating.

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 2000;
export const TEMPLATE_SHEET = "Residents";
export const RESIDENT_TYPES = ["Owner", "Tenant", "Family Member"];

// Column keys are the import_validate_rows row keys. Headers stay in English in
// the file itself, so a sheet filled in any language parses the same way.
export const COLUMNS = [
  { key: "society_code", header: "Society Code", required: true, width: 16 },
  { key: "wing", header: "Wing", required: true, width: 10 },
  { key: "floor", header: "Floor", required: true, width: 8 },
  { key: "flat", header: "Flat", required: true, width: 10 },
  { key: "full_name", header: "Full Name", required: true, width: 28 },
  { key: "resident_type", header: "Resident Type", required: true, width: 16 },
  { key: "mobile", header: "Mobile", required: true, width: 16 },
  { key: "email", header: "Email", required: false, width: 28 },
];

const ALIASES = {
  societycode: "society_code",
  code: "society_code",
  wing: "wing",
  wingname: "wing",
  floor: "floor",
  floorno: "floor",
  floornumber: "floor",
  flat: "flat",
  flatno: "flat",
  flatnumber: "flat",
  fullname: "full_name",
  name: "full_name",
  residentname: "full_name",
  residenttype: "resident_type",
  type: "resident_type",
  mobile: "mobile",
  mobileno: "mobile",
  mobilenumber: "mobile",
  phone: "mobile",
  email: "email",
  emailaddress: "email",
};

export async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default ?? mod;
}

function headerKey(text) {
  return (
    ALIASES[
      String(text ?? "")
        .toLowerCase()
        .replace(/[^a-z]/g, "")
    ] ?? null
  );
}

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Text that a spreadsheet would treat as a formula ("=", "+", "-", "@", tab, CR)
 * gets a leading apostrophe, so a name like =HYPERLINK(...) typed into an
 * upload never runs when the error report is opened or re-saved as CSV.
 */
export function neutraliseCell(text) {
  const s = String(text ?? "");
  return FORMULA_START.test(s) ? `'${s}` : s;
}

/** Plain text for any exceljs cell value (rich text, links, formulas, numbers). */
export function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const s = value.trim();
    // Undo neutraliseCell when an error report is uploaded again.
    return s.startsWith("'") && FORMULA_START.test(s.slice(1)) ? s.slice(1) : s;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value.richText))
    return value.richText
      .map((r) => r.text ?? "")
      .join("")
      .trim();
  if (value.text !== undefined) return cellText(value.text);
  if (value.result !== undefined) return cellText(value.result);
  return "";
}

/**
 * The template workbook as an ArrayBuffer.
 * @param {{ societyCode?: string, instructions?: string[] }} opts
 */
export async function buildTemplate({ societyCode = "", instructions = [] } = {}) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Parisar";
  const sheet = wb.addWorksheet(TEMPLATE_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  // Text format keeps mobiles and flat numbers exactly as typed (no 9.87E+09).
  for (const key of ["society_code", "floor", "flat", "mobile"]) sheet.getColumn(key).numFmt = "@";
  const typeCol = COLUMNS.findIndex((c) => c.key === "resident_type") + 1;
  for (let r = 2; r <= MAX_ROWS + 1; r++) {
    sheet.getCell(r, typeCol).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${RESIDENT_TYPES.join(",")}"`],
    };
  }

  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 100;
  const lines = [...instructions];
  if (societyCode) lines.push(`Society Code: ${societyCode}`);
  lines.forEach((line, i) => {
    help.getCell(i + 1, 1).value = line;
  });
  return wb.xlsx.writeBuffer();
}

/**
 * Read the first sheet (or the "Residents" sheet) into import rows.
 * @returns {Promise<{ rows: object[] } | { error: string, missing?: string[] }>}
 */
export async function parseWorkbook(buffer) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { error: "UNREADABLE" };
  }
  const sheet = wb.getWorksheet(TEMPLATE_SHEET) ?? wb.worksheets[0];
  if (!sheet) return { error: "NO_SHEET" };

  const map = new Map();
  sheet.getRow(1).eachCell((cell, col) => {
    const key = headerKey(cellText(cell.value));
    if (key && ![...map.values()].includes(key)) map.set(col, key);
  });
  const found = new Set(map.values());
  const missing = COLUMNS.filter((c) => c.required && !found.has(c.key)).map((c) => c.header);
  if (missing.length) return { error: "MISSING_COLUMNS", missing };

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const out = { row_number: r };
    let any = false;
    for (const c of COLUMNS) out[c.key] = "";
    for (const [col, key] of map) {
      const text = cellText(row.getCell(col).value);
      out[key] = text;
      if (text) any = true;
    }
    if (!any) continue;
    rows.push(out);
    if (rows.length > MAX_ROWS) return { error: "TOO_MANY_ROWS" };
  }
  if (!rows.length) return { error: "NO_ROWS" };
  return { rows };
}

/**
 * Error report workbook for rows with errors or warnings.
 * @param {object[]} rows import rows (server Row shape)
 * @param {{ status: (s) => string, problems: (row) => string, headers: { row, status, problems } }} labels
 */
export async function buildErrorReport(rows, labels) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Error report", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: labels.headers.row, key: "row_number", width: 8 },
    { header: labels.headers.status, key: "status", width: 14 },
    ...COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })),
    { header: labels.headers.problems, key: "problems", width: 70 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    const source = row.raw && typeof row.raw === "object" ? row.raw : (row.normalized ?? {});
    const values = {
      row_number: row.row_number,
      status: neutraliseCell(labels.status(row.status)),
    };
    for (const c of COLUMNS) values[c.key] = neutraliseCell(cellText(source[c.key]));
    values.problems = neutraliseCell(labels.problems(row));
    sheet.addRow(values);
  }
  return wb.xlsx.writeBuffer();
}

/** Save a generated workbook in the browser. */
export function downloadWorkbook(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
