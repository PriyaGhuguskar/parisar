"use client";

// SosButton — the Emergency SOS trigger at the top of home. Opens a modal to
// describe the emergency and choose who to alert (everyone / residents /
// secretary+watchman / watchman only), then raises it via raise_sos.

import { raiseSos } from "@parisar/api-client";
import { Siren, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const AUDIENCES = [
  ["all", "sos.audAll"],
  ["residents", "sos.audResidents"],
  ["secretary_watchman", "sos.audSecWatch"],
  ["watchman", "sos.audWatch"],
];

const DEFAULT_TRIGGER =
  "flex w-full items-center justify-center gap-2 rounded-[16px] px-5 py-3.5 text-[15px] font-extrabold tracking-[0.01em] text-white transition-transform active:scale-[0.99]";

export function SosButton({ societyId, triggerClassName }) {
  const { t } = useTranslation("auth");
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [audience, setAudience] = useState("all");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function send(e) {
    e.preventDefault();
    setError(null);
    if (!desc.trim()) return setError(t("sos.descRequired"));
    setSending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await raiseSos(supabase, { societyId, description: desc.trim(), audience });
      if (res?.error) {
        setError(t("sos.error"));
        setSending(false);
        return;
      }
      setDesc("");
      setAudience("all");
      setOpen(false);
    } catch {
      setError(t("sos.error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? DEFAULT_TRIGGER}
        style={{
          backgroundColor: "var(--color-danger)",
          boxShadow: "0 6px 18px rgba(148,41,26,.28)",
        }}
      >
        <Siren size={19} strokeWidth={2.4} aria-hidden="true" />
        {t("sos.button")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.5)] p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("sos.title")}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-[22px] bg-[var(--color-neutral-0)] p-6 sm:rounded-[22px]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "#FCE9E6", color: "var(--color-danger)" }}
                >
                  <Siren size={20} strokeWidth={2.3} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
                    {t("sos.title")}
                  </h2>
                  <p className="text-[13px] text-[var(--color-neutral-500)]">{t("sos.lead")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("profile.cancel")}
                className="rounded-lg p-1.5 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
              >
                <X size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={send} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                  {t("sos.desc")}
                </span>
                <textarea
                  // biome-ignore lint/a11y/noAutofocus: first field of an explicitly-opened dialog
                  autoFocus
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={t("sos.descPh")}
                  rows={3}
                  maxLength={280}
                  className="w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 py-3 text-[15px] outline-none focus:border-[var(--color-danger)] focus:shadow-[0_0_0_3px_#FCE9E6]"
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                  {t("sos.audience")}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {AUDIENCES.map(([v, key]) => {
                    const on = audience === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAudience(v)}
                        className="rounded-xl border px-3 py-2.5 text-[13px] font-bold transition-colors"
                        style={{
                          borderColor: on ? "var(--color-danger)" : "var(--color-neutral-200)",
                          backgroundColor: on ? "#FCE9E6" : "#fff",
                          color: on ? "var(--color-danger)" : "var(--color-neutral-600)",
                        }}
                      >
                        {t(key)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error ? (
                <p className="text-[13px] font-semibold text-[var(--color-danger)]">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={sending}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: "var(--color-danger)" }}
              >
                <Siren size={17} strokeWidth={2.4} aria-hidden="true" />
                {sending ? t("sos.sending") : t("sos.send")}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
