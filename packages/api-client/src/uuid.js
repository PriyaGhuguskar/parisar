// Cross-runtime UUID generator shared by the api-client modules.
//
// `crypto.randomUUID` exists in:
//   - Node 19+ (globalThis.crypto)
//   - All modern browsers (web crypto)
//   - React Native via `expo-crypto` polyfill (loaded by Expo Router setup)
//
// Falls back to a v4-shaped string built from getRandomValues if randomUUID is
// unavailable (older RN runtimes). Extracted so notifications/bookings/etc. don't
// each re-implement it (complaints.js keeps its own copy for Phase 4 stability).

export function cryptoRandomUUID() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") {
    return g.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") {
    g.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
