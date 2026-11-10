"use client";

// Society requests from Connect With Us, paged on the server by
// admin_list_connect_requests. Search, status and submitted-within filters map onto
// the RPC's p_search, p_status and p_from. A row opens the detail drawer, where
// every lifecycle action lives; the row itself offers View details and Call.
//
// `version` changes when the parent learns a request changed (an action in the
// drawer), so the current page is fetched again with the same query.

import { adminListConnectRequests } from "@parisar/api-client";
import { Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, PageHeader, StatusBadge } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  authorityCount,
  currentSlot,
  displayPhone,
  formatSlotDate,
  formatSlotTime,
  listQueryToArgs,
  STATUS_FILTER_VALUES,
  SUBMITTED_WITHIN_DAYS,
  telHref,
} from "./lib/requestFormat";
import { errorText, settle } from "./lib/rpc";

const PAGE_SIZE = 20;

function useColumns(t, lng, onView) {
  return useMemo(
    () => [
      {
        key: "society_name",
        header: t("requests.columns.society"),
        primary: true,
        cell: (row) => (
          <span className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => onView(row)}
              aria-label={t("requests.viewAria", { name: row.society_name })}
              className="focus-ring -my-1 inline-flex min-h-11 items-center rounded text-left font-medium text-primary hover:underline"
            >
              {row.society_name}
            </button>
            <span className="type-caption tabular-nums text-muted-foreground">
              {row.request_code} · {t("requests.numbersCount", { count: authorityCount(row) })}
            </span>
          </span>
        ),
        className: "min-w-44",
      },
      {
        key: "contact_name",
        header: t("requests.columns.contact"),
        cell: (row) => (
          <span className="flex flex-col">
            <span>{row.contact_name}</span>
            <span className="type-body-sm whitespace-nowrap tabular-nums text-muted-foreground">
              {displayPhone(row.phone)}
            </span>
          </span>
        ),
      },
      {
        key: "slot",
        header: t("requests.columns.slot"),
        cell: (row) =>
          row.call_now ? (
            <span className="font-medium text-status-warning-fg">{t("common.callNow")}</span>
          ) : (
            <span className="flex flex-col">
              <span className="whitespace-nowrap">
                {formatSlotDate(currentSlot(row), lng) ?? t("common.none")}
              </span>
              <span className="type-body-sm whitespace-nowrap text-muted-foreground">
                {formatSlotTime(currentSlot(row), lng) ?? ""}
              </span>
            </span>
          ),
      },
      {
        key: "status",
        header: t("requests.columns.status"),
        cell: (row) => <StatusBadge status={row.status} />,
        className: "whitespace-nowrap",
      },
    ],
    [t, lng, onView],
  );
}

function useFilters(t) {
  return useMemo(
    () => [
      {
        key: "status",
        label: t("requests.filters.status"),
        allLabel: t("requests.filters.allStatuses"),
        options: STATUS_FILTER_VALUES.map((value) => ({
          value,
          label: value === "open" ? t("requests.filters.open") : t(`kit:status.${value}`),
        })),
      },
      {
        key: "submitted",
        label: t("requests.filters.submitted"),
        allLabel: t("requests.filters.anyTime"),
        options: SUBMITTED_WITHIN_DAYS.map((days) => ({
          value: String(days),
          label: t("requests.filters.withinDays", { count: days }),
        })),
      },
    ],
    [t],
  );
}

export function ConnectRequestsSection({ version = 0, onView }) {
  const { t, i18n } = useTranslation("platform");
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const queryRef = useRef({ search: "", filterValues: {}, page: 1, pageSize: PAGE_SIZE });
  const seqRef = useRef(0);

  const load = useCallback(async (query) => {
    queryRef.current = query;
    const seq = ++seqRef.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    const supabase = createSupabaseBrowserClient();
    const res = await settle(() => adminListConnectRequests(supabase, listQueryToArgs(query)));
    if (seq !== seqRef.current) return;
    if (res.error) {
      setState({ rows: [], total: 0, loading: false, error: res.error });
      return;
    }
    setState({
      rows: res.data?.items ?? [],
      total: res.data?.total ?? 0,
      loading: false,
      error: null,
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the refetch signal
  useEffect(() => {
    load(queryRef.current);
  }, [load, version]);

  const columns = useColumns(t, i18n.language, onView);
  const filters = useFilters(t);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("requests.title")} description={t("requests.description")} />
      <DataTable
        caption={t("requests.caption")}
        columns={columns}
        rows={state.rows}
        rowKey="id"
        serverSide
        total={state.total}
        pageSize={PAGE_SIZE}
        onQueryChange={load}
        searchable
        searchPlaceholder={t("requests.search")}
        filters={filters}
        loading={state.loading}
        error={
          state.error
            ? state.error === "generic"
              ? t("requests.loadError")
              : errorText(t, state.error)
            : null
        }
        onRetry={() => load(queryRef.current)}
        emptyState={{ title: t("requests.emptyTitle"), description: t("requests.emptyBody") }}
        rowActions={(row) => (
          <>
            <Button type="button" variant="outline" size="touch" onClick={() => onView(row)}>
              {t("requests.view")}
            </Button>
            {telHref(row.phone) ? (
              <a
                href={telHref(row.phone)}
                aria-label={t("requests.callAria", { name: row.contact_name })}
                className={cn(buttonVariants({ variant: "outline", size: "touch" }))}
              >
                <Phone aria-hidden="true" className="size-4" />
                <span className="md:sr-only">{t("requests.call")}</span>
              </a>
            ) : null}
          </>
        )}
      />
    </div>
  );
}
