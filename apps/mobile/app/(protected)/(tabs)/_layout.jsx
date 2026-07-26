// apps/mobile/app/(protected)/(tabs)/_layout.jsx
// Expo Router Tabs layout — persistent bottom-nav across every protected screen.
// 3 visible tabs (Home / My Complaints / Profile). Every other post-onboard
// protected route is declared with `href: null` so it stays routable BUT is not
// shown as a tab button — the bottom-nav stays visible while navigating to those
// screens (RESEARCH.md Pitfall 1 option A — user decision #3).
//
// Safe-area (Pitfall 2): tabBarStyle.paddingBottom uses useSafeAreaInsets().bottom
// so the bar clears the iOS home indicator / Android gesture bar. Tab bar height is
// the standard 56px content + safe-area inset.
//
// Red-dot badge (UI-SPEC §Screen 6): the My Complaints tab carries a tabBarBadge
// driven by fetchUnreadComplaintCount(). The v1 stub returns 0 so the dot is
// hidden; Phase 5 swaps the stub for a real query and the dot lights up with no
// layout change here.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Tabs } from "expo-router";
import { LayoutDashboard, MessageSquareWarning, User } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../../lib/auth-store";
import { fetchUnreadComplaintCount } from "../../../lib/complaint-unread";
import { getSupabase } from "../../../lib/supabase";

// Locked nav tokens (UI-SPEC §Color, §Badge Color Contract).
const BRAND_500 = "#12715A"; // active tab tint
const NEUTRAL_400 = "#6e6e6e"; // inactive tab tint
const DANGER_500 = "#c81e1e"; // My Complaints red-dot

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("dashboard");

  // My Complaints red-dot — driven by the unread-complaint helper. v1 stub
  // returns 0, so the badge is hidden (tabBarBadge undefined). Phase 5 wires
  // the real signal and the dot appears automatically.
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchUnreadComplaintCount(getSupabase(), userId)
      .then((n) => {
        if (!cancelled) setUnreadCount(typeof n === "number" ? n : 0);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND_500,
        tabBarInactiveTintColor: NEUTRAL_400,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e5e5e5",
          paddingBottom: insets.bottom,
          height: 56 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      {/* Visible tabs */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.home"),
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my-complaints"
        options={{
          title: t("nav.myComplaints"),
          tabBarIcon: ({ color, size }) => <MessageSquareWarning color={color} size={size} />,
          // Empty-string badge renders the dot without a number (UI-SPEC §Screen 6).
          // undefined hides it entirely. v1 stub keeps unreadCount at 0 → hidden.
          tabBarBadge: unreadCount > 0 ? "" : undefined,
          tabBarBadgeStyle: {
            backgroundColor: DANGER_500,
            minWidth: 8,
            minHeight: 8,
            borderRadius: 4,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("nav.profile"),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />

      {/* Hidden routes (Option A — user decision #3): routable, but not tab buttons.
          The bottom-nav stays visible while these screens are open. */}
      <Tabs.Screen name="directory" options={{ href: null }} />
      <Tabs.Screen name="code-rotation" options={{ href: null }} />
      <Tabs.Screen name="review-queue" options={{ href: null }} />
      <Tabs.Screen name="role-transfer" options={{ href: null }} />
      <Tabs.Screen name="member-detail" options={{ href: null }} />
      <Tabs.Screen name="complaints" options={{ href: null }} />
      <Tabs.Screen name="notices" options={{ href: null }} />
      <Tabs.Screen name="polls" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="settings/notifications" options={{ href: null }} />
      <Tabs.Screen name="notifications/permission" options={{ href: null }} />

      {/* Phase 6 hidden routes (DT-02 durable contract — still exactly 3 visible
          tabs). The member flat-actions tab and the community feed are reached
          via dashboard tiles / push deep-links, NOT bottom-nav tabs.
          `about` is registered here (this plan owns _layout.jsx) even though
          Plan 05 creates about.jsx — href:null keeps it from surfacing as a tab. */}
      <Tabs.Screen name="community" options={{ href: null }} />
      <Tabs.Screen name="flat-actions" options={{ href: null }} />
      <Tabs.Screen name="moderation" options={{ href: null }} />
      <Tabs.Screen name="settings/grievance-officer" options={{ href: null }} />
      <Tabs.Screen name="about" options={{ href: null }} />
    </Tabs>
  );
}
