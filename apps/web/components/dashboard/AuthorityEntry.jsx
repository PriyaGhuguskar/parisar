"use client";

// Home ⇄ Society Dashboard switch for society authorities (secretary/co-secretary
// role). An authority is also a resident: /dashboard is their own resident home,
// and /society-dashboard is where they manage the society. Residents see nothing.
// (Authorities only reach either page after onboarding as a resident — /dashboard
// sends a flat-less authority to setup/onboarding first.)

import { Home, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export const AUTHORITY_ROLES = new Set(["secretary", "co_secretary"]);

const VIEWS = [
  { id: "home", href: "/dashboard", icon: Home, labelKey: "authority.switchHome" },
  {
    id: "society",
    href: "/society-dashboard",
    icon: ShieldCheck,
    labelKey: "authority.societyDashboard",
  },
];

/**
 * @param {{ role?: string, active?: "home" | "society" }} props
 *   `role` is optional: the Society Dashboard only renders for authorities.
 */
export function AuthorityEntry({ role, active = "home" }) {
  const { t } = useTranslation("auth");
  if (role !== undefined && !AUTHORITY_ROLES.has(role)) return null;

  return (
    <nav
      aria-label={t("authority.switchLabel")}
      className="mb-6 inline-flex rounded-2xl border border-[var(--color-neutral-200)] bg-white p-1"
      data-testid="authority-view-switch"
    >
      {VIEWS.map(({ id, href, icon: Icon, labelKey }) => {
        const on = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={on ? "page" : undefined}
            data-testid={id === "society" ? "authority-society-dashboard" : "authority-home"}
            className="pk-press inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
            style={{
              backgroundColor: on ? "var(--color-brand-500)" : "transparent",
              color: on ? "#fff" : "var(--color-neutral-600)",
            }}
          >
            <Icon size={15} aria-hidden="true" />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
