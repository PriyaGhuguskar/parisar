// Pure helpers for the Wing -> Floor -> Flat pickers. The structure comes from
// onboard_structure_for_code (migration 076): wings with floors and flats; a flat
// with floor_id null was created by the older wizard and has no floor.

export const NO_FLOOR = "__none__";

/** "A-101", or just "101" for the single default wing the older wizard created. */
export function flatLabel(wing, flat) {
  if (!flat) return "";
  return !wing || wing.name === "Main" ? flat.number : `${wing.name}-${flat.number}`;
}

/** Floor name, or "Ground floor" / "Floor 3" / "Basement 1". */
export function floorLabel(floor, t) {
  if (!floor) return t("structure.noFloor");
  if (floor.name) return floor.name;
  if (floor.number === 0) return t("structure.ground");
  if (floor.number < 0) return t("structure.basement", { n: Math.abs(floor.number) });
  return t("structure.floor", { n: floor.number });
}

export function findWing(structure, wingId) {
  return (structure?.wings ?? []).find((w) => w.id === wingId) ?? null;
}

export function findFlat(wing, flatId) {
  return (wing?.flats ?? []).find((f) => f.id === flatId) ?? null;
}

export function findFloor(wing, floorId) {
  return (wing?.floors ?? []).find((f) => f.id === floorId) ?? null;
}

/** Does this wing need a floor picker? Only when it has floors as records. */
export function wingHasFloors(wing) {
  return (wing?.floors ?? []).length > 0;
}

export function wingOptions(structure, t) {
  return (structure?.wings ?? []).map((w) => ({
    value: w.id,
    label: w.name,
    description: t("structure.flatCount", { count: (w.flats ?? []).length }),
    keywords: w.code ?? "",
    disabled: (w.flats ?? []).length === 0,
  }));
}

export function floorOptions(wing, t) {
  if (!wingHasFloors(wing)) return [];
  const flats = wing.flats ?? [];
  const options = wing.floors.map((fl) => {
    const count = flats.filter((f) => f.floor_id === fl.id).length;
    return {
      value: fl.id,
      label: floorLabel(fl, t),
      description: t("structure.flatCount", { count }),
      keywords: String(fl.number),
      disabled: count === 0,
    };
  });
  if (flats.some((f) => !f.floor_id)) {
    options.push({ value: NO_FLOOR, label: t("structure.noFloor") });
  }
  return options;
}

/** Flats on the chosen floor (or the whole wing when it has no floors). */
export function flatOptions(wing, floorId, t) {
  if (!wing) return [];
  const all = wing.flats ?? [];
  let flats = all;
  if (wingHasFloors(wing)) {
    if (!floorId) return [];
    flats = all.filter((f) => (floorId === NO_FLOOR ? !f.floor_id : f.floor_id === floorId));
  }
  return flats.map((f) => ({
    value: f.id,
    label: flatLabel(wing, f),
    description: f.taken ? t("structure.taken") : t("structure.free"),
    keywords: f.number,
  }));
}

/** The wing / floor / flat strings household_lookup matches on. */
export function lookupKeys(wing, flat) {
  const floor = flat?.floor_id ? findFloor(wing, flat.floor_id) : null;
  return {
    wing: wing?.name ?? "",
    floor: floor ? String(floor.number) : null,
    flat: flat?.number ?? "",
  };
}
