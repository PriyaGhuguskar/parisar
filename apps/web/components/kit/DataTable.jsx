"use client";

// Search, filters, pagination and every async state, as a table from md up and as
// stacked cards on phones.
//
//   <DataTable
//     caption="Society requests"
//     columns={[
//       { key: "society", header: "Society", primary: true },
//       { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
//     ]}
//     rows={rows}
//     rowKey="id"
//     rowHref={(row) => `/admin/requests/${row.id}`}
//     searchable
//     filters={[{ key: "status", label: "Status", options: statusOptions }]}
//     loading={loading}
//     error={error}
//     onRetry={reload}
//     emptyState={{ title: "No requests yet", description: "..." }}
//   />
//
// Client mode (default): works over `rows` locally. Server mode (serverSide + total):
// shows `rows` as given and reports { search, filterValues, page, pageSize } through
// onQueryChange, debouncing search. See docs/onboarding/DESIGN.md for the column API.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DataTablePagination } from "./DataTablePagination";
import { DataTableToolbar } from "./DataTableToolbar";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { paginate, queryRows, totalPages } from "./lib/tableQuery";

const SEARCH_DEBOUNCE_MS = 300;
const ALIGN_CLASS = { right: "text-right", center: "text-center" };

function cellValue(column, row) {
  return column.cell ? column.cell(row) : row[column.key];
}

function PrimaryCell({ column, row, rowHref }) {
  const href = rowHref?.(row);
  if (!href) return cellValue(column, row);
  return (
    <Link
      href={href}
      className="focus-ring -my-2 inline-flex min-h-11 items-center rounded font-medium text-primary hover:underline"
    >
      {cellValue(column, row)}
    </Link>
  );
}

function DesktopTable({ caption, columns, rows, keyOf, rowHref, rowActions, t }) {
  return (
    <div data-scroll-x className="hidden rounded-xl border border-border bg-card md:block">
      <table className="type-body w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "type-caption whitespace-nowrap px-4 py-3 font-medium text-muted-foreground",
                  ALIGN_CLASS[column.align],
                )}
              >
                {column.header}
              </th>
            ))}
            {rowActions ? (
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">{t("table.actions")}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyOf(row)} className="border-b border-border last:border-b-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle text-foreground",
                    ALIGN_CLASS[column.align],
                    column.align === "right" && "tabular-nums",
                    column.className,
                  )}
                >
                  {column.primary ? (
                    <PrimaryCell column={column} row={row} rowHref={rowHref} />
                  ) : (
                    cellValue(column, row)
                  )}
                </td>
              ))}
              {rowActions ? (
                <td className="px-4 py-2 text-right whitespace-nowrap">{rowActions(row)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({ columns, rows, keyOf, rowHref, rowActions }) {
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const rest = columns.filter((column) => column !== primary && !column.hideOnCard);
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {rows.map((row) => (
        <li key={keyOf(row)} className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="type-body font-medium text-foreground">
            <PrimaryCell column={primary} row={row} rowHref={rowHref} />
          </div>
          {rest.length > 0 ? (
            <dl className="mt-2 flex flex-col gap-1.5">
              {rest.map((column) => (
                <div key={column.key} className="flex items-baseline justify-between gap-4">
                  <dt className="type-body-sm shrink-0 text-muted-foreground">{column.header}</dt>
                  <dd className="type-body min-w-0 text-right text-foreground">
                    {cellValue(column, row)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {rowActions ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              {rowActions(row)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({
  caption,
  columns,
  rows = [],
  rowKey = "id",
  rowHref,
  rowActions,
  loading = false,
  error = null,
  onRetry,
  emptyState,
  searchable = false,
  searchPlaceholder,
  filters = [],
  toolbarActions,
  pageSize = 20,
  serverSide = false,
  total,
  onQueryChange,
  className,
}) {
  const { t } = useTranslation("kit");
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState({});
  const [page, setPage] = useState(1);

  const keyOf = (row) => (typeof rowKey === "function" ? rowKey(row) : row[rowKey]);

  const matched = useMemo(
    () => (serverSide ? rows : queryRows(rows, { search, filterValues, columns, filters })),
    [serverSide, rows, search, filterValues, columns, filters],
  );
  const count = serverSide ? (total ?? rows.length) : matched.length;
  const pages = totalPages(count, pageSize);
  // A filter or a smaller refetch can leave the page past the end.
  const safePage = Math.min(page, pages);
  const visible = serverSide ? rows : paginate(matched, safePage, pageSize);

  const hasQuery = search.trim() !== "" || Object.values(filterValues).some(Boolean);

  // Server mode: report query changes. Search waits for a pause in typing; page and
  // filter changes go at once. The first run is skipped: the parent loaded page 1.
  const queryChangeRef = useRef(onQueryChange);
  queryChangeRef.current = onQueryChange;
  const firstRun = useRef(true);
  const lastSearch = useRef(search);
  useEffect(() => {
    if (!serverSide) return undefined;
    if (firstRun.current) {
      firstRun.current = false;
      return undefined;
    }
    const delay = lastSearch.current === search ? 0 : SEARCH_DEBOUNCE_MS;
    lastSearch.current = search;
    const timer = setTimeout(() => {
      queryChangeRef.current?.({ search, filterValues, page: safePage, pageSize });
    }, delay);
    return () => clearTimeout(timer);
  }, [serverSide, search, filterValues, safePage, pageSize]);

  function handleSearch(value) {
    setSearch(value);
    setPage(1);
  }

  function handleFilter(key, value) {
    setFilterValues((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clearQuery() {
    setSearch("");
    setFilterValues({});
    setPage(1);
  }

  const showSkeleton = loading && visible.length === 0;
  const showEmpty = !loading && !error && visible.length === 0;

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)} aria-busy={loading || undefined}>
      <DataTableToolbar
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        search={search}
        onSearch={handleSearch}
        filters={filters}
        filterValues={filterValues}
        onFilter={handleFilter}
        actions={toolbarActions}
      />
      {error ? (
        <ErrorState description={typeof error === "string" ? error : undefined} onRetry={onRetry} />
      ) : null}
      {!error && showSkeleton ? <LoadingState variant="list" rows={Math.min(pageSize, 5)} /> : null}
      {showEmpty && hasQuery ? (
        <EmptyState
          title={t("table.noResultsTitle")}
          description={t("table.noResultsBody")}
          action={
            <Button type="button" variant="outline" size="touch" onClick={clearQuery}>
              {t("table.clearFilters")}
            </Button>
          }
        />
      ) : null}
      {showEmpty && !hasQuery ? <EmptyState title={t("table.emptyTitle")} {...emptyState} /> : null}
      {!error && visible.length > 0 ? (
        <>
          <DesktopTable
            caption={caption}
            columns={columns}
            rows={visible}
            keyOf={keyOf}
            rowHref={rowHref}
            rowActions={rowActions}
            t={t}
          />
          <MobileCards
            columns={columns}
            rows={visible}
            keyOf={keyOf}
            rowHref={rowHref}
            rowActions={rowActions}
          />
          <DataTablePagination
            page={safePage}
            pageSize={pageSize}
            total={count}
            onPageChange={setPage}
          />
        </>
      ) : null}
    </div>
  );
}
