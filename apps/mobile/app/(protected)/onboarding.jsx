// apps/mobile/app/(protected)/onboarding.jsx
// New-resident onboarding — the mobile port of the website's OnboardingWizard
// (apps/web/components/onboarding/OnboardingWizard.jsx), minus the website-only
// PIN step (the app always signs in with OTP):
//
//   1. society code   (onboard_flats_for_code)
//   2. your details    — name, pick your flat, owner/tenant, alternate mobile
//   3. family          — optional; committed with onboard_resident in one call
//
// A society authority who has not picked a flat yet arrives with their
// society's code (and their name) pre-filled, so they open straight on step 2.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { FormError } from "../../components/auth/FormError";
import { PrimaryButton } from "../../components/auth/PrimaryButton";
import { LogoutButton } from "../../components/LogoutButton";
import {
  Choice,
  DashedButton,
  Field,
  Progress,
  StepHeader,
  TextField,
} from "../../components/onboarding/Form";
import { setPinPending } from "../../lib/pin-pending";
import { pinRoute, ROUTES } from "../../lib/post-login";
import { getSupabase } from "../../lib/supabase";

const STEPS = 3;

function normalizeCode(raw) {
  const norm = String(raw).toUpperCase().replace(/\s/g, "");
  return norm.includes("-") ? norm : `${norm.slice(0, 4)}-${norm.slice(4)}`;
}

/** Pre-fill for a flat-less society authority: their society's code + name. */
async function loadAuthorityPrefill(supabase, userId) {
  const { data: mem } = await supabase
    .from("society_memberships")
    .select("society_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("flat_id", null)
    .in("role", ["secretary", "co_secretary"])
    .limit(1)
    .maybeSingle();
  if (!mem) return null;
  const [{ data: code }, { data: authority }] = await Promise.all([
    supabase
      .from("society_codes")
      .select("code")
      .eq("society_id", mem.society_id)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("society_authorities")
      .select("full_name")
      .eq("society_id", mem.society_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return { code: code?.code ?? "", name: authority?.full_name ?? "" };
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");

  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [phone, setPhone] = useState("");

  const [code, setCode] = useState("");
  const [society, setSociety] = useState(null); // { society_id, society_name, wings, code }
  const [form, setForm] = useState({ name: "", flatId: "", residency: "owner", alt: "" });
  const [family, setFamily] = useState([]);

  async function lookupCode(raw) {
    setErr(null);
    setBusy(true);
    try {
      const withDash = normalizeCode(raw);
      const { data } = await getSupabase().rpc("onboard_flats_for_code", { p_code: withDash });
      if (!data || data.error) {
        setErr(
          data?.error === "SOCIETY_BLOCKED" ? t("service.blockedJoin") : t("auth.obCodeInvalid"),
        );
        return;
      }
      setSociety({ ...data, code: withDash });
      setStep(2);
    } catch {
      setErr(t("auth.obErr"));
    } finally {
      setBusy(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time prefill on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !alive) return;
        setPhone(user.phone ? `+91 ${String(user.phone).slice(-10)}` : "");
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        const prefill = await loadAuthorityPrefill(supabase, user.id);
        if (!alive) return;
        const name = profile?.full_name || prefill?.name || "";
        setForm((f) => ({ ...f, name }));
        if (prefill?.code) {
          setCode(prefill.code);
          await lookupCode(prefill.code);
        }
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function onDetails() {
    setErr(null);
    if (form.name.trim().length < 2) return setErr(t("auth.obNeedName"));
    if (!form.flatId) return setErr(t("auth.obNeedFlat"));
    setStep(3);
  }

  function setFam(i, patch) {
    setFamily((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function commit() {
    setErr(null);
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("onboard_resident", {
        p_code: society.code,
        p_flat_id: form.flatId,
        p_full_name: form.name.trim(),
        p_residency: form.residency,
        p_alt_phone: form.alt.trim() || null,
        p_family: family
          .filter((m) => m.name.trim())
          .map((m) => ({
            name: m.name.trim(),
            relation: m.relation.trim(),
            phone: m.phone.trim() || null,
            is_resident: true,
          })),
      });
      if (error || data?.error) {
        setErr(data?.error === "SOCIETY_BLOCKED" ? t("service.blockedJoin") : t("auth.obErr"));
        setBusy(false);
        return;
      }
      // The membership was just created — re-mint the token so the auth hook
      // adds society_id/role before the app's RLS-scoped screens load.
      await supabase.auth.refreshSession();
      // Same as the website: onboarding ends with choosing a PIN (skipped when
      // one is already set, e.g. an authority who set it earlier).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("profiles")
        .select("pin_set")
        .eq("user_id", user?.id ?? "")
        .maybeSingle();
      if (prof?.pin_set) {
        router.replace(ROUTES.app);
      } else {
        await setPinPending(user?.id);
        router.replace(pinRoute("set", ROUTES.app));
      }
    } catch {
      setErr(t("auth.obErr"));
      setBusy(false);
    }
  }

  if (booting) {
    return (
      <AuthShell>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#12715A" />
        </View>
      </AuthShell>
    );
  }

  const wings = society?.wings ?? [];

  return (
    <AuthShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Progress step={step} total={STEPS} />

          {step === 1 ? (
            <View className="gap-5 pt-4">
              <StepHeader title={t("auth.obCodeTitle")} sub={t("auth.obCodeSub")} />
              <TextField
                value={code}
                onChangeText={(v) =>
                  setCode(
                    v
                      .toUpperCase()
                      .replace(/[^A-Z0-9-]/g, "")
                      .slice(0, 9),
                  )
                }
                placeholder="ABCD-1234"
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel={t("auth.obCodeTitle")}
                style={{ textAlign: "center", fontSize: 20, letterSpacing: 4, fontWeight: "700" }}
              />
              <FormError message={err} />
              <PrimaryButton
                label={t("auth.obNext")}
                onPress={() => lookupCode(code)}
                loading={busy}
                disabled={code.replace("-", "").length !== 8}
              />
              <View className="items-center pt-4">
                <LogoutButton />
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View className="gap-5 pt-4">
              <StepHeader
                onBack={() => setStep(1)}
                backLabel={t("auth.obBack")}
                title={t("auth.obDetailsTitle")}
                sub={t("auth.obDetailsSub", { society: society?.society_name ?? "" })}
              />
              <Field label={t("auth.obYourMobile")}>
                <TextField value={phone} editable={false} />
              </Field>
              <Field label={t("auth.obName")}>
                <TextField
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder={t("auth.obNamePh")}
                  autoCapitalize="words"
                  maxLength={80}
                />
              </Field>
              <Field label={t("auth.obFlat")}>
                <View className="gap-3">
                  {wings.map((w) => (
                    <View key={w.id} className="gap-2">
                      {wings.length > 1 || w.name !== "Main" ? (
                        <Text className="text-xs font-semibold text-neutral-600">{w.name}</Text>
                      ) : null}
                      <View className="flex-row flex-wrap gap-2">
                        {w.flats.map((f) => {
                          const on = form.flatId === f.id;
                          return (
                            <Pressable
                              key={f.id}
                              disabled={f.taken}
                              onPress={() => setForm({ ...form, flatId: f.id })}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on, disabled: f.taken }}
                              accessibilityLabel={
                                f.taken ? `${f.number} (${t("auth.obFlatTaken")})` : f.number
                              }
                              className={[
                                "min-w-[64px] items-center rounded-lg border px-3 py-2",
                                on
                                  ? "border-brand-500 bg-brand-50"
                                  : f.taken
                                    ? "border-neutral-200 bg-neutral-100"
                                    : "border-neutral-200 bg-neutral-0",
                              ].join(" ")}
                            >
                              <Text
                                className={[
                                  "text-sm font-semibold",
                                  on
                                    ? "text-brand-700"
                                    : f.taken
                                      ? "text-neutral-400 line-through"
                                      : "text-neutral-900",
                                ].join(" ")}
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
              </Field>
              <Field label={t("auth.obResidency")}>
                <Choice
                  options={[
                    ["owner", t("auth.obOwner")],
                    ["tenant", t("auth.obTenant")],
                  ]}
                  value={form.residency}
                  onChange={(v) => setForm({ ...form, residency: v })}
                />
              </Field>
              <Field label={t("auth.obAlt")} hint={t("auth.obAltHint")}>
                <TextField
                  value={form.alt}
                  onChangeText={(v) => setForm({ ...form, alt: v.replace(/\D/g, "").slice(0, 10) })}
                  placeholder="98765 43210"
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </Field>
              <FormError message={err} />
              <PrimaryButton label={t("auth.obNext")} onPress={onDetails} />
            </View>
          ) : null}

          {step === 3 ? (
            <View className="gap-5 pt-4">
              <StepHeader
                onBack={() => setStep(2)}
                backLabel={t("auth.obBack")}
                title={t("auth.obFamilyTitle")}
                sub={t("auth.obFamilySub")}
              />
              <View className="gap-3">
                {family.map((m, i) => (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: positional rows, no id
                    key={i}
                    className="gap-2 rounded-xl border border-neutral-200 bg-neutral-0 p-3"
                  >
                    <View className="flex-row items-center gap-2">
                      <View className="flex-1">
                        <TextField
                          value={m.name}
                          onChangeText={(v) => setFam(i, { name: v })}
                          placeholder={t("auth.obFamilyName")}
                          autoCapitalize="words"
                        />
                      </View>
                      <Pressable
                        onPress={() => setFamily((f) => f.filter((_, idx) => idx !== i))}
                        accessibilityRole="button"
                        accessibilityLabel={t("auth.obBack")}
                        className="p-2"
                      >
                        <X size={18} color="#64748B" />
                      </Pressable>
                    </View>
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <TextField
                          value={m.relation}
                          onChangeText={(v) => setFam(i, { relation: v })}
                          placeholder={t("auth.obFamilyRelPh")}
                        />
                      </View>
                      <View className="flex-1">
                        <TextField
                          value={m.phone}
                          onChangeText={(v) =>
                            setFam(i, { phone: v.replace(/\D/g, "").slice(0, 10) })
                          }
                          placeholder={t("auth.obFamilyPhone")}
                          keyboardType="number-pad"
                          maxLength={10}
                        />
                      </View>
                    </View>
                  </View>
                ))}
                <DashedButton
                  label={family.length === 0 ? t("auth.obFamilyName") : t("auth.obFamilyAdd")}
                  onPress={() => setFamily((f) => [...f, { name: "", relation: "", phone: "" }])}
                />
              </View>
              <FormError message={err} />
              <PrimaryButton label={t("auth.obFinish")} onPress={commit} loading={busy} />
              {family.length === 0 ? (
                <Pressable onPress={commit} disabled={busy} className="items-center py-1">
                  <Text className="text-sm font-semibold text-neutral-600">
                    {t("auth.obFamilyNone")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthShell>
  );
}
