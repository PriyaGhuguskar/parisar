// apps/mobile/components/authorities/SocietyFeaturesSection.jsx
// Features & add-ons — the mobile port of apps/web/components/authorities/
// SocietyFeaturesSection.jsx. Shows each Parisar feature (included or
// ₹/month, on/off) and lets an authority request turning a paid add-on on or
// off with an optional note (request_feature_change); Parisar staff approve.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { listSocietyFeatureState, requestFeatureChange } from "@parisar/api-client";
import { Check, Clock } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";
import { SectionTitle, SmallButton, StatusPill, SurfaceCard } from "../kit";
import { TextField } from "../onboarding/Form";

function RequestForm({ feature, societyId, onDone, onCancel }) {
  const { t } = useTranslation("auth");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await requestFeatureChange(getSupabase(), {
        societyId,
        featureKey: feature.key,
        action: feature.enabled ? "remove" : "add",
        note,
      });
      if (res?.error) {
        setErr(
          res.error === "ALREADY_REQUESTED"
            ? t("authority.alreadyRequested")
            : t("authority.requestError"),
        );
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setErr(t("authority.requestError"));
      setBusy(false);
    }
  }

  return (
    <View className="mt-3 gap-2">
      <TextField
        autoFocus
        value={note}
        onChangeText={setNote}
        maxLength={300}
        placeholder={t("authority.requestNotePh")}
      />
      {err ? <Text className="text-sm text-danger-500">{err}</Text> : null}
      <View className="flex-row gap-2">
        <SmallButton label={t("authority.sendRequest")} onPress={submit} disabled={busy} />
        <SmallButton tone="outline" label={t("authority.cancel")} onPress={onCancel} />
      </View>
    </View>
  );
}

export function SocietyFeaturesSection({ societyId }) {
  const { t } = useTranslation("auth");
  const [rows, setRows] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    try {
      setRows(await listSocietyFeatureState(getSupabase(), societyId));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  const total = (rows ?? []).filter((f) => f.enabled && !f.isCore).reduce((a, f) => a + f.price, 0);

  return (
    <View>
      <SectionTitle title={t("authority.featuresTitle")} lead={t("authority.featuresLead")} />
      {rows ? (
        <Text className="pb-3 text-sm font-semibold text-neutral-900">
          {t("authority.monthlyTotal", { total: total.toLocaleString("en-IN") })}
        </Text>
      ) : null}
      {notice ? (
        <View className="mb-3 rounded-xl bg-brand-50 px-3.5 py-2.5">
          <Text className="text-sm font-medium text-brand-700">{notice}</Text>
        </View>
      ) : null}
      {loadFailed ? (
        <Text className="text-sm text-danger-500">{t("authority.featuresLoadError")}</Text>
      ) : (
        <View className="gap-2">
          {(rows ?? []).map((f) => (
            <SurfaceCard key={f.key}>
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-base font-semibold text-neutral-900">{f.name}</Text>
                <Text className="text-sm text-neutral-600">
                  {f.isCore
                    ? t("authority.included")
                    : t("authority.perMonth", { price: f.price.toLocaleString("en-IN") })}
                </Text>
                <StatusPill tone={f.enabled ? "done" : "neutral"}>
                  {f.enabled ? t("authority.statusOn") : t("authority.statusOff")}
                </StatusPill>
              </View>
              {f.description ? (
                <Text className="mt-1 text-sm text-neutral-600">{f.description}</Text>
              ) : null}
              {f.isCore ? null : f.pending ? (
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Clock size={14} color="#8A4708" />
                  <Text className="text-sm font-medium text-[#8A4708]">
                    {f.pending.action === "add"
                      ? t("authority.pendingAdd")
                      : t("authority.pendingRemove")}
                  </Text>
                </View>
              ) : openKey === f.key ? (
                <RequestForm
                  feature={f}
                  societyId={societyId}
                  onCancel={() => setOpenKey(null)}
                  onDone={() => {
                    setOpenKey(null);
                    setNotice(t("authority.requestSent"));
                    load();
                  }}
                />
              ) : (
                <View className="mt-3 flex-row">
                  <SmallButton
                    tone="outline"
                    icon={Check}
                    label={f.enabled ? t("authority.requestRemove") : t("authority.requestAdd")}
                    onPress={() => {
                      setNotice(null);
                      setOpenKey(f.key);
                    }}
                  />
                </View>
              )}
            </SurfaceCard>
          ))}
        </View>
      )}
    </View>
  );
}
