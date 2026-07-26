// apps/mobile/components/dashboard/SocietyHeaderPill.jsx
// Header pill for the Home screen — "{societyName} · {percent}% joined".
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { fetchJoinPercent } from "@parisar/api-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";

/**
 * @param {object} props
 * @param {string|undefined} props.societyId
 * @param {string} [props.societyName]
 */
export function SocietyHeaderPill({ societyId, societyName = "Your Society" }) {
  const { t } = useTranslation("dashboard");
  const [percent, setPercent] = useState(null);

  useEffect(() => {
    if (!societyId) {
      setPercent(null);
      return;
    }
    let cancelled = false;
    fetchJoinPercent(getSupabase(), societyId)
      .then((p) => {
        if (!cancelled) setPercent(typeof p === "number" ? p : null);
      })
      .catch(() => {
        if (!cancelled) setPercent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  // percent === 0 is a valid value — only null/undefined hides the suffix.
  const suffix =
    percent === null || percent === undefined
      ? ""
      : t("header.joinedPercent", { percent: String(percent) });

  return (
    <View className="flex-row items-baseline">
      <Text className="text-xl font-semibold text-neutral-900 flex-shrink" numberOfLines={1}>
        {societyName}
      </Text>
      {suffix ? (
        <Text className="text-sm text-neutral-600 flex-shrink-0" numberOfLines={1}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}
