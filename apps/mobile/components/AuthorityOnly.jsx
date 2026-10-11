// apps/mobile/components/AuthorityOnly.jsx
// Wraps a screen that only society authorities (secretary / co-secretary) may
// open — the website redirects everyone else to the dashboard, so do the same.
// (The database RPCs and RLS enforce it too; this keeps people from landing on
// a screen that can only fail for them.)
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useMyContext } from "../lib/use-my-context";
import { Text } from "./ui/Text";

function LoadFailed({ onRetry }) {
  const { t } = useTranslation("auth");
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-neutral-50 px-6">
      <Text className="text-center text-base text-neutral-700">{t("common.loadError")}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        className="min-h-11 items-center justify-center rounded-xl bg-brand-600 px-5 py-2"
      >
        <Text className="text-sm font-semibold text-neutral-0">{t("common.retry")}</Text>
      </Pressable>
    </View>
  );
}

/** @param {React.ComponentType} Screen */
export function authorityOnly(Screen) {
  function AuthorityOnlyScreen(props) {
    const me = useMyContext();
    if (!me.ready) {
      return (
        <View className="flex-1 items-center justify-center bg-neutral-50">
          <ActivityIndicator color="#12715A" />
        </View>
      );
    }
    // The live context failed to load: don't decide access from the (possibly
    // stale) token claims — let the person retry instead.
    if (me.error) return <LoadFailed onRetry={() => me.retry?.()} />;
    if (!me.isAuthority) return <Redirect href="/(protected)/(tabs)" />;
    return <Screen {...props} />;
  }
  AuthorityOnlyScreen.displayName = `AuthorityOnly(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return AuthorityOnlyScreen;
}
