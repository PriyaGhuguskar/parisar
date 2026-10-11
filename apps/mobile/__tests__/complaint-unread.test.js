// lib/complaint-unread.js — last-seen timestamp + api-client unread count.

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map();
  return {
    __store: store,
    getItem: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
  };
});
jest.mock("@parisar/api-client", () => ({
  fetchUnreadComplaintCount: jest.fn().mockResolvedValue(2),
}));

const AsyncStorage = require("@react-native-async-storage/async-storage");
const api = require("@parisar/api-client");
const {
  fetchUnreadComplaintCount,
  markComplaintsSeen,
  onComplaintsSeen,
} = require("../lib/complaint-unread");

beforeEach(() => {
  AsyncStorage.__store.clear();
  api.fetchUnreadComplaintCount.mockClear();
});

test("first call starts the clock and reports nothing unread", async () => {
  expect(await fetchUnreadComplaintCount({}, "u-1")).toBe(0);
  expect(api.fetchUnreadComplaintCount).not.toHaveBeenCalled();
  expect(AsyncStorage.__store.get("complaints_last_seen.u-1")).toEqual(expect.any(String));
});

test("later calls pass the stored timestamp to the api-client", async () => {
  AsyncStorage.__store.set("complaints_last_seen.u-1", "2026-01-01T00:00:00.000Z");
  const supabase = {};
  expect(await fetchUnreadComplaintCount(supabase, "u-1")).toBe(2);
  expect(api.fetchUnreadComplaintCount).toHaveBeenCalledWith(supabase, {
    userId: "u-1",
    since: "2026-01-01T00:00:00.000Z",
  });
});

test("returns 0 without a user", async () => {
  expect(await fetchUnreadComplaintCount({}, null)).toBe(0);
});

test("markComplaintsSeen stores now and notifies listeners", async () => {
  const listener = jest.fn();
  const off = onComplaintsSeen(listener);
  await markComplaintsSeen("u-1");
  expect(listener).toHaveBeenCalledWith("u-1");
  expect(Date.parse(AsyncStorage.__store.get("complaints_last_seen.u-1"))).not.toBeNaN();
  off();
  await markComplaintsSeen("u-1");
  expect(listener).toHaveBeenCalledTimes(1);
});
