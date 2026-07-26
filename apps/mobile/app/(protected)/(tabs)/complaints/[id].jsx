// /(protected)/complaints/[id] — Complaint detail with response trail + board action row.
//
// Per 04-UI-SPEC.md Screen 3:
//   - Section 1: complaint header card (StatusBadge, kind chip, full description, attribution)
//   - Section 2: photo (if attachment exists) — tap opens photo-viewer
//   - Section 3: board action row, conditional on owner_id + auth.uid() + role:
//       Case A — unclaimed + board role → 4 ResponseChip (2×2) + optional free-text → claim_complaint
//       Case B — owner is current user → 4 ResponseChip + free-text → add_complaint_response
//       Case C — owned by another board member → Lock + "Owned by ..." banner
//       Member (non-board) → section not rendered
//   - Section 4: response trail (ResponseTrailItem, ordered created_at asc), realtime appended.
//   - Race-lost: claimComplaint returns null → show claim-lost banner.

import {
  addComplaintResponse,
  COMPLAINTS_BUCKET,
  claimComplaint,
  getComplaintDetail,
  subscribeToComplaintResponses,
} from "@parisar/api-client";
import { format } from "date-fns";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ResponseChip } from "../../../../components/complaints/ResponseChip";
import { ResponseTrailItem } from "../../../../components/complaints/ResponseTrailItem";
import { StatusBadge } from "../../../../components/complaints/StatusBadge";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

function formatFlat(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAt(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

export default function ComplaintDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation("complaints");
  const { id: complaintId } = useLocalSearchParams();
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const role = jwtMeta.role ?? "member";
  const userId = session?.user?.id ?? null;
  const isBoard = BOARD_ROLES.has(role);

  const [complaint, setComplaint] = useState(null);
  const [responses, setResponses] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState(null);

  // Action row state
  const [pendingKind, setPendingKind] = useState(null); // which chip is in-flight
  const [freeText, setFreeText] = useState("");
  const [claimLost, setClaimLost] = useState(null); // { name, flat } or null
  const [actionError, setActionError] = useState(null);

  const cleanupRef = useRef(null);

  // -------------------------------------------------------------------------
  // Initial fetch
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!complaintId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const {
        complaint: c,
        responses: r,
        attachments: a,
      } = await getComplaintDetail(supabase, complaintId);
      setComplaint(c);
      setResponses(r);
      setAttachments(a);
    } catch (err) {
      console.warn("[complaints/[id]] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    load();
  }, [load]);

  // -------------------------------------------------------------------------
  // Realtime: append new responses
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!complaintId) return undefined;
    const supabase = getSupabase();
    cleanupRef.current = subscribeToComplaintResponses(supabase, complaintId, (row) => {
      setResponses((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        return [...prev, row];
      });
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [complaintId]);

  // -------------------------------------------------------------------------
  // Signed URL for the first attachment
  // -------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    const att = attachments?.[0];
    if (!att?.storage_key) {
      setSignedPhotoUrl(null);
      return undefined;
    }
    (async () => {
      try {
        const supabase = getSupabase();
        const { data, error: sErr } = await supabase.storage
          .from(COMPLAINTS_BUCKET)
          .createSignedUrl(att.storage_key, 3600);
        if (!active) return;
        if (sErr) {
          setSignedPhotoUrl(null);
          return;
        }
        setSignedPhotoUrl(data?.signedUrl ?? null);
      } catch {
        if (active) setSignedPhotoUrl(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [attachments]);

  // -------------------------------------------------------------------------
  // Action handlers — claim or add response
  // -------------------------------------------------------------------------
  async function handleChipPress(kind) {
    if (pendingKind) return;
    setActionError(null);
    setClaimLost(null);
    setPendingKind(kind);

    const supabase = getSupabase();
    try {
      const ownerId = complaint?.owner_id ?? null;
      if (ownerId == null) {
        // Case A — atomic claim
        const result = await claimComplaint(supabase, {
          complaintId,
          responseKind: kind,
          freeText: freeText.trim() ? freeText.trim() : null,
        });
        if (result.claimed) {
          // RPC returned the updated complaint row — patch state immediately.
          setComplaint((prev) => ({ ...prev, ...result.complaint }));
          setFreeText("");
          // The Realtime subscription will append the new response row,
          // so we don't push it manually (avoid double-render).
        } else {
          // Race lost — refetch to learn the winner.
          await load();
          // The detail header banner uses complaint.owner; we surface a transient
          // "claim lost" inline message too.
          setClaimLost({ name: "Another board member", flat: "—" });
        }
      } else if (ownerId === userId) {
        // Case B — owner adds another response
        await addComplaintResponse(supabase, {
          complaintId,
          responseKind: kind,
          freeText: freeText.trim() ? freeText.trim() : null,
        });
        // Update local status optimistically; the realtime UPDATE on complaints
        // would also propagate, but we don't subscribe to complaints from here.
        setComplaint((prev) => ({ ...prev, status: kind }));
        setFreeText("");
        // Realtime subscription will append the response.
      }
    } catch (err) {
      console.warn("[complaints/[id]] action failed:", err?.message ?? err);
      setActionError(t("complaint.submitError"));
    } finally {
      setPendingKind(null);
    }
  }

  // -------------------------------------------------------------------------
  // Loading / error
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </View>
    );
  }
  if (error || !complaint) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center px-8 gap-3">
        <Text className="text-xl font-semibold text-neutral-900 text-center">
          {t("complaint.loadError")}
        </Text>
        <Text className="text-base text-neutral-600 text-center">
          {t("complaint.loadErrorBody")}
        </Text>
        <Pressable
          onPress={load}
          className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
        </Pressable>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------
  const status = complaint.status;
  const ownerId = complaint.owner_id;
  const reporterName = complaint?.reporter?.full_name ?? "—";
  const reporterFlat = formatFlat(complaint?.reporter_flat);
  const filedAt = safeAt(complaint?.created_at);
  const filedByLine = t("complaint.filedByAt", {
    name: reporterName,
    flat: reporterFlat,
    time: filedAt,
  });

  const kindLabel =
    complaint.kind === "society" ? t("complaint.typeSociety") : t("complaint.typeMember");

  // Determine action row case
  let actionCase = "none"; // 'a' | 'b' | 'c' | 'none'
  if (isBoard) {
    if (ownerId == null) actionCase = "a";
    else if (ownerId === userId) actionCase = "b";
    else actionCase = "c";
  }

  const ownerName = complaint?.owner?.full_name ?? "—";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("complaint.detailTitle")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        {/* Section 1 — header card */}
        <View className="bg-white rounded-xl p-6 gap-3">
          <View className="flex-row items-center gap-2">
            <StatusBadge status={status} />
            <View className="ml-auto">
              <View className="rounded-full px-2 py-0.5 bg-neutral-100">
                <Text className="text-sm text-neutral-600">{kindLabel}</Text>
              </View>
            </View>
          </View>

          <Text className="text-base text-neutral-900" style={{ lineHeight: 24 }}>
            {complaint.description}
          </Text>

          <Text className="text-sm text-neutral-600">{filedByLine}</Text>
        </View>

        {/* Section 2 — photo */}
        {signedPhotoUrl ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(protected)/(tabs)/complaints/photo-viewer",
                params: { signedUrl: signedPhotoUrl },
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Open complaint photo"
            className="bg-white rounded-xl overflow-hidden"
            style={{ aspectRatio: 4 / 3 }}
          >
            <Image
              source={{ uri: signedPhotoUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        ) : null}

        {/* Section 3 — board action row */}
        {actionCase === "a" || actionCase === "b" ? (
          <View className="bg-white rounded-xl p-6 gap-3">
            <Text className="text-xl font-semibold text-neutral-900">
              {actionCase === "a"
                ? t("complaint.respondHeading")
                : t("complaint.addResponseHeading")}
            </Text>
            <Text className="text-sm text-neutral-600">
              {actionCase === "a" ? t("complaint.claimExplainer") : t("complaint.ownerLabel")}
            </Text>

            {/* 2×2 grid */}
            <View className="flex-row gap-2">
              <ResponseChip
                responseKind="checking"
                onPress={() => handleChipPress("checking")}
                loading={pendingKind === "checking"}
                disabled={!!pendingKind && pendingKind !== "checking"}
              />
              <ResponseChip
                responseKind="will_resolve"
                onPress={() => handleChipPress("will_resolve")}
                loading={pendingKind === "will_resolve"}
                disabled={!!pendingKind && pendingKind !== "will_resolve"}
              />
            </View>
            <View className="flex-row gap-2">
              <ResponseChip
                responseKind="need_info"
                onPress={() => handleChipPress("need_info")}
                loading={pendingKind === "need_info"}
                disabled={!!pendingKind && pendingKind !== "need_info"}
              />
              <ResponseChip
                responseKind="resolved"
                onPress={() => handleChipPress("resolved")}
                loading={pendingKind === "resolved"}
                disabled={!!pendingKind && pendingKind !== "resolved"}
              />
            </View>

            {/* Free-text */}
            <View className="gap-1 mt-2">
              <Text className="text-sm text-neutral-600">{t("complaint.freeTextLabel")}</Text>
              <TextInput
                value={freeText}
                onChangeText={setFreeText}
                placeholder={t("complaint.freeTextPlaceholder")}
                placeholderTextColor="#6e6e6e"
                multiline
                numberOfLines={3}
                maxLength={500}
                textAlignVertical="top"
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
                style={{ minHeight: 80 }}
              />
            </View>

            {actionError ? (
              <Text className="text-sm text-danger-500" accessibilityRole="alert">
                {actionError}
              </Text>
            ) : null}
            {claimLost ? (
              <View className="rounded-xl border border-brand-500 bg-brand-50 p-4">
                <Text className="text-sm text-neutral-900">
                  {t("complaint.claimLost", { name: claimLost.name, flat: claimLost.flat })}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {actionCase === "c" ? (
          <View className="rounded-xl border border-neutral-200 bg-neutral-100 p-4 flex-row gap-3 items-start">
            <Lock size={20} color="#6e6e6e" />
            <Text className="flex-1 text-base text-neutral-600">
              {t("complaint.ownedByBanner", { name: ownerName, flat: "—" })}
            </Text>
          </View>
        ) : null}

        {/* Section 4 — response trail */}
        <View className="bg-white rounded-xl p-6 gap-2">
          <Text className="text-xl font-semibold text-neutral-900 mb-2">
            {t("complaint.trailHeading")}
          </Text>
          {responses.length === 0 ? (
            <View className="bg-neutral-100 rounded-xl p-4">
              <Text className="text-sm text-neutral-400">{t("complaint.trailEmpty")}</Text>
            </View>
          ) : (
            responses.map((r, idx) => (
              <ResponseTrailItem key={r.id} response={r} isLast={idx === responses.length - 1} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
