// apps/mobile/app/(protected)/(tabs)/menu.jsx
// The "Menu" tab — the mobile counterpart of the website's sidebar plus its
// profile menu: everything that isn't one of the four main tabs (Home, My
// Complaints, Notices, Community). Same items, same order, same role rules:
//   society:   Polls, Bookings (+ Visitors, Staff directory, Facility calendar
//              as those screens land)
//   authority: Society Dashboard, Transfer Secretary role, Grievance Officer
//   account:   Notification settings, About & Help, Language, Sign out
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import {
  BarChart3,
  Bell,
  Calendar,
  HelpCircle,
  Languages,
  LogOut,
  Scale,
  ShieldCheck,
  UserCog,
} from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkRow } from "../../../components/kit";
import { LanguageSelector } from "../../../components/profile/LanguageSelector";
import { useAuthStore } from "../../../lib/auth-store";
import { getAvatarColor, initials } from "../../../lib/avatar";
import { useMyContext } from "../../../lib/use-my-context";

const T = "/(protected)/(tabs)";

function Group({ title, children }) {
  return (
    <View className="gap-2">
      {title ? (
        <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export default function MenuScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation(["dashboard", "auth", "moderation"]);
  const signOut = useAuthStore((s) => s.signOut);
  const me = useMyContext();
  const [languageOpen, setLanguageOpen] = useState(false);

  const name = me.fullName || "";
  const avatar = getAvatarColor(name || "Member");
  const roleLabel = t(`dashboard:role.${me.role}`, { defaultValue: me.role });
  const langLabel = t(
    `dashboard:language.${{ en: "english", hi: "hindi", mr: "marathi" }[i18n.language] ?? "english"}`,
  );
  const go = (href) => router.push(href);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-6 px-5 pt-5 pb-10">
        {/* Who you are — same block as the website's profile menu header. */}
        <View className="flex-row items-center gap-3">
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: avatar.bg }}
          >
            <Text className="text-base font-semibold" style={{ color: avatar.text }}>
              {initials(name || "Member")}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-neutral-900" numberOfLines={1}>
              {name || " "}
            </Text>
            <Text className="text-sm text-neutral-600" numberOfLines={1}>
              {[me.flatLabel, roleLabel].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>

        <Group title={me.societyName}>
          <LinkRow
            icon={BarChart3}
            label={t("dashboard:tiles.polls")}
            onPress={() => go(`${T}/polls`)}
          />
          <LinkRow
            icon={Calendar}
            label={t("dashboard:tiles.bookings")}
            onPress={() => go(`${T}/bookings`)}
          />
        </Group>

        {me.isAuthority ? (
          <Group>
            <LinkRow
              icon={ShieldCheck}
              label={t("auth:authority.societyDashboard")}
              onPress={() => router.replace(`${T}/society-dashboard`)}
            />
            <LinkRow
              icon={UserCog}
              label={t("dashboard:profile.roleTransfer")}
              onPress={() => go(`${T}/role-transfer`)}
            />
            <LinkRow
              icon={Scale}
              label={t("moderation:grievance.menuRow")}
              onPress={() => go(`${T}/settings/grievance-officer`)}
            />
          </Group>
        ) : null}

        <Group>
          <LinkRow
            icon={Bell}
            label={t("dashboard:profile.notificationSettings")}
            onPress={() => go(`${T}/settings/notifications`)}
          />
          <LinkRow
            icon={HelpCircle}
            label={t("moderation:about.title")}
            onPress={() => go(`${T}/about`)}
          />
          <LinkRow
            icon={Languages}
            label={`${t("dashboard:profile.language")} · ${langLabel}`}
            onPress={() => setLanguageOpen(true)}
          />
        </Group>

        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-0 py-3.5"
        >
          <LogOut size={18} color="#c81e1e" />
          <Text className="text-base font-semibold text-danger-500">
            {t("dashboard:profile.signOut")}
          </Text>
        </Pressable>
      </ScrollView>
      <LanguageSelector visible={languageOpen} onClose={() => setLanguageOpen(false)} />
    </SafeAreaView>
  );
}
