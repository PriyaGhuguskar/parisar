"use client";

// Owners, Tenants and Family Members: one society-wide list per resident type,
// from manager_list_society_residents (migration 078). Resident type is its own
// field, separate from society title and staff role, so a chairman who owns a flat
// shows here as an owner with the title beside the name. No phone numbers: the
// directory's audited reveal stays the only way to see one.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { managerListSocietyResidents, managerResidentTypeCounts } from "@parisar/api-client";
import { Home, KeyRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, PageHeader, PageShell, StatusBadge } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, usePagedList } from "./usePagedList";

export const RESIDENT_TABS = [
  { slug: "owners", type: "owner", icon: Home },
  { slug: "tenants", type: "tenant", icon: KeyRound },
  { slug: "family", type: "family_member", icon: UsersRound },
];

// Status values the RPC returns per type, and the tone each one renders in.
export const STATUS_OPTIONS = {
  owner: ["active", "not_on_app"],
  tenant: ["registered", "owner_approved", "admin_approved", "active", "rejected"],
  family_member: ["active", "not_on_app"],
};
const STATUS_TONE = {
  active: "success",
  not_on_app: "neutral",
  registered: "warning",
  owner_approved: "warning",
  admin_approved: "info",
  rejected: "danger",
};

function NameCell({ row, t }) {
  const title =
    row.society_title && row.society_title !== "resident"
      ? t(`societyTitle.${row.society_title}`)
      : null;
  return (
    <span className="flex flex-col">
      <span className="font-medium text-foreground">{row.full_name || t("residents.noName")}</span>
      {title ? <span className="type-body-sm text-muted-foreground">{title}</span> : null}
    </span>
  );
}

/** Columns for one resident type. Exported for tests. */
export function residentColumns(type, t) {
  const name = {
    key: "full_name",
    header: t("residents.col.name"),
    primary: true,
    cell: (row) => <NameCell row={row} t={t} />,
  };
  const flat = { key: "flat_label", header: t("residents.col.flat"), className: "tabular-nums" };
  const status = {
    key: "status",
    header: t("residents.col.status"),
    cell: (row) => (
      <StatusBadge
        status={row.status}
        label={t(`residents.status.${row.status}`)}
        tone={STATUS_TONE[row.status] ?? "neutral"}
      />
    ),
  };
  if (type === "owner") {
    return [
      name,
      flat,
      status,
      {
        key: "is_primary",
        header: t("residents.col.primary"),
        cell: (row) => (row.is_primary ? t("residents.yes") : "—"),
      },
      {
        key: "verified",
        header: t("residents.col.verified"),
        cell: (row) =>
          row.verified === null || row.verified === undefined
            ? t("residents.notRecorded")
            : row.verified
              ? t("residents.verified")
              : t("residents.notVerified"),
      },
      { key: "membership_number", header: t("residents.col.membershipNumber"), hideOnCard: true },
    ];
  }
  if (type === "tenant") {
    return [
      name,
      flat,
      status,
      { key: "agreement_end", header: t("residents.col.agreementEnd"), className: "tabular-nums" },
      {
        key: "police_status",
        header: t("residents.col.police"),
        cell: (row) => (row.police_status ? t(`residents.police.${row.police_status}`) : "—"),
      },
    ];
  }
  return [
    name,
    flat,
    {
      key: "relationship",
      header: t("residents.col.relationship"),
      cell: (row) =>
        row.relationship
          ? t(`residents.relationship.${row.relationship}`, { defaultValue: row.relationship })
          : "—",
    },
    { key: "added_by_name", header: t("residents.col.addedBy") },
    status,
  ];
}

function Tabs({ active, counts, t }) {
  return (
    <nav aria-label={t("residents.tabsLabel")} className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {RESIDENT_TABS.map(({ slug, type, icon: Icon }) => {
        const on = slug === active;
        const count = counts?.[type];
        return (
          <Link
            key={slug}
            href={`/residents/${slug}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-4 text-[15px] font-medium",
              on
                ? "border-primary bg-primary-soft text-primary-soft-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {t(`residents.tab.${slug}`)}
            {typeof count === "number" ? (
              <span className="tabular-nums text-muted-foreground">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * @param {{ societyId: string, slug: "owners"|"tenants"|"family" }} props
 */
export function ResidentTypeList({ societyId, slug }) {
  const { t } = useTranslation("staff-nav");
  const tab = RESIDENT_TABS.find((x) => x.slug === slug) ?? RESIDENT_TABS[0];
  const type = tab.type;
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    managerResidentTypeCounts(createSupabaseBrowserClient(), societyId)
      .then((res) => {
        if (!cancelled && res && !res.error) setCounts(res);
      })
      .catch((err) => console.error("[residents] counts failed:", err?.message ?? err));
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  const fetchPage = useCallback(
    ({ search, filterValues, limit, offset }) =>
      managerListSocietyResidents(createSupabaseBrowserClient(), {
        societyId,
        residentType: type,
        search: search || null,
        status: filterValues.status || null,
        limit,
        offset,
      }),
    [societyId, type],
  );
  const list = usePagedList(fetchPage);

  const columns = useMemo(() => residentColumns(type, t), [type, t]);
  const filters = useMemo(
    () => [
      {
        key: "status",
        label: t("residents.col.status"),
        allLabel: t("residents.allStatuses"),
        options: STATUS_OPTIONS[type].map((value) => ({
          value,
          label: t(`residents.status.${value}`),
        })),
      },
    ],
    [type, t],
  );

  return (
    <PageShell width="wide">
      <PageHeader
        backHref="/dashboard"
        backLabel={t("nav.home")}
        title={t(`residents.title.${slug}`)}
        description={t(`residents.lead.${slug}`)}
        actions={
          <>
            {type === "tenant" ? (
              <Link
                href="/approvals"
                className={buttonVariants({ variant: "outline", size: "touch" })}
              >
                {t("residents.reviewApprovals")}
              </Link>
            ) : null}
            <Link href="/import" className={buttonVariants({ variant: "outline", size: "touch" })}>
              {t("residents.importAction")}
            </Link>
          </>
        }
      />
      <Tabs active={tab.slug} counts={counts} t={t} />
      <DataTable
        caption={t(`residents.title.${slug}`)}
        columns={columns}
        rows={list.rows}
        rowKey={(row) => `${row.source}:${row.id}`}
        serverSide
        total={list.total}
        pageSize={PAGE_SIZE}
        onQueryChange={list.onQueryChange}
        loading={list.loading}
        error={list.error ? t("residents.loadFailed") : null}
        onRetry={list.retry}
        searchable
        searchPlaceholder={t("residents.searchPlaceholder")}
        filters={filters}
        emptyState={{
          title: t(`residents.empty.${slug}.title`),
          description: t(`residents.empty.${slug}.body`),
        }}
      />
    </PageShell>
  );
}
