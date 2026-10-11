// apps/mobile/components/dashboard/AuthorityEntry.jsx
// "My home | Society Dashboard" switch for society authorities — the mobile
// port of apps/web/components/dashboard/AuthorityEntry.jsx. An authority is
// also a resident: Home is their own resident home, the Society Dashboard is
// where they manage the society. Residents see nothing.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import { Home, ShieldCheck } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { AUTHORITY_ROLES } from "../../lib/use-my-context";

const VIEWS = [
  { id: "home", href: "/(protected)/(tabs)", icon: Home, labelKey: "authority.switchHome" },
  {
    id: "society",
    href: "/(protected)/(tabs)/society-dashboard",
    icon: ShieldCheck,
    labelKey: "authority.societyDashboard",
  },
];

export function AuthorityEntry({ role, active = "home" }) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  if (role !== undefined && !AUTHORITY_ROLES.has(role)) return null;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t("authority.switchLabel")}
      className="mb-5 flex-row self-start rounded-2xl border border-neutral-200 bg-neutral-0 p-1"
    >
      {VIEWS.map(({ id, href, icon: Icon, labelKey }) => {
        const on = id === active;
        return (
          <Pressable
            key={id}
            onPress={() => {
              if (!on) router.replace(href);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            className={`flex-row items-center gap-1.5 rounded-xl px-3.5 py-2 ${
              on ? "bg-brand-500" : ""
            }`}
          >
            <Icon size={15} color={on ? "#fff" : "#475569"} />
            <Text className={`text-sm font-semibold ${on ? "text-neutral-0" : "text-neutral-600"}`}>
              {t(labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
