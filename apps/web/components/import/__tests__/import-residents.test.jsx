import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: vi.fn(() => ({})) }));
vi.mock("@parisar/api-client", () => ({
  importValidateRows: vi.fn(),
  importConfirmBatch: vi.fn(),
  importCancelBatch: vi.fn(),
  importGetBatch: vi.fn(),
  importListBatches: vi.fn(),
}));
vi.mock("../lib/excel", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    buildTemplate: vi.fn(async () => new ArrayBuffer(8)),
    buildErrorReport: vi.fn(async () => new ArrayBuffer(8)),
    parseWorkbook: vi.fn(),
    downloadWorkbook: vi.fn(),
  };
});

import * as api from "@parisar/api-client";
import { ImportResidents } from "../ImportResidents";
import * as excel from "../lib/excel";

const ROWS = [
  {
    row_number: 2,
    status: "valid",
    errors: [],
    warnings: [],
    normalized: {
      full_name: "Riya Sharma",
      resident_type: "owner",
      mobile: "9876543210",
      wing: "A",
      floor: "1",
      flat: "101",
    },
    raw: {},
  },
  {
    row_number: 3,
    status: "warning",
    errors: [],
    warnings: [{ code: "IS_AUTHORITY", field: "mobile" }],
    normalized: {
      full_name: "Amit Rao",
      resident_type: "tenant",
      mobile: "9876543211",
      wing: "A",
      floor: "1",
      flat: "102",
    },
    raw: {},
  },
  {
    row_number: 4,
    status: "error",
    errors: [{ code: "FLAT_NOT_FOUND", field: "flat" }],
    warnings: [],
    normalized: null,
    raw: { full_name: "Neha", wing: "A", floor: "1", flat: "999", mobile: "98765" },
  },
];

const BATCH = {
  batch_id: "b1",
  society_id: "s1",
  file_name: "residents.xlsx",
  status: "validated",
  total_rows: 3,
  valid_rows: 1,
  warning_rows: 1,
  error_rows: 1,
  imported_rows: 0,
  rows: ROWS,
};

function pickFile(container, name = "residents.xlsx") {
  const file = new File(["x"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (!file.arrayBuffer) file.arrayBuffer = async () => new ArrayBuffer(1);
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.importListBatches.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 });
});

describe("ImportResidents", () => {
  it("offers the template, marks the file as required and lists no imports yet", async () => {
    render(<ImportResidents societyId="s1" societyCode="GRMD-AB12" />);
    expect(screen.getByText("GRMD-AB12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download template" }));
    await waitFor(() => expect(excel.downloadWorkbook).toHaveBeenCalled());
    expect(excel.buildTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ societyCode: "GRMD-AB12" }),
    );
    expect(await screen.findByText("No imports yet")).toBeInTheDocument();
  });

  it("asks for a file before checking", async () => {
    render(<ImportResidents societyId="s1" societyCode="" />);
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText("Choose the Excel file to check.")).toBeInTheDocument();
    expect(api.importValidateRows).not.toHaveBeenCalled();
  });

  it("reports a sheet with missing columns without calling the server", async () => {
    excel.parseWorkbook.mockResolvedValue({ error: "MISSING_COLUMNS", missing: ["Mobile"] });
    const { container } = render(<ImportResidents societyId="s1" societyCode="" />);
    pickFile(container);
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(
      await screen.findByText(
        "These columns are missing: Mobile. Start from the Parisar template.",
      ),
    ).toBeInTheDocument();
    expect(api.importValidateRows).not.toHaveBeenCalled();
  });

  it("previews the server's result with totals and row messages, then imports", async () => {
    excel.parseWorkbook.mockResolvedValue({
      rows: [{ row_number: 2 }, { row_number: 3 }, { row_number: 4 }],
    });
    api.importValidateRows.mockResolvedValue(BATCH);
    api.importConfirmBatch.mockResolvedValue({
      ...BATCH,
      status: "confirmed",
      imported_rows: 2,
      imported: 2,
      newly_invalid: [],
    });
    api.importGetBatch.mockResolvedValue({ ...BATCH, rows: ROWS, rows_total: 3 });

    const { container } = render(<ImportResidents societyId="s1" societyCode="GRMD-AB12" />);
    pickFile(container);
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));

    expect(await screen.findByText("Check before importing")).toBeInTheDocument();
    expect(api.importValidateRows).toHaveBeenCalledWith(expect.anything(), {
      societyId: "s1",
      fileName: "residents.xlsx",
      rows: [{ row_number: 2 }, { row_number: 3 }, { row_number: 4 }],
    });
    expect(screen.getAllByText("No such flat in this wing.").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("This mobile is on the society authority list.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Rows with errors: 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download error report" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 records" }));
    expect(await screen.findByText("Records imported: 2")).toBeInTheDocument();
    expect(screen.getByText(/Nothing was sent to them automatically/)).toBeInTheDocument();
    expect(api.importConfirmBatch).toHaveBeenCalledWith(expect.anything(), "b1");
  });

  it("downloads an error report of the problem rows only", async () => {
    excel.parseWorkbook.mockResolvedValue({ rows: [{ row_number: 2 }] });
    api.importValidateRows.mockResolvedValue(BATCH);
    const { container } = render(<ImportResidents societyId="s1" societyCode="" />);
    pickFile(container);
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Download error report" }));
    await waitFor(() => expect(excel.buildErrorReport).toHaveBeenCalled());
    const [rows] = excel.buildErrorReport.mock.calls[0];
    expect(rows.map((r) => r.row_number)).toEqual([3, 4]);
  });

  it("cancels an open batch after confirmation", async () => {
    excel.parseWorkbook.mockResolvedValue({ rows: [{ row_number: 2 }] });
    api.importValidateRows.mockResolvedValue(BATCH);
    api.importCancelBatch.mockResolvedValue({ batch_id: "b1", status: "cancelled" });
    const { container } = render(<ImportResidents societyId="s1" societyCode="" />);
    pickFile(container);
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel import" }));
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel import" }));
    expect(
      await screen.findByText("Import cancelled. The rows from the file were deleted."),
    ).toBeInTheDocument();
    expect(api.importCancelBatch).toHaveBeenCalledWith(expect.anything(), "b1");
  });

  it("shows the server's refusal as an error", async () => {
    excel.parseWorkbook.mockResolvedValue({ rows: [{ row_number: 2 }] });
    api.importValidateRows.mockResolvedValue({ error: "IMPORT_RATE_LIMITED" });
    const { container } = render(<ImportResidents societyId="s1" societyCode="" />);
    pickFile(container);
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(
      await screen.findByText("Too many files checked in the last hour. Try again later."),
    ).toBeInTheDocument();
  });

  it("shows an error state when recent imports cannot load", async () => {
    api.importListBatches.mockResolvedValue({ error: "NOT_SOCIETY_MANAGER" });
    render(<ImportResidents societyId="s1" societyCode="" />);
    expect(await screen.findByText("We couldn't load recent imports.")).toBeInTheDocument();
  });
});
