// Floor-based flat generation, shared by the chairman's first-run setup
// (StructureSetup) and the Add-wing dialog (AddWingDialog).
//
// A "floor" is { id, level, from, to }. Its flats are the inclusive integer
// range from..to (Floor 2 → "201".."206"). A blank/partial range yields no
// flats — that's how a ground floor with no flats is expressed. Everything here
// is pure (no React) so it can be unit-reasoned and reused on both screens.

const MAX_PER_FLOOR = 400; // guard against a fat-fingered range like 1..99999

let seq = 0;

/** A fresh floor row with a unique id. */
export function makeFloor(level, from = "", to = "") {
  seq += 1;
  return { id: `f${seq}`, level, from, to };
}

/** Parse an integer, or null for blank / non-numeric. */
export function toInt(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Flats for a single floor.
 * @returns {{ numbers: string[], invalid: boolean }} invalid when To < From.
 */
export function floorFlats(floor) {
  const s = toInt(floor.from);
  const e = toInt(floor.to);
  if (s === null || e === null) return { numbers: [], invalid: false };
  if (e < s) return { numbers: [], invalid: true };
  const numbers = [];
  for (let n = s; n <= e && numbers.length < MAX_PER_FLOOR; n++) numbers.push(String(n));
  return { numbers, invalid: false };
}

/**
 * Aggregate every floor into the flat list to create.
 * @returns {{ perFloor: Array<{id,level,numbers,invalid}>, all: string[], anyInvalid: boolean }}
 *          `all` is sorted numerically and de-duped across floors.
 */
export function buildFlats(floors) {
  const seen = new Set();
  const all = [];
  let anyInvalid = false;
  const perFloor = floors.map((f) => {
    const { numbers, invalid } = floorFlats(f);
    if (invalid) anyInvalid = true;
    for (const n of numbers) {
      if (seen.has(n)) continue;
      seen.add(n);
      all.push(n);
    }
    return { id: f.id, level: f.level, numbers, invalid };
  });
  all.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { perFloor, all, anyInvalid };
}

/**
 * The next floor, continuing the series: same span as the last floor that had
 * a range, on the next hundred block (201–206 → 301–306). If no floor has a
 * range yet, returns an empty next floor.
 */
export function nextFloor(floors) {
  const last = floors[floors.length - 1];
  const nextLevel = (last?.level ?? floors.length) + 1;
  const lastWithRange = [...floors].reverse().find((f) => toInt(f.from) !== null);
  let from = "";
  let to = "";
  if (lastWithRange) {
    const start = toInt(lastWithRange.from);
    const span = Math.max(0, (toInt(lastWithRange.to) ?? start) - start);
    from = String(nextLevel * 100 + 1);
    to = String(nextLevel * 100 + 1 + span);
  }
  return makeFloor(nextLevel, from, to);
}

/** Default floors for a new wing: a ground floor + a first residential floor. */
export function initialFloors() {
  return [makeFloor(1), makeFloor(2, "201", "")];
}
