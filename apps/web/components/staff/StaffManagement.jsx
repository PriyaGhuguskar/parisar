"use client";

// Staff Management (society managers): every staff record with its private
// details, from manager_list_staff. Search covers name, last name, employee ID
// and agency; the filter narrows by staff type. Residents keep the shared
// contact list at /staff. A staff record grants no login or permissions.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { managerListStaff } from "@parisar/api-client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, PageHeader, PageShell } from "@/components/kit";
import { PAGE_SIZE, usePagedList } from "@/components/residents/usePagedList";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { STAFF_CATEGORIES } from "./staffFormModel";

/** Columns for the staff table. Exported for tests. */
export function staffColumns(t) {
  return [
    {
      key: "name",
      header: t("staffList.col.name"),
      primary: true,
      cell: (row) => [row.name, row.last_name].filter(Boolean).join(" "),
    },
    {
      key: "category",
      header: t("staffList.col.category"),
      cell: (row) => t(`staffRole.${row.category}`, { defaultValue: row.category }),
    },
    {
      key: "phone",
      header: t("staffList.col.phone"),
      className: "tabular-nums",
      cell: (row) => (row.phone ? `+91 ${row.phone}` : "—"),
    },
    {
      key: "shift",
      header: t("staffList.col.shift"),
      cell: (row) => (row.shift ? t(`shift.${row.shift}`) : "—"),
    },
    { key: "employee_id", header: t("staffList.col.employeeId"), hideOnCard: true },
    { key: "vendor_name", header: t("staffList.col.vendor"), hideOnCard: true },
    {
      key: "id_proof_type",
      header: t("staffList.col.idProof"),
      cell: (row) => (row.id_proof_type ? t(`idProof.${row.id_proof_type}`) : "—"),
    },
  ];
}

/** @param {{ societyId: string }} props */
export function StaffManagement({ societyId }) {
  const { t } = useTranslation("staff-nav");

  const fetchPage = useCallback(
    ({ search, filterValues, limit, offset }) =>
      managerListStaff(createSupabaseBrowserClient(), {
        societyId,
        category: filterValues.category || null,
        search: search || null,
        limit,
        offset,
      }),
    [societyId],
  );
  const list = usePagedList(fetchPage);

  const columns = useMemo(() => staffColumns(t), [t]);
  const filters = useMemo(
    () => [
      {
        key: "category",
        label: t("staffList.col.category"),
        allLabel: t("staffList.allTypes"),
        options: STAFF_CATEGORIES.map((value) => ({ value, label: t(`staffRole.${value}`) })),
      },
    ],
    [t],
  );

  const addLink = (
    <Link href="/staff/manage/new" className={buttonVariants({ size: "touch" })}>
      <Plus className="size-4" aria-hidden="true" />
      {t("staffList.add")}
    </Link>
  );

  return (
    <PageShell width="wide">
      <PageHeader
        backHref="/staff"
        backLabel={t("nav.staffDirectory")}
        title={t("staffList.title")}
        description={t("staffList.lead")}
        actions={addLink}
      />
      <DataTable
        caption={t("staffList.title")}
        columns={columns}
        rows={list.rows}
        rowHref={(row) => `/staff/manage/${row.id}`}
        serverSide
        total={list.total}
        pageSize={PAGE_SIZE}
        onQueryChange={list.onQueryChange}
        loading={list.loading}
        error={list.error ? t("staffList.loadFailed") : null}
        onRetry={list.retry}
        searchable
        searchPlaceholder={t("staffList.searchPlaceholder")}
        filters={filters}
        emptyState={{
          title: t("staffList.emptyTitle"),
          description: t("staffList.emptyBody"),
          action: addLink,
        }}
      />
    </PageShell>
  );
}
