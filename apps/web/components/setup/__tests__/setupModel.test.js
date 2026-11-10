import { describe, expect, it } from "vitest";
import {
  diffFloors,
  floorNumbersFor,
  planBulkFlats,
  resumeIndex,
  stepperSteps,
  suggestedRange,
  validateFlatAttributes,
  validateFloorRows,
  validateWingRows,
} from "../lib/setupModel";

const steps = (overrides = {}) => ({
  steps: [
    "society_details",
    "authorities",
    "wings",
    "floors",
    "flats",
    "amenities",
    "staff",
    "guards",
    "residents_import",
  ].map((key) => ({ key, status: overrides[key] ?? "pending" })),
});

describe("resumeIndex", () => {
  it("starts at details for a fresh society", () => {
    expect(resumeIndex(steps())).toBe(0);
  });
  it("resumes at the first unfinished screen", () => {
    expect(resumeIndex(steps({ society_details: "completed", wings: "completed" }))).toBe(2);
  });
  it("treats a draft as unfinished", () => {
    expect(resumeIndex(steps({ society_details: "completed", wings: "draft" }))).toBe(1);
  });
  it("lands on the optional screen when everything required is done", () => {
    const s = steps({
      society_details: "skipped",
      wings: "completed",
      floors: "completed",
      flats: "completed",
    });
    expect(resumeIndex(s)).toBe(4);
  });
});

describe("stepperSteps", () => {
  it("marks done screens complete and the shown one current", () => {
    const labels = { details: "D", wings: "W", floors: "F", flats: "L", optional: "O" };
    const rows = stepperSteps(labels, steps({ society_details: "completed" }), 1);
    expect(rows.map((r) => r.status)).toEqual([
      "complete",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });
});

describe("validateWingRows", () => {
  it("requires a name and a floor count", () => {
    const { valid, errors } = validateWingRows([
      { name: " ", code: "", floors: "", ground: false },
    ]);
    expect(valid).toBe(false);
    expect(errors[0]).toEqual({
      name: "wings.errors.nameRequired",
      floors: "wings.errors.floorsRequired",
    });
  });
  it("blocks duplicate names case-insensitively, against saved wings too", () => {
    const { errors } = validateWingRows(
      [
        { name: "b", code: "", floors: "3" },
        { name: "C", code: "", floors: "3" },
        { name: "c ", code: "", floors: "3" },
      ],
      [{ name: "B", code: "B" }],
    );
    expect(errors[0].name).toBe("wings.errors.nameDuplicate");
    expect(errors[1]).toEqual({});
    expect(errors[2].name).toBe("wings.errors.nameDuplicate");
  });
  it("checks the code shape and uniqueness", () => {
    const { errors } = validateWingRows(
      [
        { name: "X", code: "a b", floors: "2" },
        { name: "Y", code: "b", floors: "2" },
      ],
      [{ name: "B", code: "B" }],
    );
    expect(errors[0].code).toBe("wings.errors.codeInvalid");
    expect(errors[1].code).toBe("wings.errors.codeDuplicate");
  });
  it("bounds the floor count", () => {
    expect(validateWingRows([{ name: "A", code: "", floors: "0" }]).errors[0].floors).toBe(
      "wings.errors.floorsRange",
    );
  });
});

describe("floorNumbersFor", () => {
  it("counts from 1, or from 0 with a ground floor", () => {
    expect(floorNumbersFor(3, false)).toEqual([1, 2, 3]);
    expect(floorNumbersFor(3, true)).toEqual([0, 1, 2]);
  });
});

describe("floors", () => {
  it("validates numbers, duplicates and flat counts", () => {
    const { errors, valid } = validateFloorRows([
      { number: "1", name: "", flatCount: "4" },
      { number: "1", name: "", flatCount: "4" },
      { number: "x", name: "", flatCount: "-1" },
    ]);
    expect(valid).toBe(false);
    expect(errors[1].number).toBe("floors.errors.numberDuplicate");
    expect(errors[2]).toEqual({
      number: "floors.errors.numberRequired",
      flatCount: "floors.errors.flatCountRange",
    });
  });

  it("diffs edits into creates, updates and deletes", () => {
    const server = [
      { id: "f1", number: 1, name: null, flat_count: 4 },
      { id: "f2", number: 2, name: null, flat_count: 4 },
    ];
    const diff = diffFloors(server, [
      { id: "f1", number: "1", name: "First", flatCount: "4" },
      { number: "3", name: "", flatCount: "2" },
    ]);
    expect(diff.updates).toEqual([{ floorId: "f1", number: 1, name: "First", flatCount: 4 }]);
    expect(diff.creates).toEqual([{ number: 3, name: null, flatCount: 2 }]);
    expect(diff.deletes).toEqual(["f2"]);
  });
});

describe("flats", () => {
  it("suggests a range from the planned count", () => {
    expect(suggestedRange({ number: 2, flat_count: 4 })).toEqual({ from: "201", to: "204" });
    expect(suggestedRange({ number: 0, flat_count: 2 })).toEqual({ from: "1", to: "2" });
    expect(suggestedRange({ number: 3, flat_count: 0 })).toEqual({ from: "", to: "" });
  });

  it("validates optional attributes", () => {
    expect(validateFlatAttributes({ areaSqft: "0", bedrooms: "30", parkingSlot: "" })).toEqual({
      areaSqft: "flats.errors.areaRange",
      bedrooms: "flats.errors.bedroomsRange",
    });
    expect(validateFlatAttributes({ areaSqft: "", bedrooms: "", parkingSlot: "P-1" })).toEqual({});
  });

  it("plans bulk creation per wing and floor, skipping numbers that exist", () => {
    const wings = [
      {
        id: "w1",
        name: "A",
        floors: [{ id: "f1", number: 1, flats: [{ number: "101" }] }],
        unassigned_flats: [],
      },
      { id: "w2", name: "B", floors: [], unassigned_flats: [] },
    ];
    const plan = planBulkFlats([{ level: 1, numbers: ["101", "102"] }], wings, {
      flatType: "2bhk",
      areaSqft: "",
      bedrooms: "2",
      parkingSlot: "",
      status: "vacant",
    });
    expect(plan.total).toBe(3);
    expect(plan.skipped).toBe(1);
    expect(plan.tasks[0]).toMatchObject({ wingId: "w1", floorId: "f1", floorNumber: 1 });
    expect(plan.tasks[0].flats).toEqual([
      {
        number: "102",
        flat_type: "2bhk",
        area_sqft: null,
        bedrooms: 2,
        parking_slot: null,
        status: "vacant",
      },
    ]);
    expect(plan.tasks[1]).toMatchObject({ wingId: "w2", floorId: null, floorNumber: 1 });
  });
});
