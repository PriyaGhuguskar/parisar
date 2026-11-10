"use client";

// After OTP, an authority of several societies picks the one to open now.
// Shown only to the verified owner of the number, so naming the societies here
// reveals nothing to anyone else.

import { Building2, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const STATE_KEY = {
  needs_setup: "setup-wizard:authLogin.state.needs_setup",
  needs_personal_onboarding: "setup-wizard:authLogin.state.needs_personal_onboarding",
  complete: "setup-wizard:authLogin.state.complete",
};

export default function AuthorityPicker({ societies, onPick, disabled = false }) {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  return (
    <ul className="flex flex-col gap-2.5" aria-label={t("setup-wizard:authLogin.pickLabel")}>
      {societies.map((s) => (
        <li key={s.society_id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="focus-ring flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground"
            >
              <Building2 className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="type-body block truncate font-semibold text-foreground">
                {s.society_name}
              </span>
              <span className="type-body-sm block text-muted-foreground">
                {[s.society_code, t(STATE_KEY[s.setup_state] ?? STATE_KEY.complete)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}
