import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo } from "react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let focusCb = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  // Capture the callback passed to useFocusEffect so tests can invoke focus/blur.
  useFocusEffect: (cb) => {
    focusCb = cb;
  },
}));
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({}) }));
jest.mock("../lib/flat-label", () => ({
  fetchFlatLabel: jest.fn().mockResolvedValue("B-203"),
}));

let mockStoreState = { session: null, signOut: jest.fn() };
jest.mock("../lib/auth-store", () => ({
  useAuthStore: (selector) => selector(mockStoreState),
}));

// Name, flat and role come from the database via useMyContext.
jest.mock("../lib/use-my-context", () => ({
  useMyContext: () => {
    const m = mockStoreState.session?.user?.app_metadata ?? {};
    return { ready: true, fullName: m.full_name, flatLabel: m.flat_label, role: m.role };
  },
}));

import { ProfileMenuSheet } from "../components/dashboard/ProfileMenuSheet";

function setSessionRole(role) {
  mockStoreState = {
    signOut: jest.fn().mockResolvedValue(undefined),
    session: {
      user: {
        id: "u-1",
        app_metadata: { society_id: "s-1", role, full_name: "Aman Khan", flat_label: "B-203" },
      },
    },
  };
}

describe("ProfileMenuSheet", () => {
  beforeEach(() => {
    mockPush.mockReset();
    jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders nothing when visible=false", () => {
    setSessionRole("member");
    const { queryByText } = render(<ProfileMenuSheet visible={false} onClose={() => {}} />);
    expect(queryByText("Sign out")).toBeNull();
  });

  it("renders user header (name + flat + role chip)", () => {
    setSessionRole("secretary");
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    expect(getByText("Aman Khan")).toBeTruthy();
    expect(getByText(/B-203/)).toBeTruthy();
  });

  it("always renders Sign Out item", () => {
    setSessionRole("member");
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    expect(getByText("Sign out")).toBeTruthy();
  });

  it("renders Role Transfer for secretary role", () => {
    setSessionRole("secretary");
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    expect(getByText("Transfer Secretary role")).toBeTruthy();
  });

  it("renders Role Transfer for co_secretary role", () => {
    setSessionRole("co_secretary");
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    expect(getByText("Transfer Secretary role")).toBeTruthy();
  });

  it("does NOT render Role Transfer for member role", () => {
    setSessionRole("member");
    const { queryByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    expect(queryByText("Transfer Secretary role")).toBeNull();
  });

  it("does NOT render Role Transfer for board_member role", () => {
    setSessionRole("board_member");
    const { queryByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    expect(queryByText("Transfer Secretary role")).toBeNull();
  });

  it("renders the now-live Notification Settings item (DT-02)", () => {
    setSessionRole("member");
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    expect(getByText("Notification settings")).toBeTruthy();
  });

  it("Tapping Sign Out calls onClose then useAuthStore.signOut", async () => {
    setSessionRole("member");
    const onClose = jest.fn();
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={onClose} />);
    fireEvent.press(getByText("Sign out"));
    await waitFor(() => expect(mockStoreState.signOut).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("Tapping Role Transfer pushes /(protected)/(tabs)/role-transfer", () => {
    setSessionRole("secretary");
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={() => {}} />);
    fireEvent.press(getByText("Transfer Secretary role"));
    expect(mockPush).toHaveBeenCalledWith("/(protected)/(tabs)/role-transfer");
  });

  it("Tapping Notification Settings closes the sheet and pushes the preferences route (DT-02)", () => {
    setSessionRole("member");
    const onClose = jest.fn();
    const { getByText } = render(<ProfileMenuSheet visible={true} onClose={onClose} />);
    fireEvent.press(getByText("Notification settings"));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/(protected)/(tabs)/settings/notifications");
  });
});

// Profile screen (website /profile port): shows the person's details and an
// Edit button. Reached from the Menu tab.
describe("Profile screen", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ProfileScreen = require("../app/(protected)/(tabs)/profile").default;

  it("shows name, flat and the Edit button", () => {
    setSessionRole("secretary");
    const { getByText, getAllByText } = render(<ProfileScreen />);
    expect(getByText("Aman Khan")).toBeTruthy();
    expect(getAllByText("B-203").length).toBeGreaterThan(0);
    expect(getByText("Edit")).toBeTruthy();
  });
});
