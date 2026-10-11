"use client";

// SosAlerts — live banners for active emergency alerts the caller is allowed to
// see (RLS scopes visibility by audience + role, so this just selects + subscribes).
// Shown at the top of home for residents and on the guard screen for watchmen.
//
// "Mark resolved" is shown only to people resolve_sos accepts: the raiser, or a
// secretary / co-secretary of the society. Callers may pass role / userId /
// societyId; otherwise they are resolved here (auth.getUser + my_active_society —
// the api-client has no wrapper for my_active_society yet).

import { resolveSos } from "@parisar/api-client";
import { Check, Siren } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { uniqueChannelName } from "../shared/realtime";

const RESOLVER_ROLES = new Set(["secretary", "co_secretary"]);
const WINDOW_MS = 2 * 3600 * 1000; // active alerts from the last 2 hours

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return "";
  }
}

/** Resolve the viewer's user id + live role when the caller didn't pass them. */
function useViewer({ role, userId, societyId }) {
  const [viewer, setViewer] = useState({ role, userId, societyId });

  useEffect(() => {
    if (role !== undefined && userId !== undefined) {
      setViewer({ role, userId, societyId });
      return undefined;
    }
    let active = true;
    const supabase = createSupabaseBrowserClient();
    (async () => {
      try {
        const [{ data: userData }, { data: ctx }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("my_active_society"),
        ]);
        if (!active) return;
        setViewer({
          role: role ?? ctx?.role ?? null,
          userId: userId ?? userData?.user?.id ?? null,
          societyId: societyId ?? ctx?.society_id ?? null,
        });
      } catch {
        // Unknown viewer → no resolve button; banners still show.
      }
    })();
    return () => {
      active = false;
    };
  }, [role, userId, societyId]);

  return viewer;
}

/**
 * @param {{ role?: string|null, userId?: string|null, societyId?: string|null }} props
 */
export function SosAlerts({ role, userId, societyId } = {}) {
  const { t } = useTranslation("auth");
  const [alerts, setAlerts] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({}); // alertId -> i18n key
  const viewer = useViewer({ role, userId, societyId });
  const channelSocietyId = viewer.societyId ?? null;

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("sos_alerts")
      .select("id, description, audience, raised_by, raised_by_name, raised_by_flat, created_at")
      .is("resolved_at", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    if (error) return; // keep what is on screen; the next event retries
    setAlerts(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    load();
    const supabase = createSupabaseBrowserClient();
    const filter = channelSocietyId ? { filter: `society_id=eq.${channelSocietyId}` } : {};
    const channel = supabase
      .channel(uniqueChannelName(`sos-alerts-${channelSocietyId ?? "mine"}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts", ...filter },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, channelSocietyId]);

  function canResolve(alert) {
    if (!viewer.userId && !viewer.role) return false;
    return alert.raised_by === viewer.userId || RESOLVER_ROLES.has(viewer.role);
  }

  async function dismiss(id) {
    if (busyId) return;
    setBusyId(id);
    setErrors((prev) => ({ ...prev, [id]: null }));
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await resolveSos(supabase, id);
      if (res?.error) {
        setErrors((prev) => ({
          ...prev,
          [id]: res.error === "NOT_ALLOWED" ? "sos.resolveNotAllowed" : "sos.resolveError",
        }));
        return;
      }
      await load();
    } catch {
      setErrors((prev) => ({ ...prev, [id]: "sos.resolveError" }));
    } finally {
      setBusyId(null);
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-2">
      {alerts.map((a) => {
        const who = [a.raised_by_name, a.raised_by_flat].filter(Boolean).join(" · ");
        return (
          <div
            key={a.id}
            className="flex items-start gap-3 rounded-[16px] p-4"
            style={{
              backgroundColor: "#FCE9E6",
              border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
            }}
            role="alert"
          >
            <span
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--color-danger)", color: "#fff" }}
            >
              <Siren size={18} strokeWidth={2.3} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-danger)]">
                {t("sos.bannerTitle")} · {fmtTime(a.created_at)}
              </p>
              <p className="mt-0.5 text-[15px] font-bold leading-snug text-[var(--color-neutral-900)]">
                {a.description}
              </p>
              {who ? (
                <p className="mt-0.5 text-[13px] text-[var(--color-neutral-600)]">
                  {t("sos.raisedBy", { who })}
                </p>
              ) : null}
              {errors[a.id] ? (
                <p className="mt-1 text-[12px] font-semibold text-[var(--color-danger)]">
                  {t(errors[a.id])}
                </p>
              ) : null}
            </div>
            {canResolve(a) ? (
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                disabled={busyId === a.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] font-bold text-[var(--color-danger)] hover:bg-white disabled:opacity-60"
              >
                <Check size={13} strokeWidth={2.6} aria-hidden="true" />
                {t("sos.resolve")}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
