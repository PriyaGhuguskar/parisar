"use client";

// Two-way choice on /login: sign in as a resident (default) or as a society
// authority. Both send the same OTP; the choice only changes what /verify does
// after the OTP has proved the number.

import { useTranslation } from "react-i18next";

const OPTIONS = ["resident", "authority"];

export default function SignInAsToggle({ value, onChange }) {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] font-bold text-[var(--color-neutral-900)]">
        {t("setup-wizard:authLogin.signInAs")}
      </legend>
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] p-1">
        {OPTIONS.map((option) => {
          const on = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option)}
              className={[
                "min-h-11 rounded-xl px-3 text-[14px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]",
                on
                  ? "bg-[var(--color-brand-500)] text-[var(--color-neutral-0)]"
                  : "text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]",
              ].join(" ")}
            >
              {t(`setup-wizard:authLogin.as.${option}`)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
