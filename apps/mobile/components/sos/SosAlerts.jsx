// apps/mobile/components/sos/SosAlerts.jsx
// Live banners for active emergency alerts the caller may see — the mobile port
// of apps/web/components/sos/SosAlerts.jsx. RLS scopes visibility by audience
// and role, so this just selects (last 2 hours, unresolved) and subscribes.
// Shown on the home dashboard and on the guard screen.
//
// "Mark resolved" is shown only to people resolve_sos allows: whoever raised
// the alert, or the society's Secretary / Co-Secretary.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { resolveSos } from "@parisar/api-client";
import { format } from "date-fns";
import { Check, Siren } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useAuthStore } from "../../lib/auth-store";
import { getSupabase } from "../../lib/supabase";
import { AUTHORITY_ROLES, useMyContext } from "../../lib/use-my-context";
import { useDateLocale } from "../hooks/use-date-locale";
import { parsePgTimestamp, toIstWallClock } from "../shared/ist-time";
import { cryptoRandomUUID } from "../shared/uuid";
import { Text } from "../ui/Text";

const WINDOW_MS = 2 * 60 * 60 * 1000; // alerts older than 2h drop off
const REFILTER_MS = 60 * 1000;

function fmtTime(iso, locale) {
  const d = parsePgTimestamp(iso);
  return d ? format(toIstWallClock(d), "h:mm a", { locale }) : "";
}

function isFresh(alert, nowMs) {
  const d = parsePgTimestamp(alert.created_at);
  return !!d && nowMs - d.getTime() <= WINDOW_MS;
}

export function SosAlerts() {
  const { t } = useTranslation("auth");
  const dateLocale = useDateLocale();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const { societyId, role } = useMyContext();
  const canResolveAny = AUTHORITY_ROLES.has(role);

  const [alerts, setAlerts] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [resolvingId, setResolvingId] = useState(null);
  const [error, setError] = useState(null);
  // One channel name per mount (supabase.channel() re-uses open channels by name).
  const channelNameRef = useRef(`sos-alerts:${cryptoRandomUUID()}`);

  const load = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
      let q = getSupabase()
        .from("sos_alerts")
        .select(
          "id, society_id, description, audience, raised_by, raised_by_name, raised_by_flat, created_at",
        )
        .is("resolved_at", null)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });
      if (societyId) q = q.eq("society_id", societyId);
      const { data, error: readError } = await q;
      if (readError) throw readError;
      setAlerts(Array.isArray(data) ? data : []);
      setNowMs(Date.now());
    } catch {
      // Keep whatever is already on screen — an emergency banner must not
      // vanish because one refresh failed. The next realtime event retries.
    }
  }, [societyId]);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const filter = societyId ? { filter: `society_id=eq.${societyId}` } : {};
    const channel = supabase
      .channel(`${channelNameRef.current}:${societyId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts", ...filter },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, societyId]);

  // The 2-hour window is applied at load time; tick so old alerts drop off
  // while the screen stays open.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), REFILTER_MS);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(() => alerts.filter((a) => isFresh(a, nowMs)), [alerts, nowMs]);

  async function dismiss(id) {
    if (resolvingId) return;
    setError(null);
    setResolvingId(id);
    try {
      const res = await resolveSos(getSupabase(), id);
      if (res?.error) {
        setError(t("sos.resolveError"));
        return;
      }
      await load();
    } catch {
      setError(t("sos.resolveError"));
    } finally {
      setResolvingId(null);
    }
  }

  if (visible.length === 0) return null;

  return (
    <View className="mb-4 gap-2">
      {visible.map((a) => {
        const who = [a.raised_by_name, a.raised_by_flat].filter(Boolean).join(" · ");
        const canResolve = canResolveAny || (!!userId && a.raised_by === userId);
        return (
          <View
            key={a.id}
            accessibilityRole="alert"
            className="flex-row items-start gap-3 rounded-2xl p-4"
            style={{ backgroundColor: "#FCE9E6", borderWidth: 1, borderColor: "#EFB3A8" }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-danger-500">
              <Siren size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold uppercase tracking-wide text-danger-500">
                {t("sos.bannerTitle")} · {fmtTime(a.created_at, dateLocale)}
              </Text>
              <Text className="mt-0.5 text-base font-semibold text-neutral-900">
                {a.description}
              </Text>
              {who ? (
                <Text className="mt-0.5 text-sm text-neutral-600">
                  {t("sos.raisedBy", { who })}
                </Text>
              ) : null}
            </View>
            {canResolve ? (
              <Pressable
                onPress={() => dismiss(a.id)}
                disabled={resolvingId === a.id}
                accessibilityRole="button"
                accessibilityState={{ busy: resolvingId === a.id }}
                className="flex-row items-center gap-1 rounded-lg bg-neutral-0 px-2.5 py-1.5"
              >
                <Check size={13} color="#c81e1e" />
                <Text className="text-xs font-bold text-danger-500">{t("sos.resolve")}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {error ? (
        <Text className="text-sm text-danger-500" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
