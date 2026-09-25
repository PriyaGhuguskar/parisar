"use client";

// SocietyDashboardClient — the Society Dashboard shell: Society Authorities
// (list + add) and a grid of the existing society-management pages. Labels reuse
// the already-translated names of those pages.

import {
  AlertCircle,
  Bell,
  Building2,
  ChevronRight,
  ClipboardCheck,
  Key,
  Scale,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PageHeader, PageShell, SurfaceCard } from "@/components/kit";
import { AuthoritiesSection } from "./AuthoritiesSection";

const MANAGE_LINKS = [
  { href: "/society", icon: Building2, labelKey: "auth:profile.societyProfile" },
  { href: "/dashboard/review-queue", icon: ClipboardCheck, labelKey: "dashboard:tiles.reviews" },
  { href: "/dashboard/directory", icon: Users, labelKey: "dashboard:tiles.directory" },
  { href: "/dashboard/code-rotation", icon: Key, labelKey: "dashboard:tiles.societyCode" },
  { href: "/flat-actions", icon: AlertCircle, labelKey: "dashboard:tiles.flatActions" },
  { href: "/notices/new", icon: Bell, labelKey: "notifications:notice.composeCta" },
  { href: "/community/moderation", icon: ShieldAlert, labelKey: "moderation:moderation.title" },
  {
    href: "/settings/grievance-officer",
    icon: Scale,
    labelKey: "moderation:grievance.settingsTitle",
  },
];

export function SocietyDashboardClient({ societyId, userId }) {
  const { t } = useTranslation(["auth", "dashboard", "notifications", "moderation"]);

  return (
    <PageShell>
      <PageHeader
        backHref="/dashboard"
        backLabel={t("dashboard:nav.home")}
        title={t("authority.societyDashboard")}
        description={t("authority.societyDashboardLead")}
      />
      <div className="flex flex-col gap-10">
        <AuthoritiesSection societyId={societyId} userId={userId} />

        <section className="flex flex-col gap-3" data-testid="society-dashboard-manage">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("authority.manageTitle")}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MANAGE_LINKS.map(({ href, icon: Icon, labelKey }) => (
              <li key={href}>
                <Link href={href} className="block">
                  <SurfaceCard interactive className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: "var(--color-brand-50)",
                        color: "var(--color-brand-600)",
                      }}
                    >
                      <Icon size={17} strokeWidth={2.1} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                      {t(labelKey)}
                    </span>
                    <ChevronRight
                      size={16}
                      className="text-[var(--color-neutral-400)]"
                      aria-hidden="true"
                    />
                  </SurfaceCard>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
