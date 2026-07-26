/**
 * ARCHIVED — Phase 3 web dashboard tests (pre-04.1 layout).
 *
 * These tests assert against the Phase 3 web Secretary DashboardClient
 * (JoinedPercentGauge + CodeCard + recent joiners + pending-review banner)
 * which Phase 04.1 replaces with a unified MyGate-style card grid.
 *
 * Kept on disk as a reference for what Phase 3 used to verify; Phase 7
 * cleanup will delete entirely. Suffixed `.skip.jsx` so the runner ignores
 * the file (vitest's include glob is `**\/*.{test,spec}.{js,jsx}`).
 *
 * Phase 04.1 replacement tests (to be created by Waves 1-4):
 *   apps/web/app/__tests__/dashboard-shell.test.jsx
 *   apps/web/app/__tests__/dashboard-tile.test.jsx
 *   apps/web/app/__tests__/role-tiles.test.js  (already exists, Wave 0)
 *   apps/web/app/__tests__/app-sidebar.test.jsx
 *   apps/web/app/__tests__/avatar.test.jsx     (already exists, Wave 0)
 *
 * Original Phase 3 description:
 *
 * dashboard-03-09.test.jsx
 * Web Secretary DashboardClient + CodeRotationPage — Plan 03-09
 *
 * CodeCard is tested separately in code-card-03-09.test.jsx so it can
 * be imported without the global mock that DashboardClient tests require.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be at top level before imports
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@parisar/api-client", () => ({
  fetchPendingReviews: vi.fn().mockResolvedValue([]),
  fetchRecentJoiners: vi.fn().mockResolvedValue([]),
  rotateSocietyCode: vi.fn().mockResolvedValue({ code: "NEWC-ODE1" }),
  resumeSocietyCode: vi.fn().mockResolvedValue({ resumed: true }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            app_metadata: {
              society_id: "soc-123",
              society_name: "Test Society",
              role: "secretary",
            },
            user_metadata: {},
          },
        },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { code: "PAR7-XKM2", paused_at: null } }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }),
  })),
}));

vi.mock("@/components/dashboard/JoinedPercentGauge", () => ({
  JoinedPercentGauge: ({ societyId, pollIntervalMs }) => (
    <div
      data-testid="joined-percent-gauge"
      data-society-id={societyId}
      data-poll-interval={pollIntervalMs}
    >
      JoinedPercentGauge
    </div>
  ),
}));

vi.mock("@/components/dashboard/CodeCard", () => ({
  CodeCard: ({ code, paused }) => (
    <div data-testid="code-card" data-code={code} data-paused={String(paused)}>
      CodeCard:{code}
    </div>
  ),
}));

vi.mock("@/components/LogoutButton", () => ({
  default: () => <button type="button">Log out</button>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }) => <div data-testid="dialog">{children}</div>,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children, className }) => (
    <h2 data-testid="dialog-title" className={className}>
      {children}
    </h2>
  ),
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
  DialogDescription: ({ children }) => <p data-testid="dialog-description">{children}</p>,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, className, style }) => (
    <div data-testid="avatar" className={className} style={style}>
      {children}
    </div>
  ),
  AvatarFallback: ({ children, style }) => (
    <span data-testid="avatar-fallback" style={style}>
      {children}
    </span>
  ),
}));

// ---------------------------------------------------------------------------
// Tests: DashboardClient
// ---------------------------------------------------------------------------
import { DashboardClient } from "../../app/(protected)/dashboard/DashboardClient";

describe("DashboardClient", () => {
  const defaultProps = {
    societyId: "soc-123",
    societyName: "Green Valley CHS",
    role: "secretary",
    initialCode: "PAR7-XKM2",
    initialPaused: false,
    initialPendingCount: 0,
    initialJoiners: [],
  };

  it("renders society name in the header", () => {
    render(<DashboardClient {...defaultProps} />);
    expect(screen.getByText("Green Valley CHS")).toBeTruthy();
  });

  it("mounts JoinedPercentGauge with societyId and pollIntervalMs=30000", () => {
    render(<DashboardClient {...defaultProps} />);
    const gauge = screen.getByTestId("joined-percent-gauge");
    expect(gauge).toBeTruthy();
    expect(gauge.getAttribute("data-society-id")).toBe("soc-123");
    expect(gauge.getAttribute("data-poll-interval")).toBe("30000");
  });

  it("renders CodeCard", () => {
    render(<DashboardClient {...defaultProps} />);
    expect(screen.getByTestId("code-card")).toBeTruthy();
  });

  it("does NOT show pending review card when count is 0", () => {
    render(<DashboardClient {...defaultProps} />);
    expect(screen.queryByText(/flat conflicts/i)).toBeNull();
  });

  it("shows pending review card when count > 0", () => {
    render(<DashboardClient {...defaultProps} initialPendingCount={3} />);
    expect(screen.getByText(/flat conflicts/i)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders recent joiners heading", () => {
    render(<DashboardClient {...defaultProps} />);
    expect(screen.getByText(/recent joiners/i)).toBeTruthy();
  });

  it("shows empty state when no joiners", () => {
    render(<DashboardClient {...defaultProps} />);
    expect(screen.getByText(/no members have joined yet/i)).toBeTruthy();
  });

  it("renders joiner rows when joiners present", () => {
    const joiners = [
      {
        id: "j1",
        user_id: "u1",
        flat_id: "f1",
        joined_at: new Date(Date.now() - 3600000).toISOString(),
        profiles: { full_name: "Ravi Kumar" },
        flats: { number: "201", wings: { name: "A" } },
      },
    ];
    render(<DashboardClient {...defaultProps} initialJoiners={joiners} />);
    expect(screen.getByText("Ravi Kumar")).toBeTruthy();
    expect(screen.getByText("A-201")).toBeTruthy();
  });

  it("shows paused banner when initialPaused is true", () => {
    render(<DashboardClient {...defaultProps} initialPaused={true} />);
    expect(screen.getByText(/paused after suspicious activity/i)).toBeTruthy();
  });

  it("does NOT show paused banner when not paused", () => {
    render(<DashboardClient {...defaultProps} initialPaused={false} />);
    expect(screen.queryByText(/paused after suspicious activity/i)).toBeNull();
  });

  it("paused banner links to /dashboard/code-rotation", () => {
    render(<DashboardClient {...defaultProps} initialPaused={true} />);
    const banner = screen.getByRole("link", { name: /paused/i });
    expect(banner.getAttribute("href")).toBe("/dashboard/code-rotation");
  });
});

// ---------------------------------------------------------------------------
// Tests: CodeRotationPage
// ---------------------------------------------------------------------------
import CodeRotationPage from "../../app/(protected)/dashboard/code-rotation/page";

describe("CodeRotationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Dialog", async () => {
    render(<CodeRotationPage />);
    await waitFor(() => expect(screen.getByTestId("dialog")).toBeTruthy());
  });

  it("renders dialog title after loading", async () => {
    render(<CodeRotationPage />);
    await waitFor(() => {
      expect(screen.getByTestId("dialog-title")).toBeTruthy();
    });
  });

  it("shows the code rotation title in active state", async () => {
    render(<CodeRotationPage />);
    await waitFor(() => {
      expect(screen.getByText("Rotate Society Code")).toBeTruthy();
    });
  });

  it("shows Generate New Code button in active state", async () => {
    render(<CodeRotationPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate new code/i })).toBeTruthy();
    });
  });

  it("shows Keep Current Code button in active state", async () => {
    render(<CodeRotationPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /keep current code/i })).toBeTruthy();
    });
  });

  it("calls rotateSocietyCode on Generate New Code click", async () => {
    const { rotateSocietyCode } = await import("@parisar/api-client");
    render(<CodeRotationPage />);
    await waitFor(() => screen.getByRole("button", { name: /generate new code/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate new code/i }));
    await waitFor(() => expect(rotateSocietyCode).toHaveBeenCalled());
  });

  it("shows new code after successful rotation", async () => {
    const { rotateSocietyCode } = await import("@parisar/api-client");
    rotateSocietyCode.mockResolvedValueOnce({ code: "NEWC-ODE1" });
    render(<CodeRotationPage />);
    await waitFor(() => screen.getByRole("button", { name: /generate new code/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate new code/i }));
    await waitFor(() => expect(screen.getByText("NEWC-ODE1")).toBeTruthy());
  });

  it("shows resume and rotate-to-new buttons in paused state", async () => {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    createSupabaseBrowserClient.mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              app_metadata: { society_id: "soc-123", role: "secretary" },
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { code: "PAR7-XKM2", paused_at: "2026-05-01T00:00:00Z" },
        }),
      }),
    });

    render(<CodeRotationPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /resume code/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /rotate to new code/i })).toBeTruthy();
    });
  });

  it("calls resumeSocietyCode on Resume Code click", async () => {
    const { resumeSocietyCode } = await import("@parisar/api-client");
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    createSupabaseBrowserClient.mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              app_metadata: { society_id: "soc-123", role: "secretary" },
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { code: "PAR7-XKM2", paused_at: "2026-05-01T00:00:00Z" },
        }),
      }),
    });

    render(<CodeRotationPage />);
    await waitFor(() => screen.getByRole("button", { name: /resume code/i }));
    fireEvent.click(screen.getByRole("button", { name: /resume code/i }));
    await waitFor(() => expect(resumeSocietyCode).toHaveBeenCalled());
  });
});
