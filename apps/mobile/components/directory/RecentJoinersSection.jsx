// apps/mobile/components/directory/RecentJoinersSection.jsx
// D-03: relocates the Phase 3 "Recently joined" widget from the (deleted)
// dashboard onto the Member Directory screen as a top section. Last 5 joiners;
// avatar (reuses Wave 0 lib/avatar.js color cycle for visual consistency with
// the home header) + name + flat + relative-time-ago.
//
// Shape note: fetchRecentJoiners (packages/api-client/src/society.js) returns
// the EMBEDDED PostgREST shape:
//   { id, user_id, joined_at, profiles: { full_name }, flats: { number, wings: { name } } }
// We derive: name = profiles.full_name, flat = `${wings.name}-${number}` ("B-203").
//
// Silent failure (D-03 spirit): empty result OR fetch rejection -> render
// nothing (no header). The rest of the directory list is unaffected.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { fetchRecentJoiners } from "@parisar/api-client";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { getAvatarColor, initials } from "../../lib/avatar";
import { getSupabase } from "../../lib/supabase";

/**
 * Derive a "B-203"-style flat label from the embedded flats/wings shape.
 * @param {object|null|undefined} flats
 * @returns {string}
 */
function flatLabel(flats) {
  const number = flats?.number;
  const wing = flats?.wings?.name;
  if (wing && number) return `${wing}-${number}`;
  if (number) return String(number);
  return "—";
}

/**
 * @param {object} props
 * @param {string|null|undefined} props.societyId
 */
export function RecentJoinersSection({ societyId }) {
  // null = loading; [] = empty; [...] = data
  const [joiners, setJoiners] = useState(null);

  useEffect(() => {
    if (!societyId) {
      setJoiners([]);
      return;
    }
    let cancelled = false;
    fetchRecentJoiners(getSupabase(), societyId, 5)
      .then((data) => {
        if (!cancelled) setJoiners(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setJoiners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  // Loading / empty / error -> render nothing (silent, per D-03).
  if (!joiners || joiners.length === 0) return null;

  return (
    <View className="mb-4">
      <Text className="text-base font-semibold text-neutral-900 mb-2 px-4">Recently joined</Text>
      <View className="bg-white rounded-2xl mx-4 border border-neutral-200">
        {joiners.map((j, idx) => {
          const name = j.profiles?.full_name ?? "Member";
          const flat = flatLabel(j.flats);
          const joinedAt = j.joined_at ? new Date(j.joined_at) : null;
          const timeAgo =
            joinedAt && !Number.isNaN(joinedAt.getTime())
              ? formatDistanceToNow(joinedAt, { addSuffix: true })
              : "";
          const color = getAvatarColor(name);
          const isLast = idx === joiners.length - 1;

          return (
            <View
              key={j.user_id ?? j.id ?? `${name}-${idx}`}
              className={[
                "flex-row items-center gap-3 p-3",
                isLast ? "" : "border-b border-neutral-100",
              ].join(" ")}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: color.bg }}
              >
                <Text style={{ color: color.text }} className="font-semibold text-sm">
                  {initials(name)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-medium text-neutral-900" numberOfLines={1}>
                  {name}
                </Text>
                <Text className="text-sm text-neutral-600" numberOfLines={1}>
                  {flat}
                  {timeAgo ? ` · ${timeAgo}` : ""}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
