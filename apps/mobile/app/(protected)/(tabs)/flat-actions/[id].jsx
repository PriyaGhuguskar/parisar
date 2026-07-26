// /(protected)/(tabs)/flat-actions/[id] — Flat-action detail (Screen 2b).
//
// Per 06-UI-SPEC.md Screen 2b:
//   - Section 1: action header card — FlatActionKindBadge, full reason/message,
//     "Issued by {{name}} ({{flat}}) at {{time}}" attribution. Board viewing another
//     flat additionally sees a "Flat {{flat}}" heading.
//   - Section 2: FineDetailBlock (kind = fine only) — amount + due date + LOCKED
//     no-payment footer + PDF pill + the role-gated action row:
//       * MEMBER (target-flat resident) + outstanding → Acknowledge (acknowledgeFine)
//       * ADMIN (secretary/co_secretary) ONLY + outstanding|acknowledged → Waive
//         (waiveFine) — a regular board_member must NOT see Waive (D-04; pass isAdmin
//         into FineDetailBlock, NOT isBoard).
//   - Realtime: subscribeFlatAction (single-row UPDATE) so status flips live. No optimistic UI.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  acknowledgeFine,
  FLAT_ACTIONS_BUCKET,
  getFlatAction,
  subscribeFlatAction,
  waiveFine,
} from "@parisar/api-client";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { OwnerChip } from "../../../../components/complaints/OwnerChip";
import { FineDetailBlock } from "../../../../components/flat-actions/FineDetailBlock";
import { FlatActionKindBadge } from "../../../../components/flat-actions/FlatActionKindBadge";
import { formatFlatLabel } from "../../../../components/flat-actions/FlatPicker";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

function safeAt(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

export default function FlatActionDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation("flat-actions");
  const { id } = useLocalSearchParams();
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const role = jwtMeta.role ?? "member";
  const societyId = jwtMeta.society_id ?? null;
  const userId = session?.user?.id ?? null;
  const isBoard = BOARD_ROLES.has(role);
  const isAdmin = ADMIN_ROLES.has(role);
  // The JWT carries only society_id + role (no flat_id claim), so resolve the
  // caller's own flat from society_memberships to gate Acknowledge (D-04 / FLAT-06).
  const [memberFlatId, setMemberFlatId] = useState(null);

  const [action, setAction] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [acknowledging, setAcknowledging] = useState(false);
  const [waiving, setWaiving] = useState(false);
  const [actionError, setActionError] = useState(null);

  const cleanupRef = useRef(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const { action: a, attachments: at } = await getFlatAction(getSupabase(), id);
      setAction(a);
      setAttachments(at);
    } catch (err) {
      console.warn("[flat-actions/[id]] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve the caller's own flat (gates Acknowledge — JWT has no flat_id claim).
  useEffect(() => {
    if (isBoard || !userId || !societyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase()
        .from("society_memberships")
        .select("flat_id")
        .eq("user_id", userId)
        .eq("society_id", societyId)
        .eq("status", "active")
        .maybeSingle();
      if (!cancelled) setMemberFlatId(data?.flat_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isBoard, userId, societyId]);

  // Realtime — single-row UPDATE so an Acknowledge/Waive flips the status live.
  useEffect(() => {
    if (!id) return undefined;
    cleanupRef.current = subscribeFlatAction(getSupabase(), {
      id,
      onUpdate: (row) => setAction((prev) => (prev ? { ...prev, ...row } : prev)),
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [id]);

  async function handleAcknowledge() {
    if (acknowledging) return;
    setActionError(null);
    setAcknowledging(true);
    try {
      const result = await acknowledgeFine(getSupabase(), id);
      if (result?.ok === false) {
        setActionError(t("flatAction.acknowledgeError"));
      } else {
        // Realtime UPDATE will flip the badge; patch locally as a fallback.
        setAction((prev) => (prev ? { ...prev, fine_status: "acknowledged" } : prev));
      }
    } catch {
      setActionError(t("flatAction.acknowledgeError"));
    } finally {
      setAcknowledging(false);
    }
  }

  async function handleWaive() {
    if (waiving) return;
    setActionError(null);
    setWaiving(true);
    try {
      const result = await waiveFine(getSupabase(), id);
      if (result?.ok === false) {
        setActionError(t("flatAction.waiveError"));
      } else {
        setAction((prev) => (prev ? { ...prev, fine_status: "waived" } : prev));
      }
    } catch {
      setActionError(t("flatAction.waiveError"));
    } finally {
      setWaiving(false);
    }
  }

  async function handleOpenPdf() {
    const att = attachments?.[0];
    if (!att?.storage_key) return;
    try {
      const { data } = await getSupabase()
        .storage.from(FLAT_ACTIONS_BUCKET)
        .createSignedUrl(att.storage_key, 3600);
      const url = data?.signedUrl;
      if (url) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.warn("[flat-actions/[id]] open pdf failed:", err?.message ?? err);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </View>
    );
  }
  if (error || !action) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center px-8 gap-3">
        <Text className="text-xl font-semibold text-neutral-900 text-center">
          {t("flatAction.loadError")}
        </Text>
        <Pressable
          onPress={load}
          className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-neutral-900">{"Try again"}</Text>
        </Pressable>
      </View>
    );
  }

  const kind = action.kind ?? "notify";
  const issuerName = action?.issuer?.full_name ?? "—";
  const issuerFlat = formatFlatLabel(action?.issuer_flat);
  const issuedLine = t("flatAction.issuedByAt", {
    name: issuerName,
    flat: issuerFlat,
    time: safeAt(action?.created_at),
  });

  const targetFlat = formatFlatLabel(action?.flat);
  // Member acknowledge eligibility: the caller's own flat is the target flat.
  const isMemberResident = !isBoard && memberFlatId && action?.flat_id === memberFlatId;

  const att = attachments?.[0] ?? null;

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
          {t("flatAction.detailTitle")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        {/* Section 1 — action header card */}
        <View className="bg-white rounded-xl p-6 gap-3">
          {/* Board viewing a flat: show which flat */}
          {isBoard ? (
            <Text className="text-xl font-semibold text-neutral-900">{`Flat ${targetFlat}`}</Text>
          ) : null}

          <View className="flex-row items-center gap-2">
            <FlatActionKindBadge kind={kind} />
            <Text className="text-sm text-neutral-400 ml-auto">{safeAt(action?.created_at)}</Text>
          </View>

          <Text className="text-base text-neutral-900" style={{ lineHeight: 24 }}>
            {action?.body ?? ""}
          </Text>

          <OwnerChip label={issuedLine} />
        </View>

        {/* Section 2 — FineDetailBlock (fine only) */}
        {kind === "fine" ? (
          <FineDetailBlock
            amount={action?.amount}
            dueDate={action?.due_date}
            status={action?.fine_status ?? "outstanding"}
            pdf={att ? { name: "Bylaw / AGM resolution.pdf", onOpen: handleOpenPdf } : null}
            isMemberResident={!!isMemberResident}
            // Waive is ADMIN-ONLY (D-04) — pass isAdmin, NOT isBoard.
            isAdmin={isAdmin}
            onAcknowledge={handleAcknowledge}
            onWaive={handleWaive}
            acknowledging={acknowledging}
            waiving={waiving}
            actionError={actionError}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
