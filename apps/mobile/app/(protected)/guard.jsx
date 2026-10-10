// apps/mobile/app/(protected)/guard.jsx
// The gate screen for security guards — the mobile port of
// apps/web/components/guard/GuardClient.jsx. The guard picks a flat, enters
// the visitor and taps "Ask resident"; the request appears below and its status
// flips live (Pending → Approved/Denied) via realtime on visitor_requests
// (RLS scopes rows to the guard's society). SOS alerts for the watchman show
// at the top.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { guardCreateVisit, guardListFlats } from "@parisar/api-client";
import { LogOut, ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FormError } from "../../components/auth/FormError";
import { PrimaryButton } from "../../components/auth/PrimaryButton";
import { Field, TextField } from "../../components/onboarding/Form";
import { SosAlerts } from "../../components/sos/SosAlerts";
import { useAuthStore } from "../../lib/auth-store";
import { getSupabase } from "../../lib/supabase";

const STATUS = {
  pending: { key: "visitor.statusPending", bg: "#FDF0DF", fg: "#B45309" },
  approved: { key: "visitor.statusApproved", bg: "#DCEFE6", fg: "#0A4436" },
  denied: { key: "visitor.statusDenied", bg: "#FCE9E6", fg: "#c81e1e" },
  cancelled: { key: "visitor.statusDenied", bg: "#F1F5F9", fg: "#64748B" },
};

export default function GuardScreen() {
  const { t } = useTranslation("auth");
  const signOut = useAuthStore((s) => s.signOut);
  const [guardName, setGuardName] = useState("");
  const [societyName, setSocietyName] = useState("");
  const [wings, setWings] = useState([]);
  const [flatId, setFlatId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadRequests = useCallback(async () => {
    const { data } = await getSupabase()
      .from("visitor_requests")
      .select("id, visitor_name, purpose, status, flat_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setRequests(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: guard } = await supabase
        .from("society_guards")
        .select("name, societies:society_id(name)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      setGuardName(guard?.name ?? "");
      // Guards can't read the societies table directly (RLS); the service-status
      // function returns the society name for guards too.
      let socName = guard?.societies?.name ?? "";
      if (!socName) {
        const { data: svc } = await supabase.rpc("my_society_service_status");
        socName = svc?.society_name ?? "";
      }
      setSocietyName(socName);
    })();
    guardListFlats(supabase)
      .then(setWings)
      .catch(() => setWings([]));
    loadRequests();
    const channel = supabase
      .channel(`guard-visits-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_requests" }, () =>
        loadRequests(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  const flatLabel = (id) => {
    for (const w of wings) {
      const f = w.flats.find((x) => x.id === id);
      if (f) return [w.name, f.number].filter(Boolean).join("-");
    }
    return "";
  };

  async function raise() {
    setError(null);
    if (!flatId) return setError(t("visitor.flatRequired"));
    if (!name.trim()) return setError(t("visitor.nameRequired"));
    setBusy(true);
    try {
      const res = await guardCreateVisit(getSupabase(), {
        flatId,
        visitorName: name.trim(),
        visitorPhone: phone.trim(),
        purpose: purpose.trim(),
      });
      if (res?.error) {
        setError(t("visitor.raiseError"));
        return;
      }
      setName("");
      setPhone("");
      setPurpose("");
      setFlatId("");
      await loadRequests();
    } catch {
      setError(t("visitor.raiseError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="gap-4 px-5 pt-6 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-500">
                <ShieldCheck size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-semibold text-neutral-900" numberOfLines={2}>
                  {t("visitor.gateTitle")}
                  {societyName ? ` · ${societyName}` : ""}
                </Text>
                {guardName ? <Text className="text-sm text-neutral-600">{guardName}</Text> : null}
              </View>
            </View>
            <Pressable
              onPress={signOut}
              accessibilityRole="button"
              accessibilityLabel={t("auth.logout")}
              className="rounded-lg p-2"
            >
              <LogOut size={20} color="#4A5C50" />
            </Pressable>
          </View>

          <SosAlerts />

          {/* Raise a request */}
          <View className="gap-4 rounded-2xl border border-neutral-200 bg-neutral-0 p-5">
            <Text className="text-base font-semibold text-neutral-900">
              {t("visitor.gateLead")}
            </Text>

            <Field label={t("visitor.flat")}>
              {wings.length === 0 ? (
                <Text className="text-sm text-neutral-400">{t("visitor.pickFlat")}</Text>
              ) : (
                <View className="gap-2">
                  {wings.map((w) => (
                    <View key={w.id} className="gap-1.5">
                      {wings.length > 1 || (w.name && w.name !== "Main") ? (
                        <Text className="text-xs font-semibold text-neutral-600">{w.name}</Text>
                      ) : null}
                      <View className="flex-row flex-wrap gap-2">
                        {w.flats.map((f) => {
                          const on = flatId === f.id;
                          return (
                            <Pressable
                              key={f.id}
                              onPress={() => setFlatId(f.id)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on }}
                              className={`min-w-[60px] items-center rounded-lg border px-3 py-2 ${
                                on
                                  ? "border-brand-500 bg-brand-50"
                                  : "border-neutral-200 bg-neutral-0"
                              }`}
                            >
                              <Text
                                className={`text-sm font-semibold ${on ? "text-brand-700" : "text-neutral-900"}`}
                              >
                                {f.number}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Field>

            <Field label={t("visitor.visitorName")}>
              <TextField
                value={name}
                onChangeText={setName}
                placeholder={t("visitor.visitorNamePh")}
                maxLength={80}
                autoCapitalize="words"
              />
            </Field>
            <Field label={t("visitor.visitorPhone")}>
              <TextField
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </Field>
            <Field label={t("visitor.purpose")}>
              <TextField
                value={purpose}
                onChangeText={setPurpose}
                placeholder={t("visitor.purposePh")}
                maxLength={60}
              />
            </Field>

            <FormError message={error} />
            <PrimaryButton
              label={busy ? t("visitor.raising") : t("visitor.raise")}
              onPress={raise}
              loading={busy}
            />
          </View>

          {/* Recent / live status */}
          <View className="gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-neutral-400">
              {t("visitor.recent")}
            </Text>
            {requests.length === 0 ? (
              <View className="rounded-xl border border-dashed border-neutral-200 px-4 py-6">
                <Text className="text-center text-sm text-neutral-400">{t("visitor.noneYet")}</Text>
              </View>
            ) : (
              requests.map((r) => {
                const s = STATUS[r.status] ?? STATUS.pending;
                const sub = [flatLabel(r.flat_id), r.purpose].filter(Boolean).join(" · ");
                return (
                  <View
                    key={r.id}
                    className="flex-row items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-0 px-4 py-3"
                  >
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-neutral-900" numberOfLines={1}>
                        {r.visitor_name}
                      </Text>
                      {sub ? <Text className="text-sm text-neutral-600">{sub}</Text> : null}
                    </View>
                    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: s.bg }}>
                      <Text className="text-xs font-bold" style={{ color: s.fg }}>
                        {t(s.key)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
