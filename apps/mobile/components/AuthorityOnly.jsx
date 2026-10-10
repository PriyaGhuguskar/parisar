// apps/mobile/components/AuthorityOnly.jsx
// Wraps a screen that only society authorities (secretary / co-secretary) may
// open — the website redirects everyone else to the dashboard, so do the same.
// (The database RPCs and RLS enforce it too; this keeps people from landing on
// a screen that can only fail for them.)
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useMyContext } from "../lib/use-my-context";

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
    if (!me.isAuthority) return <Redirect href="/(protected)/(tabs)" />;
    return <Screen {...props} />;
  }
  AuthorityOnlyScreen.displayName = `AuthorityOnly(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return AuthorityOnlyScreen;
}
