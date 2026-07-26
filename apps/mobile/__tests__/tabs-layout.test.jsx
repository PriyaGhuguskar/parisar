import { render } from "@testing-library/react-native";
import React from "react";

// Capture every Tabs.Screen config + the screenOptions passed to <Tabs>.
const tabScreenConfigs = [];
jest.mock("expo-router", () => {
  const React = require("react");
  const Tabs = ({ children, screenOptions }) => {
    Tabs._lastScreenOptions = screenOptions;
    return <>{children}</>;
  };
  Tabs.Screen = (props) => {
    tabScreenConfigs.push(props);
    return null;
  };
  return { Tabs };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));

jest.mock("lucide-react-native", () => ({
  LayoutDashboard: () => null,
  MessageSquareWarning: () => null,
  User: () => null,
}));

// Auth store + supabase + unread helper — keep unreadCount at 0 in the test.
jest.mock("../lib/auth-store", () => ({
  useAuthStore: (selector) => selector({ session: { user: { id: "u-1" } } }),
}));
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({}) }));
jest.mock("../lib/complaint-unread", () => ({
  fetchUnreadComplaintCount: jest.fn().mockResolvedValue(0),
}));

import en from "@parisar/i18n/locales/en/dashboard.json";
import TabsLayout from "../app/(protected)/(tabs)/_layout";

// The first three Tabs.Screen entries are the visible tabs (declared first in
// the layout); the remaining are hidden routes with href:null.
const VISIBLE = ["index", "my-complaints", "profile"];
const HIDDEN = [
  "directory",
  "code-rotation",
  "review-queue",
  "role-transfer",
  "member-detail",
  "complaints",
  "notices",
  "polls",
  "bookings",
  "settings/notifications",
  "notifications/permission",
];

describe("TabsLayout", () => {
  beforeEach(() => {
    tabScreenConfigs.length = 0;
  });

  it("declares 3 visible tabs first: index, my-complaints, profile", () => {
    render(<TabsLayout />);
    const names = tabScreenConfigs.map((c) => c.name);
    expect(names.slice(0, 3)).toEqual(VISIBLE);
  });

  it("declares the 11 hidden routes with href:null", () => {
    render(<TabsLayout />);
    for (const name of HIDDEN) {
      const cfg = tabScreenConfigs.find((c) => c.name === name);
      expect(cfg).toBeTruthy();
      expect(cfg.options.href).toBeNull();
    }
  });

  it("Home tab title matches en.nav.home", () => {
    render(<TabsLayout />);
    expect(tabScreenConfigs[0].options.title).toBe(en.nav.home);
  });

  it("My Complaints tab title matches en.nav.myComplaints", () => {
    render(<TabsLayout />);
    expect(tabScreenConfigs[1].options.title).toBe(en.nav.myComplaints);
  });

  it("Profile tab title matches en.nav.profile", () => {
    render(<TabsLayout />);
    expect(tabScreenConfigs[2].options.title).toBe(en.nav.profile);
  });

  it("tabBarStyle.paddingBottom uses safe-area inset", () => {
    const { Tabs } = require("expo-router");
    render(<TabsLayout />);
    expect(Tabs._lastScreenOptions.tabBarStyle.paddingBottom).toBe(24);
  });

  it("tabBarActiveTintColor is brand.500", () => {
    const { Tabs } = require("expo-router");
    render(<TabsLayout />);
    expect(Tabs._lastScreenOptions.tabBarActiveTintColor).toBe("#12715A");
  });

  it("tabBarInactiveTintColor is neutral.400", () => {
    const { Tabs } = require("expo-router");
    render(<TabsLayout />);
    expect(Tabs._lastScreenOptions.tabBarInactiveTintColor).toBe("#6e6e6e");
  });

  it("my-complaints tab wires tabBarBadge + danger-500 badge style", () => {
    render(<TabsLayout />);
    const myComplaints = tabScreenConfigs.find((c) => c.name === "my-complaints");
    // tabBarBadge prop is present (undefined when unreadCount===0 — badge hidden)
    expect("tabBarBadge" in myComplaints.options).toBe(true);
    expect(myComplaints.options.tabBarBadge).toBeUndefined();
    expect(myComplaints.options.tabBarBadgeStyle.backgroundColor).toBe("#c81e1e");
  });
});
