import { describe, expect, it, vi } from "vitest";
import { needsPersonalOnboarding } from "../personalOnboarding";

const client = (result) => ({ rpc: vi.fn().mockResolvedValue(result) });
const S = "soc-1";

describe("needsPersonalOnboarding", () => {
  it("is false for a member with a flat, without asking the server", async () => {
    const sb = client({});
    await expect(needsPersonalOnboarding(sb, S, { flat_id: "f-1" })).resolves.toBe(false);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("is false when the authority skipped (setup_state complete)", async () => {
    const sb = client({ data: { societies: [{ society_id: S, setup_state: "complete" }] } });
    await expect(needsPersonalOnboarding(sb, S, { flat_id: null })).resolves.toBe(false);
    expect(sb.rpc).toHaveBeenCalledWith("my_authority_societies");
  });
  it("is true while personal onboarding is still owed", async () => {
    const sb = client({
      data: { societies: [{ society_id: S, setup_state: "needs_personal_onboarding" }] },
    });
    await expect(needsPersonalOnboarding(sb, S, { flat_id: null })).resolves.toBe(true);
  });
  it("is true for a flat-less manager not on the authority list", async () => {
    const sb = client({ data: { societies: [] } });
    await expect(needsPersonalOnboarding(sb, S, { flat_id: null })).resolves.toBe(true);
  });
  it("fails towards onboarding when the lookup errors", async () => {
    const sb = client({ error: { message: "boom" } });
    await expect(needsPersonalOnboarding(sb, S, { flat_id: null })).resolves.toBe(true);
  });
});
