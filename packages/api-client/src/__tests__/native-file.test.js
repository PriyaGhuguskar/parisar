// expo-file-system 55: readAsStringAsync / EncodingType live on the `/legacy`
// subpath (the root export throws). Guard that the api-client imports the legacy
// subpath and keeps the base64 → Uint8Array conversion.

import { describe, expect, it, vi } from "vitest";

const readAsStringAsync = vi.fn(async () =>
  Buffer.from("Hello, Parisar", "utf8").toString("base64"),
);

vi.mock("expo-file-system/legacy", () => ({
  readAsStringAsync,
  EncodingType: { Base64: "base64" },
}));

vi.mock("expo-file-system", () => ({
  readAsStringAsync: () => {
    throw new Error("root expo-file-system legacy API must not be used");
  },
}));

const { base64ToBytes, readNativeFileAsBytes } = await import("../native-file.js");

describe("readNativeFileAsBytes", () => {
  it("reads via expo-file-system/legacy with Base64 encoding and returns the bytes", async () => {
    const bytes = await readNativeFileAsBytes("file:///tmp/photo.jpg");
    expect(readAsStringAsync).toHaveBeenCalledWith("file:///tmp/photo.jpg", { encoding: "base64" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString("utf8")).toBe("Hello, Parisar");
  });
});

describe("base64ToBytes", () => {
  it("decodes base64 to the exact byte sequence", () => {
    const bytes = base64ToBytes(Buffer.from([0, 127, 128, 255]).toString("base64"));
    expect(Array.from(bytes)).toEqual([0, 127, 128, 255]);
  });
});
