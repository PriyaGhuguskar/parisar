// Pure helpers for the resident import screens. Row and batch shapes are
// import_validate_rows / import_get_batch (docs/onboarding/API.md section 7).

export const ROW_TONE = {
  valid: "success",
  warning: "warning",
  error: "danger",
  imported: "success",
};
export const BATCH_TONE = { validated: "info", confirmed: "success", cancelled: "neutral" };

/** Translated message for one { code, field } row issue. */
export function issueText(t, issue) {
  const code = issue?.code ?? "";
  return t(`import.codes.${code}`, { defaultValue: t("import.codes.UNKNOWN_ISSUE", { code }) });
}

export function rowProblems(t, row) {
  return [...(row.errors ?? []), ...(row.warnings ?? [])].map((i) => issueText(t, i)).join(" ");
}

export function summary(batch) {
  return {
    total: batch?.total_rows ?? 0,
    valid: batch?.valid_rows ?? 0,
    warnings: batch?.warning_rows ?? 0,
    errors: batch?.error_rows ?? 0,
    imported: batch?.imported_rows ?? 0,
  };
}

/** Rows that can be imported: valid and warning rows of an open batch. */
export function importable(batch) {
  if (batch?.status !== "validated") return 0;
  const s = summary(batch);
  return s.valid + s.warnings;
}

/** Rows worth putting in the error report. */
export function reportRows(rows) {
  return (rows ?? []).filter((r) => r.status === "error" || r.status === "warning");
}

/** "A-1-101" from a row's normalized or raw values. */
export function flatLabel(row) {
  const v = row?.normalized ?? row?.raw ?? {};
  return [v.wing, v.floor, v.flat]
    .filter((x) => x !== undefined && x !== null && x !== "")
    .join(" / ");
}

export function rowValue(row, key) {
  const n = row?.normalized?.[key];
  if (n !== undefined && n !== null && n !== "") return String(n);
  const r = row?.raw?.[key];
  return r === undefined || r === null ? "" : String(r);
}

/** Map a parse failure from lib/excel to its i18n key. */
export function parseErrorKey(code) {
  return (
    {
      UNREADABLE: "import.parse.unreadable",
      NO_SHEET: "import.parse.noSheet",
      MISSING_COLUMNS: "import.parse.missingColumns",
      NO_ROWS: "import.parse.noRows",
      TOO_MANY_ROWS: "import.parse.tooManyRows",
    }[code] ?? "import.parse.unreadable"
  );
}

/** Fetch every row of a batch with the given status, 100 at a time. */
export async function fetchAllRows(getPage, batchId, status) {
  const out = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await getPage({ batchId, status, limit: 100, offset });
    if (page?.error) return page;
    const rows = page?.rows ?? [];
    out.push(...rows);
    if (rows.length < 100 || out.length >= (page.rows_total ?? 0)) break;
  }
  return { rows: out };
}
