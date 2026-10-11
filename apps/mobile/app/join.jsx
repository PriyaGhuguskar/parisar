// apps/mobile/app/join.jsx
// Deep link target for society invites: parisar://join?code=ABCD-1234
// (scheme "parisar" in app.config.js).
//
// Stores the code and hands over to the splash ("/"), which routes as usual:
// signed out → login → OTP → splash → onboarding, where the code is
// pre-filled (lib/join-link.js). Someone who already lives in a society just
// lands in the app; onboarding is never forced on them.
//
// This route sits outside the (auth)/(protected) guards so it is reachable
// both signed in and signed out.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { setPendingJoinCode } from "../lib/join-link";

export default function JoinLinkScreen() {
  const { code } = useLocalSearchParams();
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    const raw = Array.isArray(code) ? code[0] : code;
    setPendingJoinCode(raw).finally(() => {
      if (alive) setDone(true);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  if (done) return <Redirect href="/" />;
  return (
    <View className="flex-1 items-center justify-center bg-neutral-50">
      <ActivityIndicator color="#12715A" />
    </View>
  );
}
