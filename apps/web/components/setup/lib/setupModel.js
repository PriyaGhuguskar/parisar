// Pure helpers for the society setup wizard (/setup). No React, no Supabase, so
// they are unit-tested directly. Server shapes are the ones in
// docs/onboarding/API.md section 6 (setup_get_state).
//
// The backend tracks nine step keys; the wizard shows five screens:
//   details  -> society_details
//   wings    -> wings      (required)
//   floors   -> floors     (required)
//   flats    -> flats      (required)
//   optional -> amenities, authorities, staff, guards, residents_import

export const WIZARD_STEPS = [
  { id: "details", keys: ["society_details"] },
  { id: "wings", keys: ["wings"] },
  { id: "floors", keys: ["floors"] },
  { id: "flats", keys: ["flats"] },
  { id: "optional", keys: ["amenities", "authorities", "staff", "guards", "residents_import"] },
];

export const OPTIONAL_KEYS = WIZARD_STEPS[4].keys;

export const LIMITS = {
  wingName: 40,
  wingCode: 10,
  floorName: 40,
  floorMin: -10,
  floorMax: 300,
  floorsPerWing: 100,
  flatCount: 500,
  flatNumber: 20,
  parkingSlot: 40,
  areaMax: 1000000,
  bedroomsMax: 20,
  bulkFlats: 500,
};

const WING_CODE_RE = /^[A-Z0-9-]{1,10}$/;

const DONE = new Set(["completed", "skipped"]);

/** { stepKey: status } from setup_get_state().steps. Missing keys are "pending". */
export function stepStatuses(state) {
  const out = {};
  for (const step of state?.steps ?? []) out[step.key] = step.status ?? "pending";
  return out;
}

/**
 * The saved draft for a step, only while the step is still a draft. Once the step
 * is completed the server rows are the truth, and an old draft would resurrect
 * rows that were already applied.
 */
export function stepDraft(state, key) {
  const step = (state?.steps ?? []).find((s) => s.key === key);
  return step?.status === "draft" ? (step.draft ?? null) : null;
}

export function isDone(status) {
  return DONE.has(status);
}

/** A wizard screen is done when every backend key behind it is completed or skipped. */
export function wizardStepDone(statuses, index) {
  const step = WIZARD_STEPS[index];
  return Boolean(step) && step.keys.every((key) => isDone(statuses[key]));
}

/** Where to resume: the first screen that is not done; the last one if all are. */
export function resumeIndex(state) {
  const statuses = stepStatuses(state);
  for (let i = 0; i < WIZARD_STEPS.length; i++) {
    if (!wizardStepDone(statuses, i)) return i;
  }
  return WIZARD_STEPS.length - 1;
}

/** Stepper rows. Done screens become clickable; the shown one is "current". */
export function stepperSteps(labels, state, current) {
  const statuses = stepStatuses(state);
  return WIZARD_STEPS.map((step, index) => {
    let status = "upcoming";
    if (index === current) status = "current";
    else if (wizardStepDone(statuses, index)) status = "complete";
    return { id: step.id, label: labels[step.id], status };
  });
}

/** Translated message for an RPC error code, with a generic fallback. */
export function errorText(t, code) {
  const fallback = t("errors.generic");
  if (!code) return fallback;
  return t(`errors.${code}`, { defaultValue: fallback });
}

export function toInt(value) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number.parseInt(text, 10);
}

const key = (text) =>
  String(text ?? "")
    .trim()
    .toLocaleLowerCase();

// ---- wings --------------------------------------------------------------

export function emptyWingRow() {
  return { name: "", code: "", floors: "", ground: false };
}

/**
 * Validate new wing rows against each other and the wings already saved.
 * @returns {{ errors: Array<object>, valid: boolean }} errors[i] = { name?, code?, floors? } i18n keys
 */
export function validateWingRows(rows, existingWings = []) {
  const names = new Set(existingWings.map((w) => key(w.name)));
  const codes = new Set(existingWings.map((w) => key(w.code)).filter(Boolean));
  const errors = rows.map(() => ({}));
  rows.forEach((row, i) => {
    const name = row.name.trim();
    const code = row.code.trim().toUpperCase();
    if (!name) errors[i].name = "wings.errors.nameRequired";
    else if (name.length > LIMITS.wingName) errors[i].name = "wings.errors.nameLong";
    else if (names.has(key(name))) errors[i].name = "wings.errors.nameDuplicate";
    else names.add(key(name));

    if (code) {
      if (!WING_CODE_RE.test(code)) errors[i].code = "wings.errors.codeInvalid";
      else if (codes.has(key(code))) errors[i].code = "wings.errors.codeDuplicate";
      else codes.add(key(code));
    }

    const floors = toInt(row.floors);
    if (floors === null) errors[i].floors = "wings.errors.floorsRequired";
    else if (floors < 1 || floors > LIMITS.floorsPerWing)
      errors[i].floors = "wings.errors.floorsRange";
  });
  return { errors, valid: errors.every((e) => Object.keys(e).length === 0) };
}

/** Floor numbers a new wing starts with: 0..n-1 with a ground floor, else 1..n. */
export function floorNumbersFor(count, ground) {
  const n = Math.max(0, Math.min(LIMITS.floorsPerWing, Number(count) || 0));
  const start = ground ? 0 : 1;
  return Array.from({ length: n }, (_, i) => start + i);
}

// ---- floors -------------------------------------------------------------

/** Editable rows for one wing's floors. */
export function floorRowsFromWing(wing) {
  return (wing?.floors ?? []).map((f) => ({
    id: f.id,
    number: String(f.number),
    name: f.name ?? "",
    flatCount: String(f.flat_count ?? 0),
    flats: f.flats?.length ?? 0,
  }));
}

export function validateFloorRows(rows) {
  const seen = new Set();
  const errors = rows.map(() => ({}));
  rows.forEach((row, i) => {
    const number = toInt(row.number);
    if (number === null) errors[i].number = "floors.errors.numberRequired";
    else if (number < LIMITS.floorMin || number > LIMITS.floorMax)
      errors[i].number = "floors.errors.numberRange";
    else if (seen.has(number)) errors[i].number = "floors.errors.numberDuplicate";
    else seen.add(number);

    if (row.name.trim().length > LIMITS.floorName) errors[i].name = "floors.errors.nameLong";

    const count = toInt(row.flatCount === "" ? "0" : row.flatCount);
    if (count === null || count < 0 || count > LIMITS.flatCount)
      errors[i].flatCount = "floors.errors.flatCountRange";
  });
  return { errors, valid: errors.every((e) => Object.keys(e).length === 0) };
}

/**
 * What must change on the server to match the edited rows.
 * @returns {{ creates: object[], updates: object[], deletes: string[] }}
 */
export function diffFloors(serverFloors, rows) {
  const byId = new Map((serverFloors ?? []).map((f) => [f.id, f]));
  const kept = new Set();
  const creates = [];
  const updates = [];
  for (const row of rows) {
    const payload = {
      number: toInt(row.number),
      name: row.name.trim() || null,
      flatCount: toInt(row.flatCount === "" ? "0" : row.flatCount) ?? 0,
    };
    const server = row.id ? byId.get(row.id) : null;
    if (!server) {
      creates.push(payload);
      continue;
    }
    kept.add(server.id);
    if (
      server.number !== payload.number ||
      (server.name ?? null) !== payload.name ||
      (server.flat_count ?? 0) !== payload.flatCount
    ) {
      updates.push({ ...payload, floorId: server.id });
    }
  }
  const deletes = [...byId.keys()].filter((id) => !kept.has(id));
  return { creates, updates, deletes };
}

// ---- flats --------------------------------------------------------------

/** Suggested From-To range for a floor from its planned flat count. */
export function suggestedRange(floor) {
  const count = Number(floor?.flat_count ?? 0);
  const number = Number(floor?.number ?? 0);
  if (!count || count < 1) return { from: "", to: "" };
  const base = number >= 1 ? number * 100 : 0;
  return { from: String(base + 1), to: String(base + count) };
}

export function flatsInWing(wing) {
  const out = [];
  for (const floor of wing?.floors ?? []) out.push(...(floor.flats ?? []));
  out.push(...(wing?.unassigned_flats ?? []));
  return out;
}

export function validateFlatAttributes(attrs) {
  const errors = {};
  if (attrs.areaSqft !== "" && attrs.areaSqft !== undefined) {
    const area = Number(attrs.areaSqft);
    if (!Number.isFinite(area) || area < 1 || area > LIMITS.areaMax)
      errors.areaSqft = "flats.errors.areaRange";
  }
  if (attrs.bedrooms !== "" && attrs.bedrooms !== undefined) {
    const beds = toInt(attrs.bedrooms);
    if (beds === null || beds < 0 || beds > LIMITS.bedroomsMax)
      errors.bedrooms = "flats.errors.bedroomsRange";
  }
  if ((attrs.parkingSlot ?? "").trim().length > LIMITS.parkingSlot)
    errors.parkingSlot = "flats.errors.parkingLong";
  return errors;
}

/** RPC-shaped attributes for one flat; blanks become null. */
export function flatPayload(number, attrs) {
  const area = attrs.areaSqft === "" || attrs.areaSqft == null ? null : Number(attrs.areaSqft);
  const beds = attrs.bedrooms === "" || attrs.bedrooms == null ? null : toInt(attrs.bedrooms);
  return {
    number: String(number).trim(),
    flat_type: attrs.flatType || null,
    area_sqft: area,
    bedrooms: beds,
    parking_slot: (attrs.parkingSlot ?? "").trim() || null,
    status: attrs.status || "vacant",
  };
}

/**
 * Turn generator rows into per-floor bulk tasks for each target wing. Numbers a
 * wing already has are skipped (the server would refuse the whole batch).
 *
 * @param {Array<{level:number, numbers:string[]}>} perFloor from buildFlats()
 * @param {object[]} wings target wings (setup_get_state shape)
 * @param {object} attrs shared flat attributes
 * @returns {{ tasks: Array<{wingId, wingName, floorNumber, floorId, flats}>, skipped: number, total: number }}
 */
export function planBulkFlats(perFloor, wings, attrs) {
  const tasks = [];
  let skipped = 0;
  let total = 0;
  for (const wing of wings) {
    const have = new Set(flatsInWing(wing).map((f) => key(f.number)));
    for (const row of perFloor) {
      if (!row.numbers.length) continue;
      const floor = (wing.floors ?? []).find((f) => f.number === row.level) ?? null;
      const fresh = row.numbers.filter((n) => !have.has(key(n)));
      skipped += row.numbers.length - fresh.length;
      if (!fresh.length) continue;
      for (const n of fresh) have.add(key(n));
      total += fresh.length;
      tasks.push({
        wingId: wing.id,
        wingName: wing.name,
        floorNumber: row.level,
        floorId: floor?.id ?? null,
        flats: fresh.map((n) => flatPayload(n, attrs)),
      });
    }
  }
  return { tasks, skipped, total };
}
