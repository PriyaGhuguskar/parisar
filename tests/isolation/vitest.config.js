import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.js"],
    testTimeout: 60000,
    hookTimeout: 60000,
    // Run test FILES sequentially so shared test-phone OTP rate-limits don't fire
    // when multiple suites try to sign in with the same phone at the same time.
    // Tests WITHIN each file still run sequentially (describe → it order).
    fileParallelism: false,
    sequence: {
      // Ensure a deterministic order so Phase 1+2 tests run first
      shuffle: false,
    },
  },
});
