/**
 * Society onboarding: the Wing -> Floor -> Flat picker for personal onboarding.
 * Migration 076 (onboard_structure_for_code). Runs against the real database with
 * throwaway users on random numbers, and cleans up after itself.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, codeOf, createFixture } from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let society;
let resident;
let newcomer;

beforeAll(async () => {
  staff = await fx.staff();
  society = await fx.society(staff, { flats: ["101", "102"] });
  resident = await fx.user(undefined, { name: "Rahul Sharma" });
  await fx.seat(society, resident, "101");
  newcomer = await fx.user(undefined, { name: "Neha Joshi" });
}, 180_000);

afterAll(async () => {
  await fx.cleanup();
}, 120_000);

describe("onboard_structure_for_code", () => {
  it("returns wings with floors and flats to someone with no membership", async () => {
    const res = await newcomer.rpc("onboard_structure_for_code", {
      p_code: society.code.toLowerCase(),
    });
    expect(res.error).toBeNull();
    expect(res.data.society_id).toBe(society.id);
    expect(res.data.wings).toHaveLength(1);

    const [wing] = res.data.wings;
    expect(wing).toMatchObject({ id: society.wingId, name: "A", code: "A" });
    expect(wing.floors).toEqual([{ id: society.floorId, number: 1, name: "First" }]);
    const byNumber = Object.fromEntries(wing.flats.map((f) => [f.number, f]));
    expect(byNumber["101"]).toMatchObject({
      id: society.flats["101"],
      floor_id: society.floorId,
      taken: true,
    });
    expect(byNumber["102"]).toMatchObject({
      id: society.flats["102"],
      floor_id: society.floorId,
      taken: false,
    });
  });

  it("returns nothing about people: no names, phones or user ids", async () => {
    const res = await newcomer.rpc("onboard_structure_for_code", { p_code: society.code });
    const text = JSON.stringify(res.data);
    expect(text).not.toContain("Rahul");
    expect(text).not.toContain(resident.phone);
    expect(text).not.toContain(resident.id);
    expect(text).not.toContain(society.authority.phone);
  });

  it("answers a wrong code with INVALID_CODE and reveals no society", async () => {
    const res = await newcomer.rpc("onboard_structure_for_code", { p_code: "ZZZZ-0000" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ error: "INVALID_CODE" });
  });

  it("is not callable without a session", async () => {
    const res = await anonClient().rpc("onboard_structure_for_code", { p_code: society.code });
    expect(res.data?.wings).toBeUndefined();
    expect(codeOf(res)).toBeTruthy();
  });
});
