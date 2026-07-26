// apps/mobile/components/dashboard/ProfileMenuSheet.jsx
// Slide-up RN Modal — user header + menu items (Role Transfer admin-only,
// Notification Settings placeholder, Sign Out always).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  HelpCircle,
  Languages,
  LogOut,
  Scale,
  UserCog,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { useAuthStore } from "../../lib/auth-store";
import { getAvatarColor, initials } from "../../lib/avatar";
import { fetchFlatLabel } from "../../lib/flat-label";
import { getSupabase } from "../../lib/supabase";
import { LanguageSelector } from "../profile/LanguageSelector";

const DANGER_500 = "#c81e1e";
const NEUTRAL_400 = "#6e6e6e";
const NEUTRAL_900 = "#171717";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 */
export function ProfileMenuSheet({ visible, onClose }) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const { t, i18n } = useTranslation(["dashboard", "moderation"]);

  const meta = session?.user?.app_metadata ?? {};
  const name = meta.full_name ?? meta.name ?? "Member";
  const role = meta.role ?? "member";
  const societyId = meta.society_id ?? null;
  const userId = session?.user?.id;
  const isAdmin = ADMIN_ROLES.has(role);
  const avatarColor = getAvatarColor(name);

  // UI-SPEC §Screen 3 — close ProfileMenu sheet FIRST then open the selector.
  const [languageOpen, setLanguageOpen] = useState(false);
  const langLabelMap = { en: "english", hi: "hindi", mr: "marathi" };
  const activeLangLabel = t(`dashboard:language.${langLabelMap[i18n.language] ?? "english"}`);

  // Resolve flat label. If JWT has flat_label, use it; otherwise fetch.
  const [flatLabel, setFlatLabel] = useState(meta.flat_label ?? "—");
  useEffect(() => {
    if (meta.flat_label) {
      setFlatLabel(meta.flat_label);
      return;
    }
    if (!visible || !userId || !societyId) return;
    let cancelled = false;
    fetchFlatLabel(getSupabase(), userId, societyId).then((label) => {
      if (!cancelled) setFlatLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, userId, societyId, meta.flat_label]);

  const handleSignOut = async () => {
    onClose?.();
    await signOut();
  };

  const handleRoleTransfer = () => {
    onClose?.();
    router.push("/(protected)/(tabs)/role-transfer");
  };

  const handleNotificationSettings = () => {
    onClose?.();
    router.push("/(protected)/(tabs)/settings/notifications");
  };

  const handleGrievanceOfficer = () => {
    onClose?.();
    router.push("/(protected)/(tabs)/settings/grievance-officer");
  };

  const handleAbout = () => {
    onClose?.();
    router.push("/(protected)/(tabs)/about");
  };

  const handleLanguage = () => {
    onClose?.();
    setLanguageOpen(true);
  };

  return (
    <>
      <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
        <Pressable
          className="flex-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Pressable
            className="bg-white rounded-t-3xl p-4 mt-auto"
            onPress={(e) => e.stopPropagation()}
          >
            <View
              className="w-12 h-1 bg-neutral-200 rounded-full self-center mb-4"
              accessibilityElementsHidden
            />

            {/* User header */}
            <View className="flex-row items-center gap-3 mb-4">
              <View
                className="w-12 h-12 rounded-full items-center justify-center"
                style={{ backgroundColor: avatarColor.bg }}
              >
                <Text style={{ color: avatarColor.text }} className="text-base font-semibold">
                  {initials(name)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-neutral-900" numberOfLines={1}>
                  {name}
                </Text>
                <Text className="text-sm text-neutral-600" numberOfLines={1}>
                  {flatLabel} · {t(`dashboard:role.${role}`, { defaultValue: role })}
                </Text>
              </View>
            </View>

            {/* Menu items */}
            {isAdmin ? (
              <MenuItem
                icon={UserCog}
                label={t("dashboard:profile.roleTransfer")}
                onPress={handleRoleTransfer}
              />
            ) : null}

            {/* Admin-only Grievance Officer (Phase 6, D-06). */}
            {isAdmin ? (
              <MenuItem
                icon={Scale}
                label={t("moderation:grievance.menuRow")}
                onPress={handleGrievanceOfficer}
              />
            ) : null}

            <MenuItem
              icon={Bell}
              label={t("dashboard:profile.notificationSettings")}
              onPress={handleNotificationSettings}
            />

            {/* All-roles About & Help (Phase 6). */}
            <MenuItem icon={HelpCircle} label={t("moderation:about.title")} onPress={handleAbout} />

            {/* Language row */}
            <Pressable
              onPress={handleLanguage}
              accessibilityRole="button"
              accessibilityLabel={t("dashboard:profile.language")}
              className="flex-row items-center gap-3 py-3 border-b border-neutral-100"
            >
              <Languages size={20} color={NEUTRAL_900} />
              <Text style={{ color: NEUTRAL_900 }} className="flex-1 text-base">
                {t("dashboard:profile.language")}
              </Text>
              <Text style={{ color: "#525252" }} className="text-sm">
                {activeLangLabel}
              </Text>
              <ChevronRight size={16} color="#12715A" />
            </Pressable>

            <MenuItem
              icon={LogOut}
              label={t("dashboard:profile.signOut")}
              destructive
              onPress={handleSignOut}
              isLast
            />
          </Pressable>
        </Pressable>
      </Modal>

      <LanguageSelector visible={languageOpen} onClose={() => setLanguageOpen(false)} />
    </>
  );
}

function MenuItem({ icon: Icon, label, onPress, destructive, placeholder, isLast }) {
  const { t } = useTranslation("dashboard");
  const color = destructive ? DANGER_500 : placeholder ? NEUTRAL_400 : NEUTRAL_900;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!placeholder }}
      accessibilityLabel={label}
      className={[
        "flex-row items-center gap-3 py-3",
        isLast ? "" : "border-b border-neutral-100",
      ].join(" ")}
    >
      <Icon size={20} color={color} />
      <Text style={{ color }} className="flex-1 text-base">
        {label}
      </Text>
      {placeholder ? (
        <View className="bg-neutral-100 rounded-full px-2 py-0.5">
          <Text className="text-xs text-neutral-600">{t("placeholder.phase5")}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
