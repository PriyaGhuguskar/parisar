// /(protected)/(tabs)/bookings — booking list (member) / queue (board), one screen.
//
// Per 05-UI-SPEC.md Screen 6:
//   - Member mode (non-board): listBookings(mode:'mine') — own requests + status,
//     read-only, "Awaiting board approval" (booking.awaitingMember) on pending,
//     rejection reason shown when rejected; a "Request Booking" FAB → /bookings/new (BOOK-07).
//   - Board mode: listBookings(mode:'queue') with a Pending/All tab bar (pending = the
//     action queue). Pending cards get a board action row: Approve (brand.500 fill) +
//     Reject (danger.500 outlined) (BOOK-02).
//   - Approve (BOOK-03/05/06): disable both + spinner; await approveBooking →
//       { approved:true }                          → card flips Approved + toast
//       { approved:false, reason:'race_lost_…' }   → brand.50 raceLost banner (read-only via Realtime)
//       { approved:false, reason:'slot_taken' }    → danger slotTaken banner; card stays pending
//     NO optimistic UI.
//   - Reject (BOOK-04): RN Modal reason sheet (optional reason, max 300) — the sheet
//     IS the confirmation (DD-8, no separate destructive dialog) → rejectBooking.
//   - Realtime (board feel): subscribeToBookings in useFocusEffect (societyId guard);
//     on UPDATE flip the loser's card to read-only with the winner's banner.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  approveBooking,
  listBookings,
  rejectBooking,
  subscribeToBookings,
} from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { AlertTriangle, Calendar, CheckCircle2, Plus, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { BookingCard } from "../../../../components/bookings/BookingCard";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const REASON_MAX = 300;

function formatFlat(flat) {
  if (!flat) return "—";
  const wing = flat?.wing?.name ?? "";
  const num = flat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

export default function BookingsScreen() {
  const router = useRouter();
  const { t } = useTranslation("bookings");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const isBoard = BOARD_ROLES.has(role);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("pending"); // board: 'pending' | 'all'

  // Per-booking action state.
  const [actingId, setActingId] = useState(null);
  const [banners, setBanners] = useState({}); // { [bookingId]: { kind:'raceLost'|'slotTaken', text } }

  // Reject sheet state.
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [toast, setToast] = useState(null);

  const cleanupRef = useRef(null);

  // PAR-104: `silent` marks a REFETCH that follows a successful action (approve /
  // reject / realtime). Those must never flip the whole screen to ErrorState — the
  // action succeeded and the list already on screen is still valid. Only the
  // initial load and an explicit Retry surface the full-page error.
  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!societyId) return;
      if (!silent) setError(null);
      try {
        const supabase = getSupabase();
        const rows = await listBookings(supabase, { mode: isBoard ? "queue" : "mine" });
        setBookings(rows);
        setError(null);
      } catch (err) {
        console.warn("[bookings/index] load failed:", err?.message ?? err);
        if (!silent) setError(err?.message ?? "load_failed");
      } finally {
        setLoading(false);
      }
    },
    [societyId, isBoard],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — subscribe on focus; on UPDATE merge the new row so a loser board
  // member sees the card flip read-only with the winner's banner (BOOK-03).
  useFocusEffect(
    useCallback(() => {
      if (!societyId) return undefined;
      const supabase = getSupabase();
      cleanupRef.current = subscribeToBookings(supabase, societyId, {
        onInsert: () => {
          // Insert payloads lack the joins; refetch to hydrate attribution.
          load({ silent: true });
        },
        onUpdate: (row) => {
          setBookings((prev) => prev.map((b) => (b.id === row.id ? { ...b, ...row } : b)));
          // A decision landed for this booking — clear any stale action banner.
          setBanners((prev) => {
            if (!prev[row.id]) return prev;
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          // Refetch to pull the winner's approver/rejecter flat joins.
          load({ silent: true });
        },
        onConnected: () => load({ silent: true }),
      });
      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }, [societyId, load]),
  );

  function showToast(text, tone = "success") {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 1800);
  }

  async function handleApprove(booking) {
    if (actingId) return;
    setActingId(booking.id);
    setBanners((prev) => {
      const next = { ...prev };
      delete next[booking.id];
      return next;
    });
    try {
      const result = await approveBooking(getSupabase(), { bookingId: booking.id });
      if (result?.approved) {
        showToast(t("booking.approveSuccess"), "success");
        // PAR-104: silent — the approve SUCCEEDED; a transient refetch failure
        // must not replace the screen with a full-page error.
        load({ silent: true }); // pull the won row + self ApproverBanner
      } else if (result?.reason === "slot_taken") {
        setBanners((prev) => ({
          ...prev,
          [booking.id]: { kind: "slotTaken", text: t("booking.slotTaken") },
        }));
      } else {
        // race_lost_or_not_pending → another board member won.
        const winnerName = booking?.approver?.full_name ?? "—";
        const winnerFlat = formatFlat(booking?.approver_flat);
        const text = t("booking.raceLost", { name: winnerName, flat: winnerFlat });
        setBanners((prev) => ({ ...prev, [booking.id]: { kind: "raceLost", text } }));
        load({ silent: true }); // Realtime/refetch flips the card read-only with the winner's banner
      }
    } catch (err) {
      console.warn("[bookings/index] approve failed:", err?.message ?? err);
      showToast(t("booking.submitError"), "error");
    } finally {
      setActingId(null);
    }
  }

  function openReject(booking) {
    setRejectTarget(booking);
    setRejectReason("");
  }

  async function confirmReject() {
    if (!rejectTarget || rejecting) return;
    setRejecting(true);
    try {
      await rejectBooking(getSupabase(), {
        bookingId: rejectTarget.id,
        reason: rejectReason.trim() || null,
      });
      showToast(t("booking.rejectSuccess"), "success");
      setRejectTarget(null);
      setRejectReason("");
      // PAR-104: silent — the reject SUCCEEDED; a transient refetch failure must
      // not replace the screen with a full-page error.
      load({ silent: true });
    } catch (err) {
      console.warn("[bookings/index] reject failed:", err?.message ?? err);
      showToast(t("booking.submitError"), "error");
    } finally {
      setRejecting(false);
    }
  }

  function handleRequest() {
    router.push("/(protected)/(tabs)/bookings/new");
  }

  // Board: filter by the active tab. Member: always show all of "mine".
  const visible = isBoard
    ? tab === "pending"
      ? bookings.filter((b) => b.status === "pending")
      : bookings
    : bookings;

  const title = isBoard ? t("booking.queueTitle") : t("booking.myTitle");

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
        <Text className="text-xl font-semibold text-neutral-900 flex-1">{title}</Text>
      </View>

      {/* Board tab bar */}
      {isBoard ? (
        <View className="flex-row gap-2 px-4 py-2 bg-white border-b border-neutral-100">
          {["pending", "all"].map((tabKey) => {
            const active = tab === tabKey;
            return (
              <Pressable
                key={tabKey}
                onPress={() => setTab(tabKey)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tabKey === "pending" ? "Pending" : "All"}
                className={[
                  "px-4 h-9 rounded-full items-center justify-center",
                  active ? "bg-brand-500" : "bg-neutral-100",
                ].join(" ")}
              >
                <Text className={active ? "text-sm text-white" : "text-sm text-neutral-600"}>
                  {tabKey === "pending" ? "Pending" : "All"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Body */}
      {loading ? (
        <BookingListSkeleton />
      ) : error ? (
        <ErrorState t={t} onRetry={load} />
      ) : visible.length === 0 ? (
        <EmptyState t={t} isBoard={isBoard} onRequest={handleRequest} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
          renderItem={({ item }) => {
            const banner = banners[item.id];
            const isActing = actingId === item.id;
            const showActions = isBoard && item.status === "pending";
            return (
              <BookingCard booking={item} boardMode={isBoard}>
                {/* Member awaiting line */}
                {!isBoard && item.status === "pending" ? (
                  <Text className="text-sm text-neutral-600">{t("booking.awaitingMember")}</Text>
                ) : null}

                {/* Board action row — pending only */}
                {showActions && !banner ? (
                  <View className="flex-row gap-2 mt-1">
                    <Pressable
                      onPress={() => handleApprove(item)}
                      disabled={!!actingId}
                      accessibilityRole="button"
                      accessibilityLabel={t("booking.approveCta")}
                      accessibilityState={{ disabled: !!actingId }}
                      className="flex-1 h-10 rounded-lg bg-brand-500 active:bg-brand-600 items-center justify-center flex-row gap-2"
                    >
                      {isActing ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                      <Text className="text-sm font-semibold text-white">
                        {t("booking.approveCta")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openReject(item)}
                      disabled={!!actingId}
                      accessibilityRole="button"
                      accessibilityLabel={t("booking.rejectCta")}
                      accessibilityState={{ disabled: !!actingId }}
                      className="flex-1 h-10 rounded-lg items-center justify-center"
                      style={{
                        borderWidth: 1.5,
                        borderColor: "#c81e1e",
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <Text className="text-sm font-semibold" style={{ color: "#c81e1e" }}>
                        {t("booking.rejectCta")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Race-lost banner (brand.50) */}
                {banner?.kind === "raceLost" ? (
                  <View
                    className="rounded-lg p-2"
                    style={{ backgroundColor: "#f5f7ff", borderWidth: 1, borderColor: "#12715A" }}
                    accessibilityRole="alert"
                  >
                    <Text className="text-sm" style={{ color: "#12715A" }}>
                      {banner.text}
                    </Text>
                  </View>
                ) : null}

                {/* Slot-taken banner (danger) — card stays pending, board may Reject */}
                {banner?.kind === "slotTaken" ? (
                  <View
                    className="flex-row items-center gap-2 rounded-lg p-2"
                    style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#c81e1e" }}
                    accessibilityRole="alert"
                  >
                    <AlertTriangle size={20} color="#c81e1e" />
                    <Text className="text-sm flex-1" style={{ color: "#c81e1e" }}>
                      {banner.text}
                    </Text>
                  </View>
                ) : null}

                {/* After slot_taken the board may still Reject this request */}
                {banner?.kind === "slotTaken" && showActions ? (
                  <Pressable
                    onPress={() => openReject(item)}
                    disabled={!!actingId}
                    accessibilityRole="button"
                    accessibilityLabel={t("booking.rejectCta")}
                    className="h-10 rounded-lg items-center justify-center mt-1"
                    style={{ borderWidth: 1.5, borderColor: "#c81e1e", backgroundColor: "#ffffff" }}
                  >
                    <Text className="text-sm font-semibold" style={{ color: "#c81e1e" }}>
                      {t("booking.rejectCta")}
                    </Text>
                  </Pressable>
                ) : null}
              </BookingCard>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Member "Request Booking" FAB (BOOK-07) */}
      {!isBoard ? (
        <Pressable
          onPress={handleRequest}
          accessibilityRole="button"
          accessibilityLabel={t("booking.requestCta")}
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#12715A",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Plus size={24} color="#ffffff" />
        </Pressable>
      ) : null}

      {/* Reject reason sheet — the sheet IS the confirmation (DD-8) */}
      <Modal
        transparent
        visible={!!rejectTarget}
        animationType="slide"
        onRequestClose={() => setRejectTarget(null)}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setRejectTarget(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Pressable
            className="bg-white rounded-t-3xl p-4 mt-auto gap-3"
            onPress={(e) => e.stopPropagation()}
          >
            <View
              className="w-12 h-1 bg-neutral-200 rounded-full self-center"
              accessibilityElementsHidden
            />
            <Text className="text-xl font-semibold text-neutral-900">
              {t("booking.rejectHeading")}
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={(v) => setRejectReason(v.slice(0, REASON_MAX))}
              placeholder={t("booking.reasonPlaceholder")}
              placeholderTextColor="#6e6e6e"
              multiline
              numberOfLines={3}
              maxLength={REASON_MAX}
              textAlignVertical="top"
              className="min-h-[80px] px-3 py-2 rounded-xl border border-neutral-200 bg-white text-base text-neutral-900"
              accessibilityLabel={t("booking.reasonPlaceholder")}
            />
            <Pressable
              onPress={confirmReject}
              disabled={rejecting}
              accessibilityRole="button"
              accessibilityLabel={t("booking.rejectConfirm")}
              accessibilityState={{ disabled: rejecting }}
              className="h-12 rounded-xl items-center justify-center flex-row gap-2"
              style={{ backgroundColor: "#c81e1e" }}
            >
              {rejecting ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <Text className="text-base font-semibold text-white">
                {t("booking.rejectConfirm")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toast ? (
        <View
          className="absolute left-4 right-4 flex-row items-center gap-2 rounded-xl p-3"
          style={{
            top: 56,
            backgroundColor: toast.tone === "error" ? "#fef2f2" : "#ecfdf5",
            borderWidth: 1,
            borderColor: toast.tone === "error" ? "#c81e1e" : "#047857",
          }}
          accessibilityRole="alert"
        >
          {toast.tone === "error" ? (
            <AlertTriangle size={16} color="#c81e1e" />
          ) : (
            <CheckCircle2 size={16} color="#047857" />
          )}
          <Text className="text-neutral-900 text-base flex-1">{toast.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

function BookingListSkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          className="flex-row bg-white rounded-xl border border-neutral-200 overflow-hidden"
        >
          <View style={{ width: 4, backgroundColor: "#f5f5f5" }} />
          <View className="flex-1 p-4 flex-row gap-3">
            <View style={{ width: 56, height: 56, backgroundColor: "#f5f5f5", borderRadius: 12 }} />
            <View className="flex-1 gap-2">
              <View
                style={{ height: 20, width: "60%", backgroundColor: "#f5f5f5", borderRadius: 6 }}
              />
              <View
                style={{ height: 14, width: "40%", backgroundColor: "#f5f5f5", borderRadius: 6 }}
              />
              <View
                style={{ height: 16, width: "80%", backgroundColor: "#f5f5f5", borderRadius: 6 }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ t, isBoard, onRequest }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <Calendar size={80} color="#8a8a8a" />
      <Text
        className="font-semibold text-neutral-600 text-center"
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {t("booking.emptyHeading")}
      </Text>
      <Text className="text-base text-neutral-400 text-center">
        {isBoard ? t("booking.emptyBodyBoard") : t("booking.emptyBody")}
      </Text>
      {!isBoard ? (
        <Pressable
          onPress={onRequest}
          className="h-14 px-6 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center mt-2"
          accessibilityRole="button"
          accessibilityLabel={t("booking.requestCta")}
        >
          <Text className="text-base font-semibold text-white">{t("booking.requestCta")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ErrorState({ t, onRetry }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-3">
      <WifiOff size={48} color="#8a8a8a" />
      <Text className="text-xl font-semibold text-neutral-900 text-center">
        {t("booking.loadError")}
      </Text>
      <Pressable
        onPress={onRetry}
        className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
      </Pressable>
    </View>
  );
}
