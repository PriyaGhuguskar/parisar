"use client";

// /verification/admin: the society's resident records with counts, search and
// filters (manager only; the RPC checks again). Review, prepare a copyable
// invitation, or add one record by hand. Nothing here creates a membership: the
// resident does that by confirming after OTP.

import { managerListResidentRecords, managerPrepareResidentInvite } from "@parisar/api-client";
import { AlertTriangle, CheckCircle2, Clock, Plus, Users, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable, MetricCard, Notice, PageHeader, PageShell } from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { StateBadge } from "@/components/onboarding/StateBadge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AddResidentPanel } from "./AddResidentPanel";
import { InvitePanel } from "./InvitePanel";
import { ReviewPanel } from "./ReviewPanel";
import { useSocietyFlats } from "./useSocietyFlats";

const PAGE_SIZE = 25;
const STATUSES = ["pending", "needs_correction", "verified", "rejected"];
const TYPES = ["owner", "tenant", "family_member"];

export function AdminVerification({ societyId }) {
  const { t } = useTranslation("resident-onboarding");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState(null); // { kind: review|invite|add, record?, invite? }
  const [notice, setNotice] = useState(null);
  const query = useRef({ search: "", filterValues: {}, page: 1 });
  const flats = useSocietyFlats(societyId);

  const load = useCallback(async () => {
    const q = query.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await managerListResidentRecords(createSupabaseBrowserClient(), {
        societyId,
        status: q.filterValues.status || null,
        residentType: q.filterValues.resident_type || null,
        search: q.search.trim() || null,
        limit: PAGE_SIZE,
        offset: (q.page - 1) * PAGE_SIZE,
      });
      if (res?.error) throw new Error(res.error);
      setData(res);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  function onQueryChange(q) {
    query.current = q;
    load();
  }

  async function prepareInvite(record) {
    setNotice(null);
    try {
      const res = await managerPrepareResidentInvite(createSupabaseBrowserClient(), record.id);
      if (res?.error) {
        setNotice({ tone: "danger", text: errorMessage(t, res) });
        return;
      }
      setPanel({ kind: "invite", invite: res });
    } catch {
      setNotice({ tone: "danger", text: t("errors.generic") });
    }
  }

  const columns = useMemo(
    () => [
      { key: "full_name", header: t("verify.name"), primary: true },
      { key: "flat_label", header: t("verify.flat") },
      {
        key: "resident_type",
        header: t("verify.residentType"),
        cell: (r) => t(`residentType.${r.resident_type}`),
      },
      { key: "phone", header: t("admin.mobile"), className: "tabular-nums" },
      {
        key: "status",
        header: t("admin.status"),
        cell: (r) => <StateBadge kind="record" status={r.status} />,
      },
      {
        key: "source",
        header: t("admin.source"),
        cell: (r) => t(`admin.sourceValue.${r.source}`),
        hideOnCard: true,
      },
    ],
    [t],
  );
  const filters = useMemo(
    () => [
      {
        key: "status",
        label: t("admin.status"),
        options: STATUSES.map((s) => ({ value: s, label: t(`status.record.${s}`) })),
      },
      {
        key: "resident_type",
        label: t("verify.residentType"),
        options: TYPES.map((s) => ({ value: s, label: t(`residentType.${s}`) })),
      },
    ],
    [t],
  );

  const counts = data?.counts ?? {};
  const metric = (k) => (data ? (counts[k] ?? 0) : null);

  function done(_res, message) {
    setPanel(null);
    setNotice({ tone: "success", text: message });
    load();
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title={t("admin.title")}
        description={t("admin.sub")}
        actions={
          <Button type="button" size="touch" onClick={() => setPanel({ kind: "add" })}>
            <Plus aria-hidden="true" />
            {t("admin.add")}
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <MetricCard
          label={t("admin.metric.all")}
          value={metric("all")}
          icon={Users}
          loading={!data && loading}
        />
        <MetricCard
          label={t("status.record.pending")}
          value={metric("pending")}
          icon={Clock}
          tone="warning"
          loading={!data && loading}
        />
        <MetricCard
          label={t("status.record.needs_correction")}
          value={metric("needs_correction")}
          icon={AlertTriangle}
          tone="warning"
          loading={!data && loading}
        />
        <MetricCard
          label={t("status.record.verified")}
          value={metric("verified")}
          icon={CheckCircle2}
          tone="success"
          loading={!data && loading}
        />
        <MetricCard
          label={t("status.record.rejected")}
          value={metric("rejected")}
          icon={XCircle}
          tone="danger"
          loading={!data && loading}
        />
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {notice ? (
          <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}
          </Notice>
        ) : null}
        {panel?.kind === "add" ? (
          <AddResidentPanel
            societyId={societyId}
            flatOptions={flats.options}
            flatsFailed={flats.failed}
            onRetryFlats={flats.reload}
            onAdded={(rec) => done(rec, t("admin.added", { name: rec.full_name }))}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel?.kind === "review" ? (
          <ReviewPanel
            key={panel.record.id}
            record={panel.record}
            flatOptions={flats.options}
            onDone={done}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel?.kind === "invite" ? (
          <InvitePanel invite={panel.invite} onClose={() => setPanel(null)} />
        ) : null}

        <DataTable
          caption={t("admin.tableCaption")}
          columns={columns}
          rows={data?.items ?? []}
          serverSide
          total={data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onQueryChange={onQueryChange}
          searchable
          searchPlaceholder={t("admin.search")}
          filters={filters}
          loading={loading}
          error={failed ? t("admin.loadError") : null}
          onRetry={load}
          emptyState={{ title: t("admin.emptyTitle"), description: t("admin.emptyBody") }}
          rowActions={(r) => (
            <div className="flex flex-wrap gap-2">
              {r.status !== "verified" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => {
                    setNotice(null);
                    setPanel({ kind: "review", record: r });
                  }}
                >
                  {t("admin.review")}
                </Button>
              ) : null}
              {r.status === "pending" ? (
                <Button type="button" variant="ghost" size="touch" onClick={() => prepareInvite(r)}>
                  {t("admin.invite")}
                </Button>
              ) : null}
            </div>
          )}
        />
      </div>
    </PageShell>
  );
}
