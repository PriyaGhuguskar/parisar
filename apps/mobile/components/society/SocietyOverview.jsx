// apps/mobile/components/society/SocietyOverview.jsx
// Society card, stats and wings → flats → residents (accordion), plus "Add
// wing" — the mobile port of apps/web/components/profile/SocietyOverview.jsx
// and AddWingDialog.jsx.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { addWing } from "@parisar/api-client";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { buildFlats, initialFloors } from "../../lib/flats/floors";
import { getSupabase } from "../../lib/supabase";
import { FormError } from "../auth/FormError";
import { EmptyState, SectionTitle, SmallButton, SurfaceCard } from "../kit";
import { Field, TextField } from "../onboarding/Form";
import { FloorFlats } from "../structure/FloorFlats";

function Stat({ label, value, brand }) {
  return (
    <View className="min-w-[45%] flex-1 rounded-xl border border-neutral-200 bg-neutral-0 p-3">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </Text>
      <Text
        className={`mt-1 text-xl font-semibold ${brand ? "text-brand-700" : "text-neutral-900"}`}
      >
        {value}
      </Text>
    </View>
  );
}

function AddWingSheet({ visible, societyId, onClose, onAdded }) {
  const { t } = useTranslation("auth");
  const tp = (k) => t(`profile.${k}`);
  const [name, setName] = useState("");
  const [floors, setFloors] = useState(initialFloors);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setName("");
      setFloors(initialFloors());
      setError(null);
    }
  }, [visible]);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError(tp("wingNameRequired"));
    const { all, anyInvalid } = buildFlats(floors);
    if (anyInvalid) return setError(tp("rangeInvalid"));
    setSaving(true);
    try {
      const res = await addWing(getSupabase(), {
        societyId,
        wingName: name.trim(),
        flatNumbers: all,
      });
      if (res?.error) {
        setError(res.error === "WING_EXISTS" ? tp("wingExists") : tp("addWingError"));
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError(tp("addWingError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/40"
      >
        <ScrollView
          className="max-h-[90%] rounded-t-3xl bg-neutral-0"
          contentContainerClassName="gap-4 p-5"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-xl font-semibold text-neutral-900">{tp("addWingTitle")}</Text>
              <Text className="text-sm text-neutral-600">{tp("addWingLead")}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" className="p-1">
              <X size={20} color="#64748B" />
            </Pressable>
          </View>
          <Field label={tp("wingNameLabel")}>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder={tp("wingNamePlaceholder")}
              maxLength={40}
              autoCapitalize="characters"
            />
          </Field>
          <FloorFlats floors={floors} onChange={setFloors} />
          <FormError message={error} />
          <View className="flex-row justify-end gap-2.5 pb-4">
            <SmallButton tone="outline" label={tp("cancel")} onPress={onClose} />
            <SmallButton
              label={saving ? tp("saving") : tp("addWing")}
              onPress={submit}
              disabled={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SocietyOverview({ society, structure, onChanged }) {
  const { t } = useTranslation("auth");
  const tp = (k, o) => t(`profile.${k}`, o);
  const [open, setOpen] = useState(
    () => new Set(structure.wings[0] ? [structure.wings[0].id] : []),
  );
  const [adding, setAdding] = useState(false);
  const c = structure.counts;

  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <View>
      <SectionTitle
        title={tp("society")}
        lead={tp("societyLead")}
        action={<SmallButton icon={Plus} label={tp("addWing")} onPress={() => setAdding(true)} />}
      />
      <SurfaceCard>
        <Text className="text-lg font-semibold text-neutral-900">{society.name}</Text>
        {society.address ? (
          <Text className="mt-1 text-sm text-neutral-600">{society.address}</Text>
        ) : null}
        {society.code ? (
          <View className="mt-3 flex-row items-center gap-2 self-start rounded-lg bg-neutral-100 px-3 py-1.5">
            <Text className="text-xs font-semibold uppercase text-neutral-400">{tp("code")}</Text>
            <Text className="text-sm font-bold tracking-widest text-neutral-900">
              {society.code}
            </Text>
          </View>
        ) : null}
      </SurfaceCard>

      <View className="mt-3 flex-row flex-wrap gap-2">
        <Stat label={tp("statResidents")} value={c.residents} brand />
        <Stat label={tp("statWings")} value={c.wings} />
        <Stat label={tp("statFlats")} value={c.flats} />
        <Stat label={tp("statOccupied")} value={`${c.occupied}/${c.flats}`} brand />
      </View>

      <View className="mt-3 gap-2">
        {structure.wings.length === 0 ? (
          <EmptyState title={tp("noWings")} body={tp("noWingsLead")} />
        ) : (
          structure.wings.map((w) => {
            const isOpen = open.has(w.id);
            const residents = w.flats.reduce((n, f) => n + f.residents.length, 0);
            return (
              <SurfaceCard key={w.id} className="p-0">
                <Pressable
                  onPress={() => toggle(w.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  className="flex-row items-center gap-3 p-4"
                >
                  {isOpen ? (
                    <ChevronDown size={18} color="#475569" />
                  ) : (
                    <ChevronRight size={18} color="#475569" />
                  )}
                  <Text className="flex-1 text-base font-semibold text-neutral-900">
                    {w.name === "Main" ? t("auth.structSingleName") : w.name}
                  </Text>
                  <Text className="text-sm text-neutral-600">
                    {w.flats.length} · {residents}
                  </Text>
                </Pressable>
                {isOpen ? (
                  <View className="gap-2 border-t border-neutral-100 px-4 py-3">
                    {w.flats.map((f) => (
                      <View key={f.id} className="flex-row items-start gap-3">
                        <View className="min-w-[56px] items-center rounded-md bg-neutral-100 px-2 py-1">
                          <Text className="text-sm font-bold text-neutral-900">{f.number}</Text>
                        </View>
                        <View className="flex-1 justify-center py-1">
                          {f.residents.length === 0 ? (
                            <Text className="text-sm italic text-neutral-400">
                              {tp("vacant", { defaultValue: "Vacant" })}
                            </Text>
                          ) : (
                            f.residents.map((r) => (
                              <Text key={r.userId} className="text-sm text-neutral-900">
                                {r.name}
                              </Text>
                            ))
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })
        )}
      </View>

      <AddWingSheet
        visible={adding}
        societyId={society.id}
        onClose={() => setAdding(false)}
        onAdded={onChanged}
      />
    </View>
  );
}
