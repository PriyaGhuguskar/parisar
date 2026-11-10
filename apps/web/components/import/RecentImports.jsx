"use client";

// The society's recent import batches (import_list_batches). A batch that was
// validated but not imported or cancelled can be reopened to finish it.

import { importListBatches } from "@parisar/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, StatusBadge } from "@/components/kit";
import { callRpc } from "@/components/setup/lib/rpc";
import { Button } from "@/components/ui/button";
import { BATCH_TONE } from "./lib/importModel";

function formatWhen(value, lang) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(`${String(lang || "en").slice(0, 2)}-IN-u-nu-latn`, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function RecentImports({ societyId, refreshKey, onOpen, openingId }) {
  const { t, i18n } = useTranslation("setup-wizard");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const res = await callRpc((sb) => importListBatches(sb, { societyId, limit: 10 }));
    setLoading(false);
    if (res.error) {
      setError(true);
      return;
    }
    setItems(res.data?.items ?? []);
  }, [societyId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey re-reads after an import changes
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const columns = useMemo(
    () => [
      {
        key: "file_name",
        header: t("import.recent.file"),
        primary: true,
        cell: (b) => b.file_name || t("import.recent.noName"),
      },
      {
        key: "created_at",
        header: t("import.recent.when"),
        cell: (b) => formatWhen(b.created_at, i18n?.language),
        searchable: false,
      },
      {
        key: "status",
        header: t("import.col.status"),
        cell: (b) => (
          <StatusBadge
            status={b.status}
            tone={BATCH_TONE[b.status]}
            label={t(`import.batchStatus.${b.status}`)}
          />
        ),
        searchable: false,
      },
      {
        key: "counts",
        header: t("import.recent.counts"),
        cell: (b) =>
          t("import.recent.countsValue", {
            total: b.total_rows ?? 0,
            valid: (b.valid_rows ?? 0) + (b.warning_rows ?? 0),
            imported: b.imported_rows ?? 0,
          }),
        searchable: false,
      },
    ],
    [t, i18n?.language],
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="recent-imports-title">
      <h2 id="recent-imports-title" className="type-h2 text-foreground">
        {t("import.recent.title")}
      </h2>
      <DataTable
        caption={t("import.recent.title")}
        columns={columns}
        rows={items}
        rowKey="batch_id"
        loading={loading}
        error={error ? t("import.recent.loadError") : null}
        onRetry={load}
        pageSize={10}
        rowActions={(b) =>
          b.status === "validated" ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={Boolean(openingId)}
              onClick={() => onOpen(b)}
            >
              {openingId === b.batch_id ? t("loading") : t("import.recent.open")}
            </Button>
          ) : null
        }
        emptyState={{ title: t("import.recent.emptyTitle"), description: t("import.recent.empty") }}
      />
    </section>
  );
}
