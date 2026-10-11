// apps/mobile/components/society/AmenitiesSection.jsx
// Amenities — list with Working / Closed (till date), add / edit / remove;
// mobile port of apps/web/components/society/AmenitiesSection.jsx.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { deleteAmenity, upsertAmenity } from "@parisar/api-client";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Pencil, Plus, Trash2, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";
import { FormError } from "../auth/FormError";
import { SectionTitle, SmallButton, StatusPill, SurfaceCard } from "../kit";
import { Choice, Field, TextField } from "../onboarding/Form";

function fmtDate(iso, lng) {
  try {
    return new Date(iso).toLocaleDateString(lng, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AmenitiesSection({ societyId }) {
  const { t, i18n } = useTranslation("auth");
  const tp = (k, o) => t(`profile.${k}`, o);
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // {id?, name, status, closedUntil}
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    const { data } = await getSupabase()
      .from("amenities")
      .select("id, name, status, closed_until")
      .eq("society_id", societyId)
      .order("name", { ascending: true });
    setRows(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setError(null);
    if (!editing.name.trim()) return setError(tp("amenityNameRequired"));
    setSaving(true);
    try {
      const res = await upsertAmenity(getSupabase(), {
        societyId,
        id: editing.id ?? null,
        name: editing.name.trim(),
        status: editing.status,
        closedUntil: editing.closedUntil,
      });
      if (res?.error) {
        setError(tp("amenitySaveError"));
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setError(tp("amenitySaveError"));
    } finally {
      setSaving(false);
    }
  }

  function remove(a) {
    Alert.alert(tp("amenityRemove"), a.name, [
      { text: tp("cancel"), style: "cancel" },
      {
        text: tp("amenityRemove"),
        style: "destructive",
        onPress: async () => {
          await deleteAmenity(getSupabase(), a.id);
          await load();
        },
      },
    ]);
  }

  return (
    <View>
      <SectionTitle
        title={tp("amenitiesTitle")}
        lead={tp("amenitiesLead")}
        action={
          <SmallButton
            icon={Plus}
            label={tp("addAmenity")}
            onPress={() => {
              setError(null);
              setEditing({ name: "", status: "working", closedUntil: null });
            }}
          />
        }
      />
      {rows.length === 0 ? (
        <Text className="text-sm text-neutral-400">{tp("noAmenities")}</Text>
      ) : (
        <View className="gap-2">
          {rows.map((a) => (
            <SurfaceCard key={a.id} className="flex-row items-center gap-3 py-3">
              <View className="flex-1 gap-1">
                <Text className="text-base font-semibold text-neutral-900">{a.name}</Text>
                <StatusPill tone={a.status === "closed" ? "progress" : "done"}>
                  {a.status === "closed"
                    ? a.closed_until
                      ? `${tp("statusClosed")} · ${tp("closedTillShort", {
                          date: fmtDate(a.closed_until, i18n.language),
                        })}`
                      : tp("statusClosed")
                    : tp("statusWorking")}
                </StatusPill>
              </View>
              <Pressable
                onPress={() => {
                  setError(null);
                  setEditing({
                    id: a.id,
                    name: a.name,
                    status: a.status ?? "working",
                    closedUntil: a.closed_until ?? null,
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={tp("edit")}
                className="p-1.5"
              >
                <Pencil size={17} color="#475569" />
              </Pressable>
              <Pressable
                onPress={() => remove(a)}
                accessibilityRole="button"
                accessibilityLabel={tp("amenityRemove")}
                className="p-1.5"
              >
                <Trash2 size={17} color="#c81e1e" />
              </Pressable>
            </SurfaceCard>
          ))}
        </View>
      )}

      <Modal
        visible={Boolean(editing)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/40"
        >
          {editing ? (
            <View className="gap-4 rounded-t-3xl bg-neutral-0 p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-semibold text-neutral-900">
                  {editing.id ? tp("edit") : tp("addAmenity")}
                </Text>
                <Pressable
                  onPress={() => setEditing(null)}
                  accessibilityRole="button"
                  className="p-1"
                >
                  <X size={20} color="#64748B" />
                </Pressable>
              </View>
              <Field label={tp("amenityName")}>
                <TextField
                  value={editing.name}
                  onChangeText={(v) => setEditing({ ...editing, name: v })}
                  placeholder={tp("amenityNamePh")}
                  maxLength={60}
                />
              </Field>
              <Field label={tp("amenityStatus")}>
                <Choice
                  options={[
                    ["working", tp("statusWorking")],
                    ["closed", tp("statusClosed")],
                  ]}
                  value={editing.status}
                  onChange={(v) => setEditing({ ...editing, status: v })}
                />
              </Field>
              {editing.status === "closed" ? (
                <Field label={tp("closedTill")}>
                  <Pressable
                    onPress={() => setPicker(true)}
                    accessibilityRole="button"
                    className="h-12 justify-center rounded-lg border border-neutral-200 bg-neutral-0 px-3"
                  >
                    <Text
                      className={`text-base ${editing.closedUntil ? "text-neutral-900" : "text-neutral-400"}`}
                    >
                      {editing.closedUntil
                        ? fmtDate(editing.closedUntil, i18n.language)
                        : tp("closedTill")}
                    </Text>
                  </Pressable>
                </Field>
              ) : null}
              {picker ? (
                <DateTimePicker
                  value={editing.closedUntil ? new Date(editing.closedUntil) : new Date()}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(e, d) => {
                    setPicker(false);
                    if (e?.type === "dismissed" || !d) return;
                    setEditing({ ...editing, closedUntil: d.toISOString().slice(0, 10) });
                  }}
                />
              ) : null}
              <FormError message={error} />
              <View className="flex-row justify-end gap-2.5 pb-2">
                <SmallButton tone="outline" label={tp("cancel")} onPress={() => setEditing(null)} />
                <SmallButton
                  label={saving ? tp("saving") : tp("save")}
                  onPress={save}
                  disabled={saving}
                />
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
