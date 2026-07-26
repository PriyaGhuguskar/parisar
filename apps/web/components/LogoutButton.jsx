"use client";

import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { signOutAction } from "../app/actions/auth";

// One-click logout using the <form action={signOutAction}> server-action pattern.
// CSRF-safe: Next.js server actions are POST-only; SameSite=Lax cookies block cross-site forms.
// No confirmation dialog — logout is reversible (UI-SPEC D4).

export default function LogoutButton() {
  const { t } = useTranslation("auth");
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex items-center gap-1.5 text-sm text-[var(--color-danger)] hover:opacity-80 transition-opacity"
      >
        <LogOut size={18} aria-hidden="true" />
        {t("auth.logout")}
      </button>
    </form>
  );
}
