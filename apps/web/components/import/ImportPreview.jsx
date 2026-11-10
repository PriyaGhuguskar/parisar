"use client";

// The validation result: totals, then every row with its status and messages.
// Rows and counts are exactly what import_validate_rows / import_get_batch
// returned; nothing is recomputed in the browser.

import { AlertTriangle, CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, MetricCard, StatusBadge } from "@/components/kit";
import { flatLabel, issueText, ROW_TONE, rowValue, summary } from "./lib/importModel";

function Issues({ row, t }) {
  const issues = [
    ...(row.errors ?? []).map((i) => ({ ...i, kind: "error" })),
    ...(row.warnings ?? []).map((i) => ({ ...i, kind: "warning" })),
  ];
  if (!issues.length) return <span className="text-muted-foreground">{t("import.noIssues")}</span>;
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: issues have no id; order is stable
          key={i}
          className={issue.kind === "error" ? "text-destructive" : "text-status-warning-fg"}
        >
          <span className="sr-only">
            {issue.kind === "error" ? t("import.errorPrefix") : t("import.warningPrefix")}
          </span>
          {issueText(t, issue)}
        </li>
      ))}
    </ul>
  );
}

export function ImportPreview({ batch, rows }) {
  const { t } = useTranslation("setup-wizard");
  const s = summary(batch);

  const columns = useMemo(
    () => [
      { key: "row_number", header: t("import.col.row"), align: "right", className: "tabular-nums" },
      {
        key: "full_name",
        header: t("import.col.name"),
        primary: true,
        cell: (row) => rowValue(row, "full_name") || "—",
        searchValue: (row) => rowValue(row, "full_name"),
      },
      {
        key: "flat",
        header: t("import.col.flat"),
        cell: (row) => flatLabel(row),
        searchValue: (row) => flatLabel(row),
        className: "whitespace-nowrap",
      },
      {
        key: "resident_type",
        header: t("import.col.type"),
        cell: (row) => {
          const type = rowValue(row, "resident_type");
          return type ? t(`residentType.${type}`, { defaultValue: type }) : "—";
        },
        searchable: false,
      },
      {
        key: "mobile",
        header: t("import.col.mobile"),
        cell: (row) => rowValue(row, "mobile") || "—",
        searchValue: (row) => rowValue(row, "mobile"),
        className: "tabular-nums",
      },
      {
        key: "status",
        header: t("import.col.status"),
        cell: (row) => (
          <StatusBadge
            status={row.status}
            tone={ROW_TONE[row.status]}
            label={t(`import.rowStatus.${row.status}`)}
          />
        ),
        searchable: false,
      },
      {
        key: "issues",
        header: t("import.col.issues"),
        cell: (row) => <Issues row={row} t={t} />,
        searchable: false,
      },
    ],
    [t],
  );

  const filters = useMemo(
    () => [
      {
        key: "status",
        label: t("import.col.status"),
        allLabel: t("import.filterAll"),
        options: ["valid", "warning", "error", "imported"].map((v) => ({
          value: v,
          label: t(`import.rowStatus.${v}`),
        })),
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <MetricCard
          label={t("import.total")}
          value={s.total}
          icon={FileSpreadsheet}
          tone="neutral"
        />
        <MetricCard label={t("import.valid")} value={s.valid} icon={CheckCircle2} tone="success" />
        <MetricCard
          label={t("import.warnings")}
          value={s.warnings}
          icon={AlertTriangle}
          tone="warning"
        />
        <MetricCard label={t("import.errors")} value={s.errors} icon={XCircle} tone="danger" />
      </div>
      <DataTable
        caption={t("import.tableCaption")}
        columns={columns}
        rows={rows}
        rowKey="row_number"
        searchable
        filters={filters}
        emptyState={{ title: t("import.noRowsTitle"), description: t("import.noRows") }}
      />
    </div>
  );
}
