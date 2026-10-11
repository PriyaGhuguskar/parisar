"use client";

// SosButton — the Emergency SOS trigger at the top of home. Opens a dialog
// (shadcn Dialog: Escape closes, focus is trapped) to describe the emergency and
// choose who to alert (everyone / residents / secretary+watchman / watchman
// only), then raises it via raise_sos and shows a "sent" confirmation.
// SOS_RATE_LIMITED (3 per 10 min, contract-055) gets its own message.

import { raiseSos } from "@parisar/api-client";
import { CheckCircle2, Siren } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

const AUDIENCES = [
  ["all", "sos.audAll"],
  ["residents", "sos.audResidents"],
  ["secretary_watchman", "sos.audSecWatch"],
  ["watchman", "sos.audWatch"],
];

const MAX_DESC = 280;

const DEFAULT_TRIGGER =
  "flex w-full items-center justify-center gap-2 rounded-[16px] px-5 py-3.5 text-[15px] font-extrabold tracking-[0.01em] text-white transition-transform active:scale-[0.99]";

function sosErrorKey(code) {
  const c = String(code ?? "");
  if (c.includes("SOS_RATE_LIMITED")) return "sos.rateLimited";
  if (c.includes("INVALID_DESC")) return "sos.descRequired";
  return "sos.error";
}

export function SosButton({ societyId, triggerClassName }) {
  const { t } = useTranslation("auth");
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [audience, setAudience] = useState("all");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  function handleOpenChange(next) {
    if (sending) return;
    setOpen(next);
    if (!next) {
      setSent(false);
      setError(null);
    }
  }

  async function send(e) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    if (!desc.trim()) return setError(t("sos.descRequired"));
    setSending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await raiseSos(supabase, { societyId, description: desc.trim(), audience });
      if (res?.error) {
        setError(t(sosErrorKey(res.error)));
        return;
      }
      setDesc("");
      setAudience("all");
      setSent(true);
    } catch (err) {
      setError(t(sosErrorKey(err?.message)));
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

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md rounded-[22px] bg-[var(--color-neutral-0)] p-6 sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: "#FCE9E6", color: "var(--color-danger)" }}
              >
                <Siren size={20} strokeWidth={2.3} aria-hidden="true" />
              </span>
              <div>
                <DialogTitle className="text-[19px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
                  {t("sos.title")}
                </DialogTitle>
                <DialogDescription className="text-[13px] text-[var(--color-neutral-500)]">
                  {t("sos.lead")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {sent ? (
            <output
              aria-live="polite"
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <CheckCircle2 size={36} color="#047857" aria-hidden="true" />
              <span className="text-[15px] font-bold text-[var(--color-neutral-900)]">
                {t("sos.sent")}
              </span>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="mt-1 rounded-xl px-5 py-2.5 text-[14px] font-bold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]"
              >
                {t("sos.close")}
              </button>
            </output>
          ) : (
            <form onSubmit={send} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                  {t("sos.desc")}
                </span>
                <textarea
                  autoFocus
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={t("sos.descPh")}
                  rows={3}
                  maxLength={MAX_DESC}
                  className="w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 py-3 text-[15px] outline-none focus:border-[var(--color-danger)] focus:shadow-[0_0_0_3px_#FCE9E6]"
                />
              </label>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-[13px] font-bold text-[var(--color-neutral-900)]">
                  {t("sos.audience")}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {AUDIENCES.map(([v, key]) => {
                    const on = audience === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
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
              </fieldset>

              {error ? (
                <p role="alert" className="text-[13px] font-semibold text-[var(--color-danger)]">
                  {error}
                </p>
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
