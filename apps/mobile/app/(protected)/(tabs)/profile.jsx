// apps/mobile/app/(protected)/(tabs)/profile.jsx
// Profile tab — mounts ProfileMenuSheet with visible={true} on focus, so
// tapping the Profile tab opens the menu. Dismiss → router.back() returns
// the user to the previously-active tab (Home or My Complaints); if there is
// no history, fall back to the Home tab.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ProfileMenuSheet } from "../../../components/dashboard/ProfileMenuSheet";

export default function ProfileTab() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setOpen(true);
      return () => setOpen(false);
    }, []),
  );

  const handleClose = () => {
    setOpen(false);
    // Brief delay so the dismiss animation has a frame.
    setTimeout(() => {
      // If there's no previous screen to go back to, fall back to the Home tab.
      if (router.canGoBack?.()) {
        router.back();
      } else {
        router.replace("/(protected)/(tabs)/");
      }
    }, 250);
  };

  return (
    <View className="flex-1 bg-neutral-50">
      <ProfileMenuSheet visible={open} onClose={handleClose} />
    </View>
  );
}
