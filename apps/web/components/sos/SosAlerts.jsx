"use client";

// SosAlerts — live banners for active emergency alerts the caller is allowed to
// see (RLS scopes visibility by audience + role, so this just selects + subscribes).
// Shown at the top of home for residents and on the guard screen for watchmen.

import { resolveSos } from "@parisar/api-client";
import { Check, Siren } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function SosAlerts() {
  const { t } = useTranslation("auth");
  const [alerts, setAlerts] = useState([]);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    // Active alerts from the last 2 hours; RLS returns only what the caller may see.
    const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("sos_alerts")
      .select("id, description, audience, raised_by_name, raised_by_flat, created_at")
      .is("resolved_at", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    setAlerts(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("sos-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function dismiss(id) {
    const supabase = createSupabaseBrowserClient();
    await resolveSos(supabase, id);
    await load();
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
            </div>
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] font-bold text-[var(--color-danger)] hover:bg-white"
            >
              <Check size={13} strokeWidth={2.6} aria-hidden="true" />
              {t("sos.resolve")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
