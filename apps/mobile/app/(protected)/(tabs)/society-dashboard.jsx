// apps/mobile/app/(protected)/(tabs)/society-dashboard.jsx
// Society Dashboard — the mobile port of apps/web/app/(protected)/
// society-dashboard (SocietyDashboardClient). Authorities only: the
// authorities list, features & add-ons, and links to every management screen.
// Everyone else is sent back to Home.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Redirect, useRouter } from "expo-router";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  ClipboardCheck,
  Key,
  MessageSquareWarning,
  Scale,
  ShieldAlert,
  Users,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthoritiesSection } from "../../../components/authorities/AuthoritiesSection";
import { SocietyFeaturesSection } from "../../../components/authorities/SocietyFeaturesSection";
import { AuthorityEntry } from "../../../components/dashboard/AuthorityEntry";
import { LinkRow, PageHeader } from "../../../components/kit";
import { useAuthStore } from "../../../lib/auth-store";
import { useMyContext } from "../../../lib/use-my-context";

const T = "/(protected)/(tabs)";
const MANAGE_LINKS = [
  {
    href: `${T}/complaints`,
    icon: MessageSquareWarning,
    labelKey: "dashboard:tiles.allComplaints",
  },
  { href: `${T}/bookings`, icon: CalendarCheck, labelKey: "dashboard:tiles.bookings" },
  { href: `${T}/review-queue`, icon: ClipboardCheck, labelKey: "dashboard:tiles.reviews" },
  { href: `${T}/directory`, icon: Users, labelKey: "dashboard:tiles.directory" },
  { href: `${T}/code-rotation`, icon: Key, labelKey: "dashboard:tiles.societyCode" },
  { href: `${T}/flat-actions`, icon: AlertCircle, labelKey: "dashboard:tiles.flatActions" },
  { href: `${T}/notices/new`, icon: Bell, labelKey: "notifications:notice.composeCta" },
  { href: `${T}/moderation`, icon: ShieldAlert, labelKey: "moderation:moderation.title" },
  {
    href: `${T}/settings/grievance-officer`,
    icon: Scale,
    labelKey: "moderation:grievance.settingsTitle",
  },
];

export default function SocietyDashboardScreen() {
  const { t } = useTranslation(["auth", "dashboard", "notifications", "moderation"]);
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const me = useMyContext();

  if (!me.ready) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator color="#12715A" />
      </View>
    );
  }
  if (!me.isAuthority) return <Redirect href="/(protected)/(tabs)" />;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pt-4 pb-10">
        <AuthorityEntry role={me.role} active="society" />
        <PageHeader
          title={t("authority.societyDashboard")}
          description={t("authority.societyDashboardLead")}
        />
        <View className="gap-8">
          <AuthoritiesSection societyId={me.societyId} userId={userId} />
          <SocietyFeaturesSection societyId={me.societyId} />
          <View>
            <Text className="pb-3 text-lg font-semibold text-neutral-900">
              {t("authority.manageTitle")}
            </Text>
            <View className="gap-2">
              {MANAGE_LINKS.map(({ href, icon, labelKey }) => (
                <LinkRow
                  key={href}
                  icon={icon}
                  label={t(labelKey)}
                  onPress={() => router.push(href)}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
