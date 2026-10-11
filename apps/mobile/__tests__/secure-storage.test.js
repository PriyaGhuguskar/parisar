// Chunked SecureStore adapter (lib/secure-storage.js).

jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k);
    }),
  };
});

const SecureStore = require("expo-secure-store");
const { secureStorage, splitUtf8, CHUNK_BYTES } = require("../lib/secure-storage");

const KEY = "sb-test-auth-token";

beforeEach(() => {
  SecureStore.__store.clear();
});

test("stores a small value directly under the key", async () => {
  await secureStorage.setItem(KEY, "small");
  expect(SecureStore.__store.get(KEY)).toBe("small");
  expect(SecureStore.__store.has(`${KEY}.__chunks`)).toBe(false);
  expect(await secureStorage.getItem(KEY)).toBe("small");
});

test("chunks a large value and reads it back intact", async () => {
  const big = "x".repeat(CHUNK_BYTES * 2 + 10);
  await secureStorage.setItem(KEY, big);
  expect(SecureStore.__store.get(`${KEY}.__chunks`)).toBe("3");
  for (const [k, v] of SecureStore.__store) {
    if (k.includes("__chunk.")) expect(v.length).toBeLessThanOrEqual(CHUNK_BYTES);
  }
  expect(SecureStore.__store.has(KEY)).toBe(false);
  expect(await secureStorage.getItem(KEY)).toBe(big);
});

test("reads a legacy unchunked value", async () => {
  SecureStore.__store.set(KEY, '{"legacy":true}');
  expect(await secureStorage.getItem(KEY)).toBe('{"legacy":true}');
});

test("cleans up stale chunks when the value shrinks", async () => {
  await secureStorage.setItem(KEY, "y".repeat(CHUNK_BYTES * 3 + 1));
  await secureStorage.setItem(KEY, "z".repeat(CHUNK_BYTES + 1));
  expect(SecureStore.__store.get(`${KEY}.__chunks`)).toBe("2");
  expect(SecureStore.__store.has(`${KEY}.__chunk.2`)).toBe(false);
  expect(SecureStore.__store.has(`${KEY}.__chunk.3`)).toBe(false);

  await secureStorage.setItem(KEY, "tiny");
  expect(SecureStore.__store.has(`${KEY}.__chunks`)).toBe(false);
  expect(SecureStore.__store.has(`${KEY}.__chunk.0`)).toBe(false);
  expect(await secureStorage.getItem(KEY)).toBe("tiny");
});

test("removeItem deletes every entry", async () => {
  await secureStorage.setItem(KEY, "w".repeat(CHUNK_BYTES * 2));
  await secureStorage.removeItem(KEY);
  expect(SecureStore.__store.size).toBe(0);
  expect(await secureStorage.getItem(KEY)).toBeNull();
});

test("a missing chunk reads as no session", async () => {
  await secureStorage.setItem(KEY, "v".repeat(CHUNK_BYTES * 2));
  SecureStore.__store.delete(`${KEY}.__chunk.1`);
  expect(await secureStorage.getItem(KEY)).toBeNull();
});

test("splitUtf8 never splits a multi-byte character", () => {
  const s = "क्ष".repeat(500);
  const parts = splitUtf8(s, 100);
  expect(parts.join("")).toBe(s);
  for (const p of parts) expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(100);
});
