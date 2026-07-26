"use client";

// GrievanceOfficerForm — admin-only Grievance Officer settings form (web). UI-SPEC
// Screen 9a (D-06). Name (2–80) + contact (email OR Indian phone). Save →
// setGrievanceOfficerAction (admin-only server-side). Defaults-to-Secretary when
// unset (handled by the server COALESCE; the form pre-fills the current value).

import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setGrievanceOfficerAction } from "../../app/(protected)/community/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian phone: 10 digits starting 6–9, optionally +91 / 0 prefix, spaces allowed.
const PHONE_RE = /^(?:\+?91[-\s]?|0)?[6-9]\d{4}[-\s]?\d{5}$/;

function isValidContact(value) {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (EMAIL_RE.test(v)) return true;
  return PHONE_RE.test(v.replace(/\s/g, ""));
}

/**
 * @param {{
 *   initialName?: string,
 *   initialContact?: string,
 *   isDefault?: boolean,
 * }} props
 */
export function GrievanceOfficerForm({ initialName = "", initialContact = "", isDefault = false }) {
  const { t } = useTranslation("moderation");
  const [name, setName] = useState(initialName);
  const [contact, setContact] = useState(initialContact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const nameValid = name.trim().length >= 2 && name.trim().length <= 80;
  const contactValid = isValidContact(contact);
  const canSave = nameValid && contactValid && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      const res = await setGrievanceOfficerAction({ name: name.trim(), contact: contact.trim() });
      if (!res.ok) {
        setError(t("grievance.saveError"));
        return;
      }
      setSuccessOpen(true);
      setTimeout(() => setSuccessOpen(false), 2000);
    } catch {
      setError(t("grievance.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-base text-[#525252]">{t("grievance.settingsIntro")}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="officer-name" className="text-sm text-[#525252]">
          {t("grievance.nameLabel")}
        </label>
        <input
          id="officer-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("grievance.namePlaceholder")}
          maxLength={80}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="officer-contact" className="text-sm text-[#525252]">
          {t("grievance.contactLabel")}
        </label>
        <input
          id="officer-contact"
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t("grievance.contactPlaceholder")}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
        />
      </div>

      {isDefault ? <p className="text-sm text-[#6e6e6e]">{t("grievance.defaultHint")}</p> : null}

      <button
        type="submit"
        disabled={!canSave}
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#0E5A48] text-white text-base font-semibold transition-colors hover:bg-[#0A4436] disabled:bg-neutral-200 disabled:text-[#6e6e6e] disabled:cursor-not-allowed"
      >
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
        {t("grievance.saveCta")}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-[#c81e1e]">
          {error}
        </p>
      ) : null}

      {successOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: status role on div is the toast pattern
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-4 right-4 mx-auto max-w-md inline-flex items-center gap-2 rounded-xl border border-[#047857] bg-[#ecfdf5] text-[#171717] px-4 py-3 shadow-lg z-50"
        >
          <CheckCircle2 size={16} color="#047857" aria-hidden="true" />
          <span className="text-sm">{t("grievance.saveSuccess")}</span>
        </div>
      ) : null}
    </form>
  );
}
