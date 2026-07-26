import { fetchPendingReviews, removeMember } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { AlertTriangle, CircleCheck } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useAuthStore } from "../../../lib/auth-store";
import { getSupabase } from "../../../lib/supabase";

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------
function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Group pending reviews by flat_id
// ---------------------------------------------------------------------------
function groupByFlat(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.flat_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  // Return array of { flatKey, flatLabel, claimants[] }
  return Array.from(map.entries()).map(([flatKey, claimants]) => {
    const wing = claimants[0]?.flats?.wings?.name ?? "";
    const num = claimants[0]?.flats?.number ?? "";
    return {
      flatKey,
      flatLabel: [wing, num].filter(Boolean).join("-"),
      claimants,
    };
  });
}

// ---------------------------------------------------------------------------
// ConflictCard — one card per conflicted flat
// ---------------------------------------------------------------------------
function ClaimantRow({ claimant }) {
  const { t } = useTranslation("auth");
  const name = claimant?.profiles?.full_name ?? "Member";
  const joinedAt = claimant?.joined_at
    ? new Date(claimant.joined_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <View className="flex-row items-center gap-3 py-2">
      {/* Avatar */}
      <View className="w-9 h-9 rounded-full bg-neutral-100 items-center justify-center">
        <Text className="text-sm font-medium text-neutral-600">{initials(name)}</Text>
      </View>

      <View className="flex-1">
        <Text className="text-base text-neutral-900" numberOfLines={1}>
          {name}
        </Text>
        {joinedAt ? (
          <Text className="text-sm text-neutral-400">
            {t("reviewQueue.joinedAgo", { time: joinedAt })}
          </Text>
        ) : null}
      </View>

      {/* Status chip */}
      <View
        className={`rounded-full px-2 py-0.5 ${
          claimant.status === "active" ? "bg-success-500" : "bg-warning-500"
        }`}
      >
        <Text className="text-xs font-semibold text-white">
          {claimant.status === "active" ? "Active" : "Pending"}
        </Text>
      </View>
    </View>
  );
}

function ConflictCard({ group, onApproveFirst, onApproveSecond, onRemoveBoth, processing }) {
  const { t } = useTranslation("auth");
  const [first, second] = group.claimants;

  return (
    <View className="bg-white rounded-xl p-5 mb-3">
      {/* Flat heading */}
      <Text className="text-xl font-semibold text-neutral-900 mb-3">Flat {group.flatLabel}</Text>

      {/* First claimant */}
      {first ? <ClaimantRow claimant={first} /> : null}

      {/* Divider with "vs" */}
      <View className="flex-row items-center gap-2 my-1">
        <View className="flex-1 h-px bg-neutral-200" />
        <Text className="text-sm text-neutral-400">{t("reviewQueue.vs")}</Text>
        <View className="flex-1 h-px bg-neutral-200" />
      </View>

      {/* Second claimant */}
      {second ? <ClaimantRow claimant={second} /> : null}

      {/* Actions */}
      <View className="gap-2 mt-3">
        <Pressable
          onPress={() => onApproveFirst(group)}
          disabled={processing}
          className={`h-10 rounded-lg items-center justify-center ${
            processing ? "bg-neutral-200" : "bg-brand-500"
          }`}
          accessibilityRole="button"
        >
          {processing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-sm font-semibold text-white">
              {t("reviewQueue.approveFirst")}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => onApproveSecond(group)}
          disabled={processing}
          className="h-10 rounded-lg items-center justify-center border border-brand-500"
          accessibilityRole="button"
        >
          <Text
            className={`text-sm font-semibold ${processing ? "text-neutral-400" : "text-brand-500"}`}
          >
            {t("reviewQueue.approveSecond")}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onRemoveBoth(group)}
          disabled={processing}
          className="h-10 items-center justify-center"
          accessibilityRole="button"
        >
          <Text className={`text-sm ${processing ? "text-neutral-300" : "text-danger-500"}`}>
            {t("reviewQueue.removeBoth")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ReviewQueueScreen
// ---------------------------------------------------------------------------
export default function ReviewQueueScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const session = useAuthStore((s) => s.session);
  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingFlat, setProcessingFlat] = useState(null);

  // ---------------------------------------------------------------------------
  // Load on focus (so returning from another screen refreshes)
  // ---------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        if (!societyId) return;
        setLoading(true);
        setError(null);
        try {
          const rows = await fetchPendingReviews(getSupabase(), societyId);
          if (active) setGroups(groupByFlat(rows));
        } catch (err) {
          if (active) setError(err.message ?? "Failed to load conflicts.");
        } finally {
          if (active) setLoading(false);
        }
      }

      load();
      return () => {
        active = false;
      };
    }, [societyId]),
  );

  // ---------------------------------------------------------------------------
  // Approve one claimant — set them active, remove the other(s)
  // ---------------------------------------------------------------------------
  async function handleApprove(group, approvedIndex) {
    setProcessingFlat(group.flatKey);
    const supabase = getSupabase();
    try {
      const approved = group.claimants[approvedIndex];
      const others = group.claimants.filter((_, i) => i !== approvedIndex);

      // Approve: update status to 'active'
      await supabase.from("society_memberships").update({ status: "active" }).eq("id", approved.id);

      // Remove others via removeMember RPC (handles DPDP erasure if needed)
      for (const other of others) {
        await removeMember(supabase, other.id);
      }

      // Remove card from local state
      setGroups((prev) => prev.filter((g) => g.flatKey !== group.flatKey));
    } catch (err) {
      setError(err.message ?? "Action failed.");
    } finally {
      setProcessingFlat(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Remove both claimants
  // ---------------------------------------------------------------------------
  async function handleRemoveBoth(group) {
    setProcessingFlat(group.flatKey);
    const supabase = getSupabase();
    try {
      for (const claimant of group.claimants) {
        await removeMember(supabase, claimant.id);
      }
      setGroups((prev) => prev.filter((g) => g.flatKey !== group.flatKey));
    } catch (err) {
      setError(err.message ?? "Action failed.");
    } finally {
      setProcessingFlat(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pt-12 pb-4 bg-white border-b border-neutral-100">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-xl font-semibold text-neutral-900">{t("reviewQueue.heading")}</Text>
          <Text className="text-sm text-neutral-600 mt-0.5">{t("reviewQueue.subheading")}</Text>
        </View>
        {groups.length > 0 && (
          <View className="bg-warning-500 rounded-full px-2 py-0.5">
            <Text className="text-xs font-semibold text-white">{groups.length}</Text>
          </View>
        )}
      </View>

      {/* Error banner */}
      {error ? (
        <View className="mx-4 mt-3 bg-danger-50 border border-danger-200 rounded-xl p-3">
          <Text className="text-sm text-danger-700">{error}</Text>
        </View>
      ) : null}

      {/* Loading */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#12715A" />
        </View>
      ) : groups.length === 0 ? (
        /* Empty state */
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <CircleCheck size={48} color="#047857" />
          <Text className="text-xl font-semibold text-neutral-900 text-center">
            {t("reviewQueue.resolved")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.flatKey}
          contentContainerClassName="px-4 py-4"
          renderItem={({ item }) => (
            <ConflictCard
              group={item}
              processing={processingFlat === item.flatKey}
              onApproveFirst={(g) => handleApprove(g, 0)}
              onApproveSecond={(g) => handleApprove(g, 1)}
              onRemoveBoth={handleRemoveBoth}
            />
          )}
        />
      )}
    </View>
  );
}
