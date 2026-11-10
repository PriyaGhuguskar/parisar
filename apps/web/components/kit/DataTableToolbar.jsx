"use client";

import { Search } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "./controlStyles";

export function DataTableToolbar({
  searchable,
  searchPlaceholder,
  search,
  onSearch,
  filters = [],
  filterValues,
  onFilter,
  actions,
}) {
  const { t } = useTranslation("kit");
  const baseId = useId();
  if (!searchable && filters.length === 0 && !actions) return null;
  const searchLabel = searchPlaceholder ?? t("table.search");
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      {searchable ? (
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <label htmlFor={`${baseId}-search`} className="sr-only">
            {searchLabel}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
          />
          <input
            id={`${baseId}-search`}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchLabel}
            className={cn(CONTROL_CLASS, "pl-9")}
          />
        </div>
      ) : null}
      {filters.map((filter) => (
        <div key={filter.key} className="flex min-w-0 flex-col gap-1 md:w-44">
          <label htmlFor={`${baseId}-${filter.key}`} className="type-caption text-muted-foreground">
            {filter.label}
          </label>
          <select
            id={`${baseId}-${filter.key}`}
            value={filterValues[filter.key] ?? ""}
            onChange={(event) => onFilter(filter.key, event.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">{filter.allLabel ?? t("table.filterAll")}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">{actions}</div>
      ) : null}
    </div>
  );
}
