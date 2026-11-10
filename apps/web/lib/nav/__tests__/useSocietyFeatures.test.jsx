// useSocietyFeatures: core-only while loading or after a failure, real list once loaded.
// JavaScript only — no TypeScript per CLAUDE.md.

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ mySocietyFeatures: vi.fn() }));
vi.mock("@parisar/api-client", () => api);
vi.mock("../../supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));

import { useSocietyFeatures } from "../useSocietyFeatures";

beforeEach(() => api.mySocietyFeatures.mockReset());

describe("useSocietyFeatures", () => {
  it("counts only core features while loading, then the real list", async () => {
    let resolve;
    api.mySocietyFeatures.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useSocietyFeatures("s1"));
    expect(result.current.status).toBe("loading");
    expect(result.current.isEnabled("notices")).toBe(true);
    expect(result.current.isEnabled("polls")).toBe(false);
    await act(async () => resolve([{ key: "polls", enabled: true }]));
    expect(result.current.status).toBe("ready");
    expect(result.current.isEnabled("polls")).toBe(true);
    expect(result.current.isEnabled("notices")).toBe(false);
  });

  it("reports an error code result as error and retries", async () => {
    api.mySocietyFeatures
      .mockResolvedValueOnce({ error: "NOT_A_MEMBER" })
      .mockResolvedValueOnce([{ key: "community", enabled: true }]);
    const { result } = renderHook(() => useSocietyFeatures("s1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.isEnabled("community")).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isEnabled("community")).toBe(true));
  });

  it("uses a server-loaded list without fetching", () => {
    const { result } = renderHook(() => useSocietyFeatures("s1", { initial: ["bookings"] }));
    expect(result.current.status).toBe("ready");
    expect(result.current.isEnabled("bookings")).toBe(true);
    expect(api.mySocietyFeatures).not.toHaveBeenCalled();
  });
});
