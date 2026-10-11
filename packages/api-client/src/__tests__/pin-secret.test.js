import { describe, expect, it } from "vitest";
import { derivePinSecret } from "../index.js";

// The PIN credential is server-only (peppered HMAC in supabase/functions/
// pin-login/pin-core.js and apps/web/lib/auth/pinCore.js). The client export
// must never produce a password again.
describe("derivePinSecret (client stub)", () => {
  it("throws instead of deriving a guessable credential", () => {
    expect(() => derivePinSecret("+919812345678", "4821")).toThrow("PIN_DERIVATION_IS_SERVER_ONLY");
  });

  it("throws for any input", () => {
    expect(() => derivePinSecret()).toThrow("PIN_DERIVATION_IS_SERVER_ONLY");
  });
});
