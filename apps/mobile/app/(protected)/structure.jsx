// apps/mobile/app/(protected)/structure.jsx
// A society authority's first-run setup: wings + flats. Mobile port of the
// website's StructureSetup (apps/web/components/setup/StructureSetup.jsx),
// using the same floor-by-floor From–To builder (lib/flats/floors.js) and the
// same single atomic bootstrap_society_structure call. The website's
// per-wing-layout option and PIN step are left out: every wing shares one
// layout here, and the app always signs in with OTP.
//
// After saving, the authority continues to onboarding to pick their own flat.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import { Check, X } from "lucide-react-native";
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
import { DashedButton, Field, StepHeader, TextField } from "../../components/onboarding/Form";
import { FloorFlats } from "../../components/structure/FloorFlats";
import { buildFlats, initialFloors } from "../../lib/flats/floors";
import { getSupabase } from "../../lib/supabase";

function CheckRow({ label, checked, onToggle }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="flex-row items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-3"
    >
      <View
        className={`h-5 w-5 items-center justify-center rounded border ${
          checked ? "border-brand-500 bg-brand-500" : "border-neutral-400 bg-neutral-0"
        }`}
      >
        {checked ? <Check size={14} color="#fff" /> : null}
      </View>
      <Text className="flex-1 text-sm font-semibold text-neutral-900">{label}</Text>
    </Pressable>
  );
}

export default function StructureScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const tp = (k) => t(`profile.${k}`);

  const [booting, setBooting] = useState(true);
  const [societyId, setSocietyId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [initialName, setInitialName] = useState("");
  const [name, setName] = useState("");
  const [single, setSingle] = useState(false);
  const [wingNames, setWingNames] = useState([""]);
  const [floors, setFloors] = useState(initialFloors);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: mem } = await supabase
          .from("society_memberships")
          .select("society_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .in("role", ["secretary", "co_secretary"])
          .limit(1)
          .maybeSingle();
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!alive) return;
        if (!mem) {
          router.replace("/(protected)/onboarding");
          return;
        }
        setUserId(user.id);
        setSocietyId(mem.society_id);
        setInitialName(profile?.full_name ?? "");
        setName(profile?.full_name ?? "");
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  const { all, anyInvalid } = buildFlats(floors);
  const namedWings = wingNames.map((w) => w.trim()).filter(Boolean);
  const wingCount = single ? 1 : namedWings.length;
  const totalFlats = wingCount * all.length;

  async function submit() {
    setErr(null);
    if (anyInvalid) return setErr(tp("rangeInvalid"));
    if (all.length === 0) return setErr(t("auth.structNeedFlats"));

    let wings;
    if (single) {
      wings = [t("auth.structSingleName")];
    } else {
      if (namedWings.length === 0) return setErr(t("auth.structNeedWing"));
      const lower = namedWings.map((w) => w.toLowerCase());
      if (new Set(lower).size !== lower.length) return setErr(t("auth.structWingsDuplicate"));
      wings = namedWings;
    }

    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.rpc("bootstrap_society_structure", {
        p_society_id: societyId,
        p_wings: wings.map((w) => ({ name: w })),
        p_flats: wings.flatMap((w) => all.map((number) => ({ wing_name: w, number }))),
      });
      if (error) {
        setErr(t("auth.structErr"));
        setBusy(false);
        return;
      }
      if (name.trim() && name.trim() !== initialName && userId) {
        await supabase.from("profiles").update({ full_name: name.trim() }).eq("user_id", userId);
      }
      await supabase.auth.refreshSession();
      router.replace("/(protected)/onboarding");
    } catch {
      setErr(t("auth.structErr"));
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

  return (
    <AuthShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow gap-5 pt-8 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepHeader title={t("auth.structTitle")} sub={t("auth.structSub")} />

          <Field label={t("auth.structYourName")} hint={t("auth.structYourNameHint")}>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder={t("auth.structYourName")}
              autoCapitalize="words"
            />
          </Field>

          <CheckRow
            label={t("auth.structSingle")}
            checked={single}
            onToggle={() => {
              setSingle((s) => !s);
              setErr(null);
            }}
          />

          {!single ? (
            <View className="gap-2 rounded-xl border border-neutral-200 bg-neutral-0 p-4">
              <Text className="text-sm font-semibold text-neutral-900">
                {t("auth.structWingNames")}
              </Text>
              {wingNames.map((w, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional rows, no id
                  key={i}
                  className="flex-row items-center gap-2"
                >
                  <View className="flex-1">
                    <TextField
                      value={w}
                      onChangeText={(v) => {
                        setWingNames((ws) => ws.map((x, idx) => (idx === i ? v : x)));
                        setErr(null);
                      }}
                      placeholder={t("auth.structWingNamePh")}
                      autoCapitalize="characters"
                    />
                  </View>
                  {wingNames.length > 1 ? (
                    <Pressable
                      onPress={() => setWingNames((ws) => ws.filter((_, idx) => idx !== i))}
                      accessibilityRole="button"
                      className="p-2"
                    >
                      <X size={18} color="#64748B" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <DashedButton
                label={t("auth.structWingAdd")}
                onPress={() => setWingNames((ws) => [...ws, ""])}
              />
            </View>
          ) : null}

          <View className="gap-3 rounded-xl border border-neutral-200 bg-neutral-0 p-4">
            <Text className="text-sm font-semibold text-neutral-900">
              {single
                ? t("auth.structFlatsFor", { wing: t("auth.structSingleName") })
                : t("auth.structSharedTitle")}
            </Text>
            <FloorFlats
              floors={floors}
              onChange={(next) => {
                setFloors(next);
                setErr(null);
              }}
            />
          </View>

          <Text className="text-sm font-semibold text-neutral-600">
            {single
              ? t("auth.structReview", { wings: 1, flats: totalFlats })
              : t("auth.structReviewSame", {
                  wings: wingCount,
                  each: all.length,
                  flats: totalFlats,
                })}
          </Text>

          <FormError message={err} />
          <PrimaryButton
            label={busy ? t("auth.structSaving") : t("auth.obNext")}
            onPress={submit}
            loading={busy}
          />
          <View className="items-center">
            <LogoutButton />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthShell>
  );
}
