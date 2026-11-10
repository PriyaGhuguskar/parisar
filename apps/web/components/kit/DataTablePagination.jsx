"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { pageRange, totalPages } from "./lib/tableQuery";

export function DataTablePagination({ page, pageSize, total, onPageChange }) {
  const { t } = useTranslation("kit");
  const pages = totalPages(total, pageSize);
  const { from, to } = pageRange(page, pageSize, total);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <output className="type-body-sm block text-muted-foreground tabular-nums">
        {t("table.results", { from, to, total })}
      </output>
      {pages > 1 ? (
        <nav aria-label={t("table.pagination")} className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {t("table.previous")}
          </Button>
          <span className="type-body-sm px-1 text-muted-foreground tabular-nums">
            {t("table.page", { page, total: pages })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            {t("table.next")}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
