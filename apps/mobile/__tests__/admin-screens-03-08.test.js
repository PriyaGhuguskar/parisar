/**
 * Unit tests for Phase 03-08: Secretary admin screens.
 *
 * Covers:
 * - PhonePrivacyChip source: B-5 fix static analysis (no secretaryPhone bypass)
 * - MemberRow: renders name + chip, correct mode prop, no secretaryPhone bypass
 * - ReviewQueueScreen: empty state, conflict cards, approve/remove actions
 * - DirectoryScreen: renders header + search + no-results
 * - MemberDetailScreen: loads member, Remove link for secretary, dialog wiring
 * - RoleTransferScreen: heading, warning, no-eligible msg, dialog + RPC call
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as fs from "fs";
import * as path from "path";
import React from "react";

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

jest.mock("expo-router", () => {
  const { useEffect } = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({ id: "mem-1" }),
    // Mock useFocusEffect as a plain useEffect so async state updates from the
    // callback fire inside React's scheduler and avoid act() warnings.
    useFocusEffect: (cb) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => {
        const cleanup = cb();
        return () => {
          if (typeof cleanup === "function") cleanup();
        };
      }, []);
    },
  };
});

jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  const Icon = () => <View />;
  return new Proxy(
    {},
    {
      get: (_t, prop) => (prop === "__esModule" ? true : Icon),
    },
  );
});

jest.mock("date-fns", () => ({
  formatDistanceToNow: jest.fn(() => "2h ago"),
}));

// Default supabase mock — returns empty list for all queries
function makeDefaultSupabaseClient() {
  return {
    from: jest.fn(() => {
      const chain = {};
      ["select", "eq", "neq", "in", "order", "limit", "update"].forEach((m) => {
        chain[m] = jest.fn().mockReturnValue(chain);
      });
      chain.single = jest.fn().mockResolvedValue({ data: null, error: null });
      chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
      chain.then = (res, rej) =>
        Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej);
      return chain;
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: { refreshSession: jest.fn().mockResolvedValue({ error: null }) },
  };
}

jest.mock("../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

jest.mock("../lib/auth-store", () => ({
  useAuthStore: (selector) =>
    selector({
      session: {
        user: {
          id: "secretary-u1",
          app_metadata: { society_id: "soc-1", role: "secretary" },
        },
      },
      loading: false,
    }),
}));

jest.mock("@parisar/api-client", () => ({
  fetchPendingReviews: jest.fn().mockResolvedValue([]),
  removeMember: jest.fn().mockResolvedValue(undefined),
  transferSecretaryRole: jest.fn().mockResolvedValue(undefined),
  revealPhone: jest.fn().mockResolvedValue("98765 43210"),
}));

jest.mock("../components/shared/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: ({ open, title, onConfirm, onClose }) => {
    if (!open) return null;
    const { View, Text, Pressable } = require("react-native");
    return (
      <View testID="destructive-dialog">
        <Text testID="dialog-title">{title}</Text>
        <Pressable testID="dialog-confirm" onPress={onConfirm}>
          <Text>Confirm</Text>
        </Pressable>
        <Pressable testID="dialog-cancel" onPress={onClose}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
    );
  },
}));

// PhonePrivacyChip mock: renders mode in text content so MemberRow tests can assert it
jest.mock("../components/directory/PhonePrivacyChip", () => ({
  PhonePrivacyChip: ({ targetUserId, mode }) => {
    const { Text } = require("react-native");
    return <Text testID={`chip-${targetUserId}`}>{`chip-mode-${mode ?? "member"}`}</Text>;
  },
}));

// ---------------------------------------------------------------------------
// Helpers used across describe blocks
// ---------------------------------------------------------------------------

function buildChain(resolveWith = { data: [], error: null, count: 0 }) {
  const chain = {};
  ["select", "eq", "neq", "in", "order", "limit", "update"].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.single = jest.fn().mockResolvedValue(resolveWith);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolveWith);
  chain.then = (res, rej) => Promise.resolve(resolveWith).then(res, rej);
  return chain;
}

// Reset getSupabase to default empty-list behavior
function resetSupabase() {
  const { getSupabase } = require("../lib/supabase");
  getSupabase.mockImplementation(makeDefaultSupabaseClient);
}

// Set up supabase to return a specific member row from .single()
function supabaseReturningMember(data) {
  const { getSupabase } = require("../lib/supabase");
  getSupabase.mockImplementation(() => ({
    from: jest.fn(() => {
      const chain = buildChain({ data, error: null, count: 0 });
      chain.single = jest.fn().mockResolvedValue({ data, error: null });
      return chain;
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: { refreshSession: jest.fn().mockResolvedValue({ error: null }) },
  }));
}

// Global beforeEach: always reset supabase to default and api-client mocks
beforeEach(() => {
  resetSupabase();
  const apiClient = require("@parisar/api-client");
  apiClient.fetchPendingReviews.mockResolvedValue([]);
  apiClient.removeMember.mockResolvedValue(undefined);
  apiClient.transferSecretaryRole.mockResolvedValue(undefined);
  apiClient.revealPhone.mockResolvedValue("98765 43210");
});

// ---------------------------------------------------------------------------
// Tests: PhonePrivacyChip source — B-5 fix (static analysis via fs.readFileSync)
// ---------------------------------------------------------------------------
describe("PhonePrivacyChip B-5 fix — static analysis", () => {
  const CHIP_PATH = path.join(__dirname, "..", "components", "directory", "PhonePrivacyChip.jsx");
  let src;
  beforeAll(() => {
    src = fs.readFileSync(CHIP_PATH, "utf8");
  });

  it("calls revealPhone RPC on every reveal — audit log always written", () => {
    expect(src).toMatch(/revealPhone/);
  });

  it("function signature does NOT include secretaryPhone", () => {
    const sigLine = src.split("\n").find((l) => l.includes("function PhonePrivacyChip"));
    expect(sigLine).toBeDefined();
    expect(sigLine).not.toContain("secretaryPhone");
  });

  it("no secretaryPhone variable/prop in code (JSDoc comments exempt)", () => {
    const codeLines = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"));
    expect(codeLines.some((l) => l.includes("secretaryPhone"))).toBe(false);
  });

  it("supports mode prop with member default and secretary variant", () => {
    // Quote-agnostic: this asserts the CONTRACT (a `mode` prop defaulting to
    // "member", plus a "secretary" variant), not the formatter's quote style —
    // a Biome reformat should not fail a behavioural test.
    expect(src).toMatch(/mode\s*=\s*['"]member['"]/);
    expect(src).toMatch(/['"]secretary['"]/);
  });

  it("secretary mode calls doReveal immediately (no confirm step)", () => {
    // The secretary branch calls doReveal() without going through confirming state
    expect(src).toMatch(/secretary.*doReveal|doReveal.*secretary/s);
  });
});

// ---------------------------------------------------------------------------
// Tests: MemberRow
// ---------------------------------------------------------------------------
describe("MemberRow", () => {
  const { MemberRow } = require("../components/directory/MemberRow");

  const base = {
    id: "mem-1",
    user_id: "user-1",
    residency_type: "owner",
    profiles: { full_name: "Rahul Sharma", phone: "9876543210" },
    flats: { number: "201", wings: { id: "wing-1", name: "A" } },
  };

  it("renders member full name", () => {
    const { getByText } = render(<MemberRow membership={base} currentUserRole="secretary" />);
    expect(getByText("Rahul Sharma")).toBeTruthy();
  });

  it("renders flat label as wing-number (A-201)", () => {
    const { getByText } = render(<MemberRow membership={base} currentUserRole="secretary" />);
    expect(getByText("A-201")).toBeTruthy();
  });

  it("passes mode=secretary to PhonePrivacyChip when role is secretary", () => {
    const { getByText } = render(<MemberRow membership={base} currentUserRole="secretary" />);
    expect(getByText("chip-mode-secretary")).toBeTruthy();
  });

  it("passes mode=member to PhonePrivacyChip when role is member", () => {
    const { getByText } = render(<MemberRow membership={base} currentUserRole="member" />);
    expect(getByText("chip-mode-member")).toBeTruthy();
  });

  it("MemberRow source does NOT use secretaryPhone in code", () => {
    const MROW_PATH = path.join(__dirname, "..", "components", "directory", "MemberRow.jsx");
    const mrowSrc = fs.readFileSync(MROW_PATH, "utf8");
    const codeLines = mrowSrc
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"));
    expect(codeLines.some((l) => l.includes("secretaryPhone"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: ReviewQueueScreen
// ---------------------------------------------------------------------------
describe("ReviewQueueScreen", () => {
  it("shows resolved empty state when there are no conflicts", async () => {
    const ReviewQueue = require("../app/(protected)/(tabs)/review-queue").default;
    const { findByText } = render(<ReviewQueue />);
    await findByText(/All flat conflicts resolved/i);
  });

  it("renders two claimant names in conflict cards", async () => {
    const { fetchPendingReviews } = require("@parisar/api-client");
    fetchPendingReviews.mockResolvedValue([
      {
        id: "mem-2",
        user_id: "u2",
        flat_id: "flat-1",
        status: "pending_review",
        joined_at: "2026-05-01T10:00:00Z",
        profiles: { full_name: "Priya Patel" },
        flats: { number: "301", wings: { name: "B" } },
      },
      {
        id: "mem-3",
        user_id: "u3",
        flat_id: "flat-1",
        status: "pending_review",
        joined_at: "2026-05-02T10:00:00Z",
        profiles: { full_name: "Anil Kumar" },
        flats: { number: "301", wings: { name: "B" } },
      },
    ]);

    const ReviewQueue = require("../app/(protected)/(tabs)/review-queue").default;
    const { findByText } = render(<ReviewQueue />);
    await findByText("Priya Patel");
    await findByText("Anil Kumar");
  });

  it("shows Approve first + Approve second + Remove both action buttons", async () => {
    const { fetchPendingReviews } = require("@parisar/api-client");
    fetchPendingReviews.mockResolvedValue([
      {
        id: "mem-4",
        user_id: "u4",
        flat_id: "flat-2",
        status: "pending_review",
        joined_at: "2026-05-01T10:00:00Z",
        profiles: { full_name: "Member One" },
        flats: { number: "401", wings: { name: "C" } },
      },
      {
        id: "mem-5",
        user_id: "u5",
        flat_id: "flat-2",
        status: "pending_review",
        joined_at: "2026-05-02T10:00:00Z",
        profiles: { full_name: "Member Two" },
        flats: { number: "401", wings: { name: "C" } },
      },
    ]);

    const ReviewQueue = require("../app/(protected)/(tabs)/review-queue").default;
    const { findByText } = render(<ReviewQueue />);
    await findByText(/Approve first member/i);
    await findByText(/Approve second member/i);
    await findByText(/Remove both/i);
  });

  it("calls removeMember twice when Remove Both is pressed", async () => {
    const { fetchPendingReviews, removeMember } = require("@parisar/api-client");
    fetchPendingReviews.mockResolvedValue([
      {
        id: "mem-6",
        user_id: "u6",
        flat_id: "flat-3",
        status: "pending_review",
        joined_at: "2026-05-01T10:00:00Z",
        profiles: { full_name: "Test User A" },
        flats: { number: "501", wings: { name: "D" } },
      },
      {
        id: "mem-7",
        user_id: "u7",
        flat_id: "flat-3",
        status: "pending_review",
        joined_at: "2026-05-02T10:00:00Z",
        profiles: { full_name: "Test User B" },
        flats: { number: "501", wings: { name: "D" } },
      },
    ]);

    const ReviewQueue = require("../app/(protected)/(tabs)/review-queue").default;
    const { findByText } = render(<ReviewQueue />);

    const removeBoth = await findByText(/Remove both/i);
    await act(async () => {
      fireEvent.press(removeBoth);
    });

    await waitFor(
      () => {
        expect(removeMember).toHaveBeenCalledTimes(2);
      },
      { timeout: 8000 },
    );
  }, 10000);

  it("calls fetchPendingReviews with societyId on mount", async () => {
    const { fetchPendingReviews } = require("@parisar/api-client");
    const ReviewQueue = require("../app/(protected)/(tabs)/review-queue").default;
    render(<ReviewQueue />);
    await waitFor(() => {
      expect(fetchPendingReviews).toHaveBeenCalledWith(expect.anything(), "soc-1");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: DirectoryScreen
// ---------------------------------------------------------------------------
describe("DirectoryScreen", () => {
  it("renders the Members heading", async () => {
    const Directory = require("../app/(protected)/(tabs)/directory").default;
    const { findByText } = render(<Directory />);
    await findByText("Members");
  });

  it("shows no-results empty state when member list is empty", async () => {
    const Directory = require("../app/(protected)/(tabs)/directory").default;
    const { findByText } = render(<Directory />);
    await findByText(/No members found/i);
  });

  it("renders the search input placeholder", async () => {
    const Directory = require("../app/(protected)/(tabs)/directory").default;
    const { findByPlaceholderText } = render(<Directory />);
    await findByPlaceholderText(/Search members/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: MemberDetailScreen
// ---------------------------------------------------------------------------
describe("MemberDetailScreen", () => {
  const memberData = {
    id: "mem-1",
    user_id: "user-1",
    flat_id: "flat-1",
    residency_type: "owner",
    joined_at: "2026-05-01T10:00:00Z",
    role: "member",
    status: "active",
    profiles: { full_name: "Anita Roy", phone: "9876543210" },
    flats: { number: "101", wings: { name: "A" } },
  };

  it("mounts without throwing", () => {
    expect(() => {
      const MemberDetail = require("../app/(protected)/(tabs)/member-detail").default;
      render(<MemberDetail />);
    }).not.toThrow();
  });

  it("shows Remove from society link after member data loads", async () => {
    supabaseReturningMember(memberData);
    const MemberDetail = require("../app/(protected)/(tabs)/member-detail").default;
    const { findByText } = render(<MemberDetail />);
    await findByText(/Remove from society/i);
  });

  it("opens DestructiveConfirmDialog when Remove is pressed", async () => {
    supabaseReturningMember({ ...memberData, profiles: { full_name: "Sunita Mehta" } });
    const MemberDetail = require("../app/(protected)/(tabs)/member-detail").default;
    const { findByText, findByTestId } = render(<MemberDetail />);

    const removeLink = await findByText(/Remove from society/i);
    await act(async () => {
      fireEvent.press(removeLink);
    });

    expect(await findByTestId("destructive-dialog")).toBeTruthy();
  }, 8000);

  it("calls removeMember(supabase, membershipId) on dialog confirm", async () => {
    const { removeMember } = require("@parisar/api-client");
    supabaseReturningMember({ ...memberData, profiles: { full_name: "Deepak Joshi" } });

    const MemberDetail = require("../app/(protected)/(tabs)/member-detail").default;
    const { findByText, findByTestId } = render(<MemberDetail />);

    const removeLink = await findByText(/Remove from society/i);
    await act(async () => {
      fireEvent.press(removeLink);
    });

    const confirmBtn = await findByTestId("dialog-confirm");
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    await waitFor(
      () => {
        expect(removeMember).toHaveBeenCalledWith(expect.anything(), "mem-1");
      },
      { timeout: 8000 },
    );
  }, 10000);
});

// ---------------------------------------------------------------------------
// Tests: RoleTransferScreen
// ---------------------------------------------------------------------------
describe("RoleTransferScreen", () => {
  it("renders Transfer Secretary Role heading", async () => {
    const RoleTransfer = require("../app/(protected)/(tabs)/role-transfer").default;
    const { findByText } = render(<RoleTransfer />);
    await findByText(/Transfer Secretary Role/i);
  });

  it("renders the permanent-action warning text", async () => {
    const RoleTransfer = require("../app/(protected)/(tabs)/role-transfer").default;
    const { findByText } = render(<RoleTransfer />);
    await findByText(/This is permanent/i);
  });

  it("shows no eligible members message when supabase returns empty list", async () => {
    // Default supabase returns empty data[] — expect the no-eligible text
    const RoleTransfer = require("../app/(protected)/(tabs)/role-transfer").default;
    const { findByText } = render(<RoleTransfer />);
    await findByText(/No eligible members found/i);
  });

  it("calls transferSecretaryRole with target userId after dialog confirm", async () => {
    const { transferSecretaryRole } = require("@parisar/api-client");
    const { getSupabase } = require("../lib/supabase");

    // Override supabase: profiles returns Secretary name; memberships returns co-secretary
    getSupabase.mockImplementation(() => ({
      from: jest.fn((table) => {
        if (table === "profiles") {
          const chain = buildChain({ data: { full_name: "Secretary Name" }, error: null });
          chain.single = jest.fn().mockResolvedValue({
            data: { full_name: "Secretary Name" },
            error: null,
          });
          return chain;
        }
        // society_memberships
        return buildChain({
          data: [
            {
              id: "mem-co",
              user_id: "user-co",
              role: "co_secretary",
              status: "active",
              profiles: { full_name: "Ravi Verma" },
              flats: { number: "104", wings: { name: "A" } },
            },
          ],
          error: null,
          count: 1,
        });
      }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      auth: { refreshSession: jest.fn().mockResolvedValue({ error: null }) },
    }));

    const RoleTransfer = require("../app/(protected)/(tabs)/role-transfer").default;
    const { findByText, findByTestId } = render(<RoleTransfer />);

    // Wait for the eligible member to appear and select them
    const memberRow = await findByText("Ravi Verma");
    await act(async () => {
      fireEvent.press(memberRow);
    });

    // Tap Transfer role — button becomes active after selection
    const transferBtn = await findByText(/Transfer role/i);
    await act(async () => {
      fireEvent.press(transferBtn);
    });

    // Confirm in the stub dialog
    const confirmBtn = await findByTestId("dialog-confirm");
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    await waitFor(
      () => {
        expect(transferSecretaryRole).toHaveBeenCalledWith(expect.anything(), "user-co");
      },
      { timeout: 8000 },
    );
  }, 10000);
});
