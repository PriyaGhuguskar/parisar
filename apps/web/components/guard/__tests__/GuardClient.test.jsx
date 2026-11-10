// Gate screen: the security overview sits above the existing entry form, and
// "New visitor" moves focus to the flat picker. The entry flow itself is unchanged.
// JavaScript only — no TypeScript per CLAUDE.md.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@parisar/api-client", () => ({
  guardListFlats: vi
    .fn()
    .mockResolvedValue([{ id: "w1", name: "A", flats: [{ id: "f1", number: "101" }] }]),
  guardCreateVisit: vi.fn(),
  securityDashboard: vi.fn().mockResolvedValue({
    todays_visitors: 4,
    pending: 1,
    approved: 3,
    denied: 0,
    active_sos: 0,
  }),
}));
vi.mock("@/lib/supabase/client", () => {
  const query = {
    select: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    createSupabaseBrowserClient: () => ({
      from: () => query,
      channel: () => channel,
      removeChannel: () => {},
      auth: { signOut: vi.fn() },
    }),
  };
});
vi.mock("@/components/sos/SosAlerts", () => ({ SosAlerts: () => null }));

import { GuardClient } from "../GuardClient";

describe("GuardClient", () => {
  it("shows today's numbers and a New visitor shortcut to the entry form", async () => {
    render(<GuardClient guardName="Ravi" societyName="Lotus Heights" societyId="s1" />);
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
    expect(screen.getByText(/Lotus Heights/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New visitor" }));
    expect(document.activeElement?.id).toBe("gate-flat");
  });
});
