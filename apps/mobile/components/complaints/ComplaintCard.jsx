// ComplaintCard — list row showing a single complaint.
//
// Visual contract per 04-UI-SPEC.md Screen 1:
//   - Surface: neutral.0 / rounded-xl / 1px neutral.200 border (mobile shadow not idiomatic)
//   - Left accent stripe: 4px wide / rounded-l-xl / color by status (see STATUS_ACCENT)
//   - Internal layout:
//        [stripe] [content (badge+age, description, attribution, OwnerChip)] [64×64 thumbnail?]
//   - Thumbnail: only shown when complaint has an attachment; signed URL with width transform.
//   - Description: first 2 lines (numberOfLines={2})
//   - Attribution: t('complaint.filedBy') with name + wing-flat
//   - Age: formatDistanceToNow

import { COMPLAINTS_BUCKET } from "@parisar/api-client";
import { formatDistanceToNow } from "date-fns";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { OwnerChip } from "./OwnerChip";
import { STATUS_ACCENT, StatusBadge } from "./StatusBadge";

function formatFlat(reporterFlat) {
  if (!reporterFlat) return "—";
  const wing = reporterFlat?.wing?.name ?? "";
  const num = reporterFlat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAge(iso) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * Async thumbnail loader — fetches a signed URL with image transform.
 * Returns null while loading or if no attachment.
 */
function useThumbnailUrl(supabase, storageKey) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    if (!supabase || !storageKey) {
      setUrl(null);
      return undefined;
    }
    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from(COMPLAINTS_BUCKET)
          .createSignedUrl(storageKey, 3600, {
            transform: { width: 400, quality: 80 },
          });
        if (!active) return;
        if (error) {
          setUrl(null);
          return;
        }
        setUrl(data?.signedUrl ?? null);
      } catch {
        if (active) setUrl(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, storageKey]);

  return url;
}

/**
 * @param {{
 *   complaint: object,
 *   onPress: (complaint: object) => void,
 *   supabase?: object,
 *   thumbnailStorageKey?: string|null,
 * }} props
 */
export function ComplaintCard({ complaint, onPress, supabase, thumbnailStorageKey = null }) {
  const { t } = useTranslation("complaints");
  const status = complaint?.status ?? "open";
  const accent = STATUS_ACCENT[status] ?? STATUS_ACCENT.open;

  const reporterName = complaint?.reporter?.full_name ?? "—";
  const reporterFlat = formatFlat(complaint?.reporter_flat);
  const ownerName = complaint?.owner?.full_name ?? null;
  // Owner's flat is not joined on the list query; the OwnerChip falls back to "—" when null.
  const ownerFlat = null;

  const age = safeAge(complaint?.created_at);
  const filedByText = t("complaint.filedBy", { name: reporterName, flat: reporterFlat });

  const thumbnailUrl = useThumbnailUrl(supabase, thumbnailStorageKey);

  const a11yLabel = `${status} complaint: ${complaint?.description ?? ""}`;

  return (
    <Pressable
      onPress={() => onPress?.(complaint)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className="flex-row bg-white rounded-xl border border-neutral-200 overflow-hidden"
    >
      {/* Left accent stripe */}
      <View style={{ width: 4, backgroundColor: accent }} />

      {/* Content */}
      <View className="flex-1 p-4 gap-2">
        <View className="flex-row items-center gap-2">
          <StatusBadge status={status} />
          {age ? (
            <Text className="text-sm text-neutral-400 ml-auto" numberOfLines={1}>
              {age}
            </Text>
          ) : null}
        </View>

        <Text className="text-base text-neutral-900" numberOfLines={2}>
          {complaint?.description ?? ""}
        </Text>

        <Text className="text-sm text-neutral-600" numberOfLines={1}>
          {filedByText}
        </Text>

        {ownerName ? <OwnerChip ownerName={ownerName} ownerFlat={ownerFlat} /> : null}
      </View>

      {/* Thumbnail — only when an attachment exists */}
      {thumbnailUrl ? (
        <View className="p-2 justify-start">
          <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: 64, height: 64, borderRadius: 8 }}
            contentFit="cover"
            transition={150}
            accessibilityElementsHidden
            accessible={false}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
