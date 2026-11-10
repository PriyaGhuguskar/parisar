/**
 * Society onboarding: Excel import. Migrations 065-066, 073.
 * Runs against the real database with throwaway users.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  clearRateBuckets,
  codeOf,
  countRows,
  createFixture,
  randomPhone,
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let a; // society A
let b; // society B

beforeAll(async () => {
  await clearRateBuckets(["rpc:import_validate"]);
  staff = await fx.staff();
  a = await fx.society(staff);
  b = await fx.society(staff);
}, 180_000);

afterAll(async () => {
  await fx.cleanup();
}, 120_000);

describe("Excel import", () => {
  const rowFor = (over = {}) => ({
    society_code: a.code,
    wing: "A",
    floor: "1",
    flat: "101",
    full_name: "Riya Sharma",
    resident_type: "owner",
    mobile: randomPhone(),
    ...over,
  });
  const validate = (rows, actor = a.authority, id = a.id) =>
    actor.rpc("import_validate_rows", {
      p_society_id: id,
      p_file_name: "residents.xlsx",
      p_rows: rows,
    });
  const codes = (row) => row.errors.map((e) => e.code);

  it("reports every row-level error", async () => {
    const existing = await a.authority.rpc("manager_add_resident_record", {
      p_society_id: a.id,
      p_flat_id: a.flats["102"],
      p_full_name: "Already Here",
      p_phone: randomPhone(),
      p_resident_type: "owner",
    });
    expect(existing.error).toBeNull();
    const taken = existing.data.phone;
    const dup = randomPhone();

    const { data, error } = await validate([
      rowFor({ row_number: 2, society_code: "XXXX-XXXX" }),
      rowFor({ row_number: 3, wing: "Nope" }),
      rowFor({ row_number: 4, floor: "77" }),
      rowFor({ row_number: 5, flat: "9999" }),
      rowFor({ row_number: 6, resident_type: "landlord" }),
      rowFor({ row_number: 7, mobile: "12345" }),
      rowFor({ row_number: 8, full_name: "" }),
      rowFor({ row_number: 9, mobile: dup }),
      rowFor({ row_number: 10, mobile: dup, flat: "102" }),
      rowFor({ row_number: 11, mobile: taken, flat: "102" }),
      rowFor({ row_number: 12, mobile: taken, flat: "101" }),
      rowFor({
        row_number: 13,
        mobile: `+91 ${randomPhone()}`,
        resident_type: "Family Member",
        email: "bad",
      }),
    ]);
    expect(error).toBeNull();
    const by = Object.fromEntries(data.rows.map((r) => [r.row_number, r]));
    expect(codes(by[2])).toContain("SOCIETY_CODE_MISMATCH");
    expect(codes(by[3])).toContain("WING_NOT_FOUND");
    expect(codes(by[4])).toContain("FLOOR_NOT_FOUND");
    expect(codes(by[5])).toContain("FLAT_NOT_FOUND");
    expect(codes(by[6])).toContain("INVALID_RESIDENT_TYPE");
    expect(codes(by[7])).toContain("INVALID_MOBILE");
    expect(codes(by[8])).toContain("NAME_REQUIRED");
    expect(codes(by[9])).toContain("DUPLICATE_MOBILE_IN_FILE");
    expect(codes(by[10])).toContain("DUPLICATE_MOBILE_IN_FILE");
    expect(codes(by[11])).toContain("DUPLICATE_IN_DB");
    expect(codes(by[12])).toContain("MOBILE_ON_OTHER_FLAT");
    expect(by[13].status).toBe("warning");
    expect(by[13].normalized.resident_type).toBe("family_member");
    expect(by[13].normalized.email).toBeNull();
    expect(by[13].warnings.map((w) => w.code)).toContain("INVALID_EMAIL_IGNORED");
    expect(data.error_rows).toBe(11);
    expect(data.warning_rows).toBe(1);
  });

  it("confirm imports only valid rows, atomically, and never the invalid ones", async () => {
    const good = randomPhone();
    const bad = "12345";
    const { data: batch } = await validate([
      rowFor({ row_number: 2, mobile: good, flat: "104", full_name: "Good Person" }),
      rowFor({ row_number: 3, mobile: bad, flat: "104", full_name: "Bad Person" }),
    ]);
    const before = await countRows("resident_records", { society_id: a.id });

    const { data, error } = await a.authority.rpc("import_confirm_batch", {
      p_batch_id: batch.batch_id,
    });
    expect(error).toBeNull();
    expect(data.imported).toBe(1);
    expect(data.status).toBe("confirmed");
    expect(await countRows("resident_records", { society_id: a.id })).toBe(before + 1);

    const { data: rec } = await adminClient()
      .from("resident_records")
      .select("status, phone10, full_name, source, batch_id")
      .eq("society_id", a.id)
      .eq("phone10", good)
      .single();
    expect(rec).toEqual({
      status: "pending",
      phone10: good,
      full_name: "Good Person",
      source: "import",
      batch_id: batch.batch_id,
    });

    expect(
      codeOf(await a.authority.rpc("import_confirm_batch", { p_batch_id: batch.batch_id })),
    ).toBe("BATCH_ALREADY_CONFIRMED");

    const errors = await a.authority.rpc("import_get_batch", {
      p_batch_id: batch.batch_id,
      p_status: "error",
    });
    expect(errors.data.rows.map((r) => r.row_number)).toEqual([3]);
  });

  it("re-checks at confirm: a row that went bad since validation is not imported", async () => {
    const racer = randomPhone();
    const safe = randomPhone();
    const { data: batch } = await validate([
      rowFor({ row_number: 2, mobile: racer, flat: "104" }),
      rowFor({ row_number: 3, mobile: safe, flat: "104" }),
    ]);
    await a.authority.rpc("manager_add_resident_record", {
      p_society_id: a.id,
      p_flat_id: a.flats["101"],
      p_full_name: "Got There First",
      p_phone: racer,
      p_resident_type: "owner",
    });
    const { data } = await a.authority.rpc("import_confirm_batch", { p_batch_id: batch.batch_id });
    expect(data.imported).toBe(1);
    expect(data.newly_invalid[0].row_number).toBe(2);
    const { data: recs } = await adminClient()
      .from("resident_records")
      .select("full_name")
      .eq("society_id", a.id)
      .eq("phone10", racer);
    expect(recs).toEqual([{ full_name: "Got There First" }]);
  });

  it("a batch with nothing valid imports nothing and stays open", async () => {
    const { data: batch } = await validate([rowFor({ mobile: "1" })]);
    expect(
      codeOf(await a.authority.rpc("import_confirm_batch", { p_batch_id: batch.batch_id })),
    ).toBe("IMPORT_NOTHING_VALID");
    const cancel = await a.authority.rpc("import_cancel_batch", { p_batch_id: batch.batch_id });
    expect(cancel.data.status).toBe("cancelled");
    // The names and mobiles in a cancelled file are not kept.
    expect(await countRows("resident_import_rows", { batch_id: batch.batch_id })).toBe(0);
    expect(
      codeOf(await a.authority.rpc("import_confirm_batch", { p_batch_id: batch.batch_id })),
    ).toBe("BATCH_CANCELLED");
  });

  it("another society cannot validate into, read or confirm this society's batch", async () => {
    const { data: batch } = await validate([rowFor({ flat: "104" })]);
    expect(codeOf(await validate([rowFor()], b.authority, a.id))).toBe("NOT_SOCIETY_MANAGER");
    for (const fn of ["import_get_batch", "import_confirm_batch", "import_cancel_batch"]) {
      expect(codeOf(await b.authority.rpc(fn, { p_batch_id: batch.batch_id })), fn).toBe(
        "BATCH_NOT_FOUND",
      );
    }
    expect(codeOf(await b.authority.rpc("import_list_batches", { p_society_id: a.id }))).toBe(
      "NOT_SOCIETY_MANAGER",
    );
    await a.authority.rpc("import_cancel_batch", { p_batch_id: batch.batch_id });
  });

  it("platform staff get no path to resident names and phones", async () => {
    expect(codeOf(await staff.rpc("import_list_batches", { p_society_id: a.id }))).toBe(
      "NOT_SOCIETY_MANAGER",
    );
    expect(codeOf(await staff.rpc("manager_list_resident_records", { p_society_id: a.id }))).toBe(
      "NOT_SOCIETY_MANAGER",
    );
  });

  it("A's code does not validate against B", async () => {
    const { data } = await validate([rowFor()], b.authority, b.id);
    expect(data.rows[0].errors.map((e) => e.code)).toContain("SOCIETY_CODE_MISMATCH");
  });

  it("clients cannot touch the import or record tables at all", async () => {
    for (const table of ["resident_records", "resident_import_batches", "resident_import_rows"]) {
      const read = await a.authority.client.from(table).select("id").limit(1);
      expect(read.error, table).not.toBeNull();
    }
  });

  it("refuses empty and oversized files", async () => {
    expect(codeOf(await validate([]))).toBe("IMPORT_EMPTY");
    expect(codeOf(await validate(Array.from({ length: 2001 }, () => ({}))))).toBe(
      "IMPORT_TOO_LARGE",
    );
  });

  it("validates a full 2000-row file inside the request timeout", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => rowFor({ row_number: i + 2, flat: "104" }));
    const { data, error } = await validate(rows);
    expect(error).toBeNull();
    expect(data.total_rows).toBe(2000);
    await a.authority.rpc("import_cancel_batch", { p_batch_id: data.batch_id });
  }, 60_000);
});
