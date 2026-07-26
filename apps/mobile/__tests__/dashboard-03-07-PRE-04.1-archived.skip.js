/**
 * ARCHIVED — Phase 3 dashboard tests (pre-04.1 layout).
 *
 * These tests assert against the Phase 3 Secretary dashboard
 * (JoinedPercentGauge + CodeCard + recent joiners list + pending-review
 * banner) which Phase 04.1 replaces with a unified MyGate-style card grid.
 *
 * Kept on disk as a reference for what Phase 3 used to verify; Phase 7
 * cleanup will delete entirely. Suffixed `.skip.js` so the runner ignores
 * the file (jest's default testMatch only picks up `*.test.js` /
 * `*.spec.js`).
 *
 * Phase 04.1 replacement tests (to be created by Waves 1-4):
 *   apps/mobile/__tests__/dashboard-shell.test.js
 *   apps/mobile/__tests__/dashboard-tile.test.js
 *   apps/mobile/__tests__/role-tiles.test.js   (already exists, Wave 0)
 *   apps/mobile/__tests__/tabs-layout.test.js
 *   apps/mobile/__tests__/avatar.test.js       (already exists, Wave 0)
 *
 * Original Phase 3 description:
 *
 * Unit tests for Phase 03-07: Secretary dashboard + CodeCard + code-rotation screen.
 *
 * Covers:
 * - DashboardScreen: renders header + gauge + code card; paused banner shown when paused
 * - CodeCard: Copy button, Share button, Rotate link, paused state + Resume
 * - CodeRotationScreen: active path (rotate), paused path (resume), success states
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-linking", () => ({
  canOpenURL: jest.fn().mockResolvedValue(false),
  openURL: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("react-native/Libraries/Share/Share", () => ({
  share: jest.fn().mockResolvedValue({ action: "sharedAction" }),
}));

jest.mock("date-fns", () => ({
  formatDistanceToNow: jest.fn(() => "2h ago"),
}));

// Mock lucide-react-native so icons render as plain View nodes.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  const mockIcon = ({ testID }) => <View testID={testID} />;
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "__esModule") return true;
        return mockIcon;
      },
    },
  );
});

// Supabase mock — returns predictable data for society_codes queries
const mockSupabaseMaybeSingle = jest.fn().mockResolvedValue({
  data: { code: "PAR7-XKM2", paused_at: null },
  error: null,
});

jest.mock("../lib/supabase", () => ({
  getSupabase: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(function () {
          return this;
        }),
        maybeSingle: mockSupabaseMaybeSingle,
      })),
    })),
  })),
}));

jest.mock("@parisar/api-client", () => ({
  fetchPendingReviews: jest.fn().mockResolvedValue([]),
  fetchRecentJoiners: jest.fn().mockResolvedValue([]),
  rotateSocietyCode: jest.fn().mockResolvedValue({ code: "NEW7-XYZQ" }),
  resumeSocietyCode: jest.fn().mockResolvedValue({ resumed: true }),
}));

jest.mock("../lib/auth-store", () => ({
  useAuthStore: (selector) =>
    selector({
      session: {
        user: {
          id: "u1",
          phone: "919000000001",
          app_metadata: {
            society_id: "soc-1",
            society_name: "Shree Ganesh CHS",
          },
        },
      },
      loading: false,
    }),
}));

// LogoutButton stub
jest.mock("../components/LogoutButton", () => ({
  LogoutButton: () => {
    const { Text } = require("react-native");
    return <Text>Logout</Text>;
  },
}));

// JoinedPercentGauge stub — renders minimal content so we can assert mount
jest.mock("../components/dashboard/JoinedPercentGauge", () => ({
  JoinedPercentGauge: ({ societyId, pollIntervalMs }) => {
    const { Text } = require("react-native");
    return (
      <Text testID="gauge-stub">
        gauge-societyId={societyId} poll={pollIntervalMs}
      </Text>
    );
  },
}));

// ---------------------------------------------------------------------------
// Tests: CodeCard
// ---------------------------------------------------------------------------
describe("CodeCard", () => {
  const { CodeCard } = require("../components/dashboard/CodeCard");

  it("renders society code in monospace text", () => {
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={false} onResume={jest.fn()} />,
    );
    expect(getByText("PAR7-XKM2")).toBeTruthy();
  });

  it("shows Copy and Share buttons", () => {
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={false} onResume={jest.fn()} />,
    );
    expect(getByText("Copy Code")).toBeTruthy();
    expect(getByText("Share via WhatsApp")).toBeTruthy();
  });

  it("shows Rotate Code link text", () => {
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={false} onResume={jest.fn()} />,
    );
    expect(getByText(/Rotate code/i)).toBeTruthy();
  });

  it("copies code to clipboard on Copy press", async () => {
    const Clipboard = require("expo-clipboard");
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={false} onResume={jest.fn()} />,
    );
    fireEvent.press(getByText("Copy Code"));
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith("PAR7-XKM2");
    });
  });

  it("share button press does not throw when WhatsApp unavailable", async () => {
    // When canOpenURL returns false, Share.share fallback is attempted.
    // We verify the button is pressable and canOpenURL is called — Share itself
    // is an RN internal that is undefined in jest-expo; see wa.me test for full URL check.
    const Linking = require("expo-linking");
    Linking.canOpenURL.mockResolvedValueOnce(false);
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={false} onResume={jest.fn()} />,
    );
    // Should not throw
    expect(() => fireEvent.press(getByText("Share via WhatsApp"))).not.toThrow();
    await waitFor(() => {
      expect(Linking.canOpenURL).toHaveBeenCalled();
    });
  });

  it("shows paused state with Resume Code button", () => {
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={true} onResume={jest.fn()} />,
    );
    expect(getByText("Resume Code")).toBeTruthy();
    // Code itself should NOT appear in paused state
    expect(() => getByText("PAR7-XKM2")).toThrow();
  });

  it("calls resumeSocietyCode on Resume press and fires onResume callback", async () => {
    const { resumeSocietyCode } = require("@parisar/api-client");
    const onResume = jest.fn();
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={true} onResume={onResume} />,
    );
    fireEvent.press(getByText("Resume Code"));
    await waitFor(() => {
      expect(resumeSocietyCode).toHaveBeenCalledWith(expect.anything(), { societyId: "soc-1" });
      expect(onResume).toHaveBeenCalledTimes(1);
    });
  });

  it("wa.me share URL is used (WhatsApp deep link pattern)", async () => {
    const Linking = require("expo-linking");
    Linking.canOpenURL.mockClear();
    Linking.canOpenURL.mockResolvedValueOnce(true);
    Linking.openURL.mockClear();
    const { getByText } = render(
      <CodeCard code="PAR7-XKM2" societyId="soc-1" paused={false} onResume={jest.fn()} />,
    );
    fireEvent.press(getByText("Share via WhatsApp"));
    await waitFor(() => {
      expect(Linking.canOpenURL).toHaveBeenCalledWith(expect.stringContaining("wa.me"));
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: DashboardScreen
// ---------------------------------------------------------------------------
describe("DashboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: active code (not paused)
    mockSupabaseMaybeSingle.mockResolvedValue({
      data: { code: "PAR7-XKM2", paused_at: null },
      error: null,
    });
  });

  it("renders society name in header", () => {
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    const { getByText } = render(<DashboardScreen />);
    expect(getByText("Shree Ganesh CHS")).toBeTruthy();
  });

  it("mounts JoinedPercentGauge with societyId and pollIntervalMs=30000", async () => {
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    const { getByTestId } = render(<DashboardScreen />);
    await waitFor(() => {
      const gaugeEl = getByTestId("gauge-stub");
      const children = gaugeEl.props.children;
      // children is an array — check each element for societyId string and poll number
      const text = Array.isArray(children) ? children.join("") : String(children);
      expect(text).toContain("soc-1");
      expect(text).toContain("30000");
    });
  });

  it("calls fetchRecentJoiners and fetchPendingReviews on mount", async () => {
    const { fetchRecentJoiners, fetchPendingReviews } = require("@parisar/api-client");
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(fetchRecentJoiners).toHaveBeenCalledWith(expect.anything(), "soc-1", 5);
      expect(fetchPendingReviews).toHaveBeenCalledWith(expect.anything(), "soc-1");
    });
  });

  it("shows paused banner when paused_at is non-null", async () => {
    mockSupabaseMaybeSingle.mockResolvedValue({
      data: { code: "PAR7-XKM2", paused_at: "2026-05-26T10:00:00Z" },
      error: null,
    });
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    const { findByText } = render(<DashboardScreen />);
    const banner = await findByText(/paused after suspicious activity/i);
    expect(banner).toBeTruthy();
  });

  it("does NOT show paused banner when paused_at is null", async () => {
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    const { queryByText } = render(<DashboardScreen />);
    await act(async () => {});
    expect(queryByText(/paused after suspicious activity/i)).toBeNull();
  });

  it("shows recent joiners heading", async () => {
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    const { getByText } = render(<DashboardScreen />);
    await waitFor(() => {
      expect(getByText("Recent joiners")).toBeTruthy();
    });
  });

  it("shows empty state when no recent joiners", async () => {
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    const { findByText } = render(<DashboardScreen />);
    const emptyMsg = await findByText(/No members have joined yet/i);
    expect(emptyMsg).toBeTruthy();
  });

  it("shows pending review card when count > 0", async () => {
    const { fetchPendingReviews } = require("@parisar/api-client");
    fetchPendingReviews.mockResolvedValueOnce([{ id: "pr1" }, { id: "pr2" }]);
    const DashboardScreen = require("../app/(protected)/dashboard").default;
    const { findByText } = render(<DashboardScreen />);
    // Should find review queue heading
    const heading = await findByText("Flat conflicts to review");
    expect(heading).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: CodeRotationScreen
// ---------------------------------------------------------------------------
describe("CodeRotationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: active code
    mockSupabaseMaybeSingle.mockResolvedValue({
      data: { code: "PAR7-XKM2", paused_at: null },
      error: null,
    });
  });

  it("shows the code rotation title", async () => {
    const CodeRotationScreen = require("../app/(protected)/code-rotation").default;
    const { findByText } = render(<CodeRotationScreen />);
    const title = await findByText("Rotate Society Code");
    expect(title).toBeTruthy();
  });

  it("shows current code on active path", async () => {
    const CodeRotationScreen = require("../app/(protected)/code-rotation").default;
    const { findByText } = render(<CodeRotationScreen />);
    const code = await findByText("PAR7-XKM2");
    expect(code).toBeTruthy();
  });

  it("shows Generate New Code and Keep Current Code buttons on active path", async () => {
    const CodeRotationScreen = require("../app/(protected)/code-rotation").default;
    const { findByText } = render(<CodeRotationScreen />);
    expect(await findByText("Generate New Code")).toBeTruthy();
    expect(await findByText("Keep Current Code")).toBeTruthy();
  });

  it("calls rotateSocietyCode and transitions to success state", async () => {
    const { rotateSocietyCode } = require("@parisar/api-client");
    const CodeRotationScreen = require("../app/(protected)/code-rotation").default;
    const { findByText } = render(<CodeRotationScreen />);

    const rotateBtn = await findByText("Generate New Code");
    fireEvent.press(rotateBtn);

    await waitFor(() => {
      expect(rotateSocietyCode).toHaveBeenCalledWith(expect.anything(), { societyId: "soc-1" });
    });

    // Success state shows new code heading
    expect(await findByText("New code generated")).toBeTruthy();
    // New code should be visible
    expect(await findByText("NEW7-XYZQ")).toBeTruthy();
  });

  it("shows paused heading when code is paused", async () => {
    mockSupabaseMaybeSingle.mockResolvedValue({
      data: { code: "PAR7-XKM2", paused_at: "2026-05-26T10:00:00Z" },
      error: null,
    });
    const CodeRotationScreen = require("../app/(protected)/code-rotation").default;
    const { findByText } = render(<CodeRotationScreen />);
    expect(await findByText("Your code is paused")).toBeTruthy();
  });

  it("shows Resume Code and Rotate to New Code buttons on paused path", async () => {
    mockSupabaseMaybeSingle.mockResolvedValue({
      data: { code: "PAR7-XKM2", paused_at: "2026-05-26T10:00:00Z" },
      error: null,
    });
    const CodeRotationScreen = require("../app/(protected)/code-rotation").default;
    const { findByText } = render(<CodeRotationScreen />);
    expect(await findByText("Resume Code")).toBeTruthy();
    expect(await findByText("Rotate to New Code")).toBeTruthy();
  });

  it("calls resumeSocietyCode and shows success state", async () => {
    mockSupabaseMaybeSingle.mockResolvedValue({
      data: { code: "PAR7-XKM2", paused_at: "2026-05-26T10:00:00Z" },
      error: null,
    });
    const { resumeSocietyCode } = require("@parisar/api-client");
    const CodeRotationScreen = require("../app/(protected)/code-rotation").default;
    const { findByText } = render(<CodeRotationScreen />);

    const resumeBtn = await findByText("Resume Code");
    fireEvent.press(resumeBtn);

    await waitFor(() => {
      expect(resumeSocietyCode).toHaveBeenCalledWith(expect.anything(), { societyId: "soc-1" });
    });

    expect(await findByText("Code is active again.")).toBeTruthy();
  });

  it("imports from @parisar/api-client (rotateSocietyCode + resumeSocietyCode)", () => {
    // Structural test — verifies the module is correctly wired
    const { rotateSocietyCode, resumeSocietyCode } = require("@parisar/api-client");
    expect(typeof rotateSocietyCode).toBe("function");
    expect(typeof resumeSocietyCode).toBe("function");
  });
});
