import { revealPhone } from "@parisar/api-client";
import { Eye, EyeOff } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";

/**
 * PhonePrivacyChip — inline phone reveal with audit logging on every reveal (mobile).
 *
 * Props:
 *   targetUserId  {string}
 *   mode          {'member'|'secretary'}
 */
export function PhonePrivacyChip({ targetUserId, mode = "member" }) {
  const { t } = useTranslation("auth");
  // 'hidden' | 'confirming' | 'revealing' | 'revealed' | 'error'
  const [state, setState] = useState("hidden");
  const [phone, setPhone] = useState(null);
  const timersRef = useRef([]);

  // Cleanup all pending timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  function pushTimer(timer) {
    timersRef.current.push(timer);
  }

  function tapHidden() {
    if (mode === "secretary") {
      // Secretary mode: reveal immediately without confirmation prompt
      doReveal();
      return;
    }
    setState("confirming");
    // Auto-revert confirming → hidden after 4s if no action
    pushTimer(
      setTimeout(() => {
        setState((s) => (s === "confirming" ? "hidden" : s));
      }, 4000),
    );
  }

  async function doReveal() {
    setState("revealing");
    try {
      const p = await revealPhone(getSupabase(), targetUserId);
      setPhone(p);
      setState("revealed");
      // Auto-revert revealed → hidden after 15s
      pushTimer(
        setTimeout(() => {
          setState("hidden");
          setPhone(null);
        }, 15000),
      );
    } catch {
      setState("error");
      pushTimer(setTimeout(() => setState("hidden"), 2000));
    }
  }

  function tapYes() {
    doReveal();
  }

  if (state === "hidden") {
    return (
      <Pressable
        onPress={tapHidden}
        className="flex-row items-center gap-1 rounded-full bg-neutral-100 px-3 py-1"
        accessibilityRole="button"
        accessibilityLabel={`${t("directory.phoneHidden")}. Press to reveal.`}
      >
        <EyeOff size={16} color="#6e6e6e" />
        <Text className="text-sm text-neutral-400">{t("directory.phoneHidden")}</Text>
      </Pressable>
    );
  }

  if (state === "confirming") {
    return (
      <View className="flex-row items-center gap-2 rounded-full bg-neutral-100 px-3 py-1">
        <Text className="text-sm text-neutral-700">{t("directory.phoneRevealConfirm")}</Text>
        <Pressable
          onPress={tapYes}
          accessibilityRole="button"
          accessibilityLabel={t("directory.phoneRevealYes")}
        >
          <Text className="text-sm font-medium text-brand-500">
            {t("directory.phoneRevealYes")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setState("hidden")}
          accessibilityRole="button"
          accessibilityLabel={t("directory.phoneRevealNo")}
        >
          <Text className="text-sm text-neutral-600">{t("directory.phoneRevealNo")}</Text>
        </Pressable>
      </View>
    );
  }

  if (state === "revealing") {
    return <ActivityIndicator size="small" color="#12715A" accessibilityLabel="Revealing phone" />;
  }

  if (state === "revealed") {
    return (
      <View
        className="flex-row items-center gap-1 rounded-full border border-brand-500 bg-brand-50 px-3 py-1"
        accessibilityLiveRegion="polite"
      >
        <Eye size={16} color="#12715A" />
        <Text className="text-sm text-brand-500">{phone}</Text>
      </View>
    );
  }

  // error state
  return (
    <Text className="text-sm text-danger-500" accessibilityRole="alert">
      Reveal failed
    </Text>
  );
}
