"use client";

import { createSociety, normalizePhoneForCoSec } from "@parisar/api-client";
import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetupState } from "../../lib/setup-state";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

/**
 * Step 1 — Society Details form.
 *
 * Fields: society name, address, locked secretary mobile, editable co-secretary mobile.
 * On submit: calls createSociety RPC → stores result in Zustand → navigates to /setup/wings.
 */
export default function SocietyForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const setupStore = useSetupState();

  const [secretaryPhone, setSecretaryPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [coSecPhone, setCoSecPhone] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.phone) {
        // Supabase stores phone without leading +
        const raw = user.phone.startsWith("+") ? user.phone : "+" + user.phone;
        // Display as 10-digit local number
        const digits = raw.replace(/\D/g, "");
        setSecretaryPhone(
          digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits,
        );
      }
    }
    loadUser();
  }, []);

  function validate() {
    const errs = {};
    if (!name.trim() || name.trim().length < 3) {
      errs.name = "Society name must be at least 3 characters.";
    }
    if (name.trim().length > 100) {
      errs.name = "Society name must be 100 characters or fewer.";
    }
    if (!address.trim() || address.trim().length < 10) {
      errs.address = "Address must be at least 10 characters.";
    }
    if (address.trim().length > 500) {
      errs.address = "Address must be 500 characters or fewer.";
    }
    const normalizedCoSec = normalizePhoneForCoSec(coSecPhone);
    if (!normalizedCoSec || normalizedCoSec.length !== 10) {
      errs.coSecPhone = t("setup.step1.coSecRequired");
    } else if (!/^[6-9]\d{9}$/.test(normalizedCoSec)) {
      errs.coSecPhone = t("setup.step1.coSecInvalid");
    } else if (normalizedCoSec === secretaryPhone) {
      errs.coSecPhone = t("setup.step1.coSecSameAsSelf");
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // PAR-002 fix: the api-client `createSociety` destructures `coSecretaryPhone`
      // and normalizes it internally — pass the raw state under the correct key.
      const result = await createSociety(supabase, {
        name: name.trim(),
        address: address.trim(),
        coSecretaryPhone: coSecPhone,
      });

      if (result.error) {
        setErrors({ submit: t("auth.networkError") });
        return;
      }

      setupStore.set({
        societyId: result.societyId,
        code: result.code,
        coSecretaryFound: result.coSecretaryFound,
        coSecPhone: normalizedCoSec,
      });

      router.push("/setup/wings");
    } catch {
      setErrors({ submit: t("auth.networkError") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-[var(--color-neutral-0)] rounded-2xl shadow-sm p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("setup.step1.title")}
        </h2>
        <p className="text-base text-[var(--color-neutral-600)]">{t("setup.step1.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Society name */}
        <div className="flex flex-col gap-1.5">
          {/* PAR-063: label↔input association (htmlFor/id) — without it a screen
              reader announces only "edit text". aria-describedby wires the error. */}
          <label htmlFor="setup-society-name" className="text-sm text-[var(--color-neutral-600)]">
            {t("setup.step1.societyName")}
          </label>
          <input
            id="setup-society-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            aria-invalid={errors.name ? "true" : undefined}
            aria-describedby={errors.name ? "setup-society-name-error" : undefined}
            placeholder={t("setup.step1.societyNamePlaceholder")}
            className={[
              "w-full h-12 px-3 rounded-lg border text-base outline-none transition-colors",
              "bg-[var(--color-neutral-0)] text-[var(--color-neutral-900)]",
              "placeholder:text-[var(--color-neutral-400)]",
              errors.name
                ? "border-[var(--color-danger-500)] focus:border-[var(--color-danger-500)]"
                : "border-[var(--color-neutral-200)] focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20",
            ].join(" ")}
          />
          {errors.name && (
            <p id="setup-society-name-error" className="text-sm text-[var(--color-danger-500)]">
              {errors.name}
            </p>
          )}
        </div>

        {/* Address */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="setup-society-address"
            className="text-sm text-[var(--color-neutral-600)]"
          >
            {t("setup.step1.address")}
          </label>
          <textarea
            id="setup-society-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={500}
            rows={3}
            aria-invalid={errors.address ? "true" : undefined}
            aria-describedby={errors.address ? "setup-society-address-error" : undefined}
            placeholder={t("setup.step1.addressPlaceholder")}
            className={[
              "w-full px-3 py-2 rounded-lg border text-base outline-none transition-colors resize-none",
              "bg-[var(--color-neutral-0)] text-[var(--color-neutral-900)]",
              "placeholder:text-[var(--color-neutral-400)]",
              "min-h-[96px] max-h-[180px]",
              errors.address
                ? "border-[var(--color-danger-500)] focus:border-[var(--color-danger-500)]"
                : "border-[var(--color-neutral-200)] focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20",
            ].join(" ")}
          />
          {errors.address && (
            <p id="setup-society-address-error" className="text-sm text-[var(--color-danger-500)]">
              {errors.address}
            </p>
          )}
        </div>

        {/* Secretary phone — locked */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="setup-secretary-phone"
            className="text-sm text-[var(--color-neutral-600)]"
          >
            {t("setup.step1.secretaryPhone")}
          </label>
          <div className="relative">
            <input
              id="setup-secretary-phone"
              type="text"
              value={secretaryPhone}
              readOnly
              disabled
              aria-describedby="setup-secretary-phone-helper"
              className="w-full h-12 px-3 pr-10 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] text-base cursor-not-allowed"
            />
            <LockKeyhole
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]"
            />
          </div>
          <p id="setup-secretary-phone-helper" className="text-sm text-[var(--color-neutral-400)]">
            {t("setup.step1.secretaryPhoneHelper")}
          </p>
        </div>

        {/* Co-secretary phone */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="setup-cosec-phone" className="text-sm text-[var(--color-neutral-600)]">
            {t("setup.step1.coSecPhone")}
          </label>
          <p
            id="setup-cosec-phone-helper"
            className="text-sm text-[var(--color-neutral-600)] -mt-1"
          >
            {t("setup.step1.coSecHelper")}
          </p>
          <input
            id="setup-cosec-phone"
            type="tel"
            value={coSecPhone}
            onChange={(e) => setCoSecPhone(e.target.value)}
            maxLength={10}
            placeholder="98765 43210"
            inputMode="numeric"
            aria-invalid={errors.coSecPhone ? "true" : undefined}
            aria-describedby={
              errors.coSecPhone ? "setup-cosec-phone-error" : "setup-cosec-phone-helper"
            }
            className={[
              "w-full h-12 px-3 rounded-lg border text-base outline-none transition-colors",
              "bg-[var(--color-neutral-0)] text-[var(--color-neutral-900)]",
              "placeholder:text-[var(--color-neutral-400)]",
              errors.coSecPhone
                ? "border-[var(--color-danger-500)] focus:border-[var(--color-danger-500)]"
                : "border-[var(--color-neutral-200)] focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20",
            ].join(" ")}
          />
          {errors.coSecPhone && (
            <p id="setup-cosec-phone-error" className="text-sm text-[var(--color-danger-500)]">
              {errors.coSecPhone}
            </p>
          )}
          <p className="text-sm text-[var(--color-neutral-400)]">
            {t("setup.step1.coSecNotYetJoined")}
          </p>
        </div>

        {errors.submit && <p className="text-sm text-[var(--color-danger-500)]">{errors.submit}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 h-12 rounded-xl bg-[var(--color-brand-500)] text-white text-base font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? t("auth.saving") : "Save & Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
