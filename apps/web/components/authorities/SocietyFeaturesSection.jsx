"use client";

// SocietyFeaturesSection — on the Society Dashboard: every Parisar feature with
// On/Off, its monthly price for this society, and "Request to add / remove".
// Requests go to Parisar staff (admin console → Requests tab), who approve or
// decline; nothing switches until they do. Core features are always included.
// Feature names come from the catalogue (English), like the rest of pricing.

import { listSocietyFeatureState, requestFeatureChange } from "@parisar/api-client";
import { Check, Clock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusPill, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function RequestForm({ feature, societyId, onDone, onCancel }) {
  const { t } = useTranslation("auth");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const action = feature.enabled ? "remove" : "add";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await requestFeatureChange(createSupabaseBrowserClient(), {
        societyId,
        featureKey: feature.key,
        action,
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
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
      <input
        // biome-ignore lint/a11y/noAutofocus: opened by an explicit "request" tap
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder={t("authority.requestNotePh")}
        className="h-10 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3 text-[14px] outline-none focus:border-[var(--color-brand-500)]"
      />
      {err ? (
        <p className="text-[13px] font-semibold text-[var(--color-danger)]" role="alert">
          {err}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-[var(--color-brand-600)] px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {t("authority.sendRequest")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl px-3 py-2 text-[13px] font-semibold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]"
        >
          {t("authority.cancel")}
        </button>
      </div>
    </form>
  );
}

export function SocietyFeaturesSection({ societyId }) {
  const { t } = useTranslation("auth");
  const [rows, setRows] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await listSocietyFeatureState(createSupabaseBrowserClient(), societyId));
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
    <section className="flex flex-col gap-3" data-testid="society-features-section">
      <div>
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
          {t("authority.featuresTitle")}
        </h2>
        <p className="mt-0.5 text-[14px] text-[var(--color-neutral-600)]">
          {t("authority.featuresLead")}
        </p>
        {rows ? (
          <p className="mt-1 text-[14px] font-bold text-[var(--color-neutral-900)]">
            {t("authority.monthlyTotal", { total: total.toLocaleString("en-IN") })}
          </p>
        ) : null}
      </div>

      {notice ? (
        <output className="block text-[13px] font-semibold text-[var(--color-brand-600)]">
          {notice}
        </output>
      ) : null}

      {loadFailed ? (
        <SurfaceCard className="px-5 py-6 text-center text-[14px] text-[var(--color-danger)]">
          {t("authority.featuresLoadError")}
        </SurfaceCard>
      ) : (
        <ul className="flex flex-col gap-2">
          {(rows ?? []).map((f) => (
            <li key={f.key}>
              <SurfaceCard className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-[15px] font-bold text-[var(--color-neutral-900)]">
                    {f.name}
                  </span>
                  <span className="text-[13px] text-[var(--color-neutral-500)]">
                    {f.isCore
                      ? t("authority.included")
                      : t("authority.perMonth", { price: f.price.toLocaleString("en-IN") })}
                  </span>
                  <StatusPill tone={f.enabled ? "done" : "neutral"}>
                    {f.enabled ? t("authority.statusOn") : t("authority.statusOff")}
                  </StatusPill>
                </div>
                {f.description ? (
                  <p className="mt-1 text-[13px] text-[var(--color-neutral-600)]">
                    {f.description}
                  </p>
                ) : null}
                {f.isCore ? null : f.pending ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-warning-700)]">
                    <Clock size={14} aria-hidden="true" />
                    {f.pending.action === "add"
                      ? t("authority.pendingAdd")
                      : t("authority.pendingRemove")}
                  </p>
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
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setOpenKey(f.key);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-bold text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
                  >
                    <Check size={14} aria-hidden="true" />
                    {f.enabled ? t("authority.requestRemove") : t("authority.requestAdd")}
                  </button>
                )}
              </SurfaceCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
