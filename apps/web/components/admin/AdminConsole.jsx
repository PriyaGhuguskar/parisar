"use client";

// Parisar staff console — sidebar shell, sections, and two drawers (society detail
// and connect-request detail).
//
// The older sections (societies, people, sales requests, catalogue, the society
// drawer's panes) are deliberately English-only internal tooling. Everything added
// for society onboarding (overview metrics, requests, register society, the
// registration pane, appointing users) goes through the `platform` i18n shard.
//
// Every read goes through a SECURITY DEFINER RPC rather than widened RLS, so the
// tenant boundary on societies/memberships is never loosened. The RPCs return no
// resident names, no resident phone numbers and no individual poll votes —
// staff get the operational picture, not the residents.
//
// Admin vs sales: `isAdmin` only chooses what renders. Billing, payments, list
// prices and appointing users are admin-only in the RPCs themselves.

import { adminListConnectRequests, adminOnboardingMetrics } from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  approveSalesApplication,
  listPlatformUsers,
  revokePlatformUser,
} from "@/app/actions/platformUsers";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ActionRow } from "./console/ActionRow";
import { AppointUserDialog } from "./console/AppointUserDialog";
import { CatalogueSection } from "./console/CatalogueSection";
import { Drawer } from "./console/Drawer";
import { OverviewSection } from "./console/OverviewSection";
import { PeopleSection } from "./console/PeopleSection";
import { SalesRequestsSection } from "./console/SalesRequestsSection";
import { MobileSectionNav, Sidebar } from "./console/Sidebar";
import { SocietiesSection } from "./console/SocietiesSection";
import { ConnectRequestDetail } from "./onboarding/ConnectRequestDetail";
import { ConnectRequestsSection } from "./onboarding/ConnectRequestsSection";
import { settle } from "./onboarding/lib/rpc";
import { RegisterSocietySection } from "./onboarding/RegisterSocietySection";
import { SocietyDetail } from "./SocietyDetail";

const NEXT_CALLS = 3;

function useOnboardingData() {
  const [metrics, setMetrics] = useState({ data: null, loading: true, error: null });
  const [nextCalls, setNextCalls] = useState({ items: [], loading: true, error: null });

  const loadMetrics = useCallback(async () => {
    setMetrics((m) => ({ ...m, loading: true, error: null }));
    const res = await settle(() => adminOnboardingMetrics(createSupabaseBrowserClient()));
    setMetrics({ data: res.data ?? null, loading: false, error: res.error ?? null });
  }, []);

  const loadNextCalls = useCallback(async () => {
    setNextCalls((n) => ({ ...n, loading: true, error: null }));
    const res = await settle(() =>
      adminListConnectRequests(createSupabaseBrowserClient(), {
        status: "open",
        limit: NEXT_CALLS,
      }),
    );
    setNextCalls({ items: res.data?.items ?? [], loading: false, error: res.error ?? null });
  }, []);

  useEffect(() => {
    loadMetrics();
    loadNextCalls();
  }, [loadMetrics, loadNextCalls]);

  return { metrics, nextCalls, loadMetrics, loadNextCalls };
}

export function AdminConsole({
  isAdmin = false,
  initialSocieties = [],
  initialStats = {},
  initialFeatures = [],
}) {
  const { t } = useTranslation("platform");
  const [section, setSection] = useState("overview");
  const [societies, setSocieties] = useState(initialSocieties ?? []);
  const [stats, setStats] = useState(initialStats ?? {});
  const [openId, setOpenId] = useState(null);
  const [features, setFeatures] = useState(initialFeatures ?? []);
  const [priceEdit, setPriceEdit] = useState(null); // { key, val }
  const [requestId, setRequestId] = useState(null); // connect request drawer
  const [requestsVersion, setRequestsVersion] = useState(0);
  const [register, setRegister] = useState({ request: null, key: 0 });
  const [appointRole, setAppointRole] = useState(null);
  const onboarding = useOnboardingData();

  // Salesperson applications, loaded on first visit to the tab.
  const [salesApps, setSalesApps] = useState(null); // null = not loaded yet
  // Requests is a disclosure in the sidebar; it stays open while one of its
  // queues is the active section.
  const [requestsOpen, setRequestsOpen] = useState(false);
  // Appointed platform users (staff + sales in one call).
  const [people, setPeople] = useState(null);
  const [pending, setPending] = useState(null); // id currently being acted on
  const [peopleErr, setPeopleErr] = useState(null);

  async function loadPeople() {
    const res = await listPlatformUsers();
    setPeople(res.error ? [] : res.users);
    setPeopleErr(res.error ?? null);
  }

  async function onApprove(app) {
    setPending(app.id);
    setPeopleErr(null);
    const res = await approveSalesApplication({
      id: app.id,
      phone: app.phone,
      name: app.full_name,
    });
    setPending(null);
    if (res.error) {
      setPeopleErr(res.error);
      return;
    }
    setSalesApps((list) => (list ?? []).filter((a) => a.id !== app.id));
    setPeople(null);
  }

  async function onRevoke(userId) {
    setPending(userId);
    const res = await revokePlatformUser(userId);
    setPending(null);
    if (res.error) {
      setPeopleErr(res.error);
      return;
    }
    setPeople((list) => (list ?? []).filter((u) => u.user_id !== userId));
  }

  async function loadSalesApps() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("sales_applications")
      .select("id, full_name, phone, status, created_at")
      .order("created_at", { ascending: false });
    setSalesApps(data ?? []);
  }

  // Returns an error message, or null on success. The edit stays open on failure
  // so the admin sees why and can correct it.
  async function saveListPrice(key, price) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("admin_set_feature_price", {
      p_feature_key: key,
      p_price: price,
    });
    if (error) {
      const code = error.message ?? "";
      return code.includes("NOT_PLATFORM_ADMIN")
        ? "Only a Parisar admin can change list prices."
        : code.includes("INVALID_PRICE")
          ? "Enter a price of ₹0 or more."
          : code.includes("CORE_FEATURE_IS_FREE")
            ? "Core features are always free."
            : "Could not save the price. Check your connection and try again.";
    }
    const { data } = await supabase
      .from("platform_features")
      .select("key, name, description, price_monthly, is_core")
      .order("sort_order");
    if (data) setFeatures(data);
    setPriceEdit(null);
    return null;
  }

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ data: s }, { data: st }] = await Promise.all([
      supabase.rpc("admin_list_societies"),
      supabase.rpc("admin_stats"),
    ]);
    if (s) setSocieties(s);
    if (st) setStats(st);
  }, []);

  const { loadMetrics, loadNextCalls } = onboarding;
  const onRequestsChanged = useCallback(() => {
    setRequestsVersion((v) => v + 1);
    loadMetrics();
    loadNextCalls();
  }, [loadMetrics, loadNextCalls]);

  function selectSection(id) {
    setSection(id);
    if (id === "requestsSales" && salesApps === null) loadSalesApps();
    if ((id === "peopleSales" || id === "peopleStaff") && people === null) loadPeople();
  }

  function startRegister(request) {
    setRequestId(null);
    setRegister((r) => ({ request: request ?? null, key: r.key + 1 }));
    setSection("register");
  }

  function openSociety(id) {
    setRequestId(null);
    setOpenId(id);
  }

  const openRequest = useCallback((row) => setRequestId(row.id), []);
  const closeRequest = useCallback(() => setRequestId(null), []);
  const closeSociety = useCallback(() => setOpenId(null), []);
  const inRequests = section === "requestsSociety" || section === "requestsSales";

  return (
    <div className="admin-scope flex min-h-screen bg-background">
      <Sidebar
        isAdmin={isAdmin}
        section={section}
        inRequests={inRequests}
        requestsOpen={requestsOpen}
        setRequestsOpen={setRequestsOpen}
        requestCount={onboarding.metrics.data?.pending_requests ?? 0}
        onSelect={selectSection}
      />

      <main className="min-w-0 flex-1">
        <MobileSectionNav isAdmin={isAdmin} section={section} onSelect={selectSection} />
        <ActionRow
          isAdmin={isAdmin}
          onNewSociety={() => startRegister(null)}
          onAppoint={setAppointRole}
        />

        <div
          key={section}
          className="a-rise mx-auto w-full max-w-5xl px-4 pb-5 pt-4 sm:px-5 lg:px-8 lg:pb-8"
        >
          {section === "overview" ? (
            <OverviewSection
              isAdmin={isAdmin}
              stats={stats}
              metrics={onboarding.metrics}
              onRetryMetrics={loadMetrics}
              nextCalls={onboarding.nextCalls}
              onRetryNextCalls={loadNextCalls}
              onOpenRequest={openRequest}
              onOpenRequests={() => selectSection("requestsSociety")}
            />
          ) : null}

          {section === "societies" ? (
            <SocietiesSection societies={societies} setOpenId={setOpenId} />
          ) : null}

          {section === "peopleSales" || section === "peopleStaff" ? (
            <PeopleSection
              section={section}
              people={people}
              peopleErr={peopleErr}
              pending={pending}
              onRevoke={onRevoke}
            />
          ) : null}

          {section === "requestsSales" ? (
            <SalesRequestsSection
              isAdmin={isAdmin}
              salesApps={salesApps}
              pending={pending}
              onApprove={onApprove}
            />
          ) : null}

          {section === "requestsSociety" ? (
            <ConnectRequestsSection version={requestsVersion} onView={openRequest} />
          ) : null}

          {section === "catalogue" ? (
            <CatalogueSection
              isAdmin={isAdmin}
              features={features}
              priceEdit={priceEdit}
              setPriceEdit={setPriceEdit}
              saveListPrice={saveListPrice}
            />
          ) : null}

          {section === "register" ? (
            <RegisterSocietySection
              key={register.key}
              request={register.request}
              onRegistered={() => {
                refresh();
                onRequestsChanged();
              }}
              onOpenSociety={openSociety}
              onBackToRequests={() => selectSection("requestsSociety")}
              onRegisterAnother={() => startRegister(null)}
            />
          ) : null}
        </div>
      </main>

      {requestId ? (
        <Drawer label={t("common.close")} onClose={closeRequest} width="max-w-[640px]">
          <ConnectRequestDetail
            requestId={requestId}
            onClose={closeRequest}
            onChanged={onRequestsChanged}
            onRegister={startRegister}
            onOpenSociety={openSociety}
          />
        </Drawer>
      ) : null}

      {openId ? (
        <Drawer label={t("common.close")} onClose={closeSociety}>
          <SocietyDetail
            societyId={openId}
            isAdmin={isAdmin}
            onClose={closeSociety}
            onChanged={refresh}
          />
        </Drawer>
      ) : null}

      {appointRole ? (
        <AppointUserDialog
          role={appointRole}
          onOpenChange={(open) => (open ? null : setAppointRole(null))}
          onAppointed={() =>
            section === "peopleSales" || section === "peopleStaff" ? loadPeople() : setPeople(null)
          }
        />
      ) : null}
    </div>
  );
}
