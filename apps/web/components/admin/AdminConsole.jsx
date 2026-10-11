"use client";

// Parisar staff console — sidebar shell, five sections, society detail drawer.
//
// DELIBERATELY NOT INTERNATIONALISED: internal tooling, never seen by a
// resident. Forcing en/hi/mr parity on strings nobody reads in those languages
// is busywork. Same precedent as DevOtpHint; everything resident-facing stays
// fully translated.
//
// Every read goes through a SECURITY DEFINER RPC rather than widened RLS, so the
// tenant boundary on societies/memberships is never loosened. The RPCs return no
// resident names, no resident phone numbers and no individual poll votes —
// staff get the operational picture, not the residents.

// Each section lives in ./console/*; this file owns the state and the handlers
// so switching sections keeps exactly the behaviour it always had.

import { useState } from "react";
import {
  approveSalesApplication,
  listPlatformUsers,
  revokePlatformUser,
} from "@/app/actions/platformUsers";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ActionRow } from "./console/ActionRow";
import { CatalogueSection } from "./console/CatalogueSection";
import { CreateSocietySection } from "./console/CreateSocietySection";
import { EMPTY_FORM, PHONE_RE } from "./console/constants";
import { OverviewSection } from "./console/OverviewSection";
import { PeopleSection } from "./console/PeopleSection";
import { SalesRequestsSection } from "./console/SalesRequestsSection";
import { MobileSectionNav, Sidebar } from "./console/Sidebar";
import { SocietiesSection } from "./console/SocietiesSection";
import { SocietyRequestsSection } from "./console/SocietyRequestsSection";
import { SocietyDetail } from "./SocietyDetail";

export function AdminConsole({
  isAdmin = false,
  initialLeads = [],
  initialSocieties = [],
  initialStats = {},
  initialFeatures = [],
}) {
  const [section, setSection] = useState("overview");
  const [leads, setLeads] = useState(initialLeads ?? []);
  const [societies, setSocieties] = useState(initialSocieties ?? []);
  const [stats, setStats] = useState(initialStats ?? {});
  const [openId, setOpenId] = useState(null);
  const [features, setFeatures] = useState(initialFeatures ?? []);
  const [priceEdit, setPriceEdit] = useState(null); // { key, val }

  // Salesperson applications. Loaded on first visit to the tab rather than in
  // the server page: most console sessions never open it, and the RLS policy
  // (sales_applications_staff_read) already scopes it to admin/sales.
  const [salesApps, setSalesApps] = useState(null); // null = not loaded yet

  // Requests is a disclosure, not a destination. Starts closed; opens on click,
  // and stays open whenever one of its two queues is the active section so the
  // sidebar never hides where you currently are.
  const [requestsOpen, setRequestsOpen] = useState(false);

  // Appointed platform users (staff + sales in one call — admin_list_platform_users
  // returns both and never discloses admin rows). Split by role at render time.
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
    // Drop it from the queue and invalidate the people list so the new
    // salesperson shows up when that tab is next opened.
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
  const inRequests = section === "requestsSociety" || section === "requestsSales";

  async function loadSalesApps() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("sales_applications")
      .select("id, full_name, phone, status, created_at")
      .order("created_at", { ascending: false });
    setSalesApps(data ?? []);
  }

  async function saveListPrice(key, price) {
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("admin_set_feature_price", { p_feature_key: key, p_price: price });
    const { data } = await supabase
      .from("platform_features")
      .select("key, name, description, price_monthly, is_core")
      .order("sort_order");
    if (data) setFeatures(data);
    setPriceEdit(null);
  }

  const [active, setActive] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: s }, { data: st }] = await Promise.all([
      supabase.rpc("admin_list_societies"),
      supabase.rpc("admin_stats"),
    ]);
    if (s) setSocieties(s);
    if (st) setStats(st);
  }

  function startFromLead(lead) {
    setActive(lead);
    setCreated(null);
    setErr(null);
    // Prefill so staff retype as little as possible while on the call.
    setForm({
      ...EMPTY_FORM,
      name: lead.society_name ?? "",
      authorities: [
        { name: lead.contact_name ?? "", phone: (lead.phone ?? "").replace(/^\+91/, "") },
      ],
    });
    setSection("create");
  }

  async function createSociety(e) {
    e.preventDefault();
    setErr(null);
    // Mirrors the RPC's checks so staff are told before a round trip. The
    // database is still the gate — that endpoint is directly reachable.
    if (form.name.trim().length < 3) return setErr("Society name needs at least 3 characters.");
    if (form.addressLine.trim().length < 5) return setErr("Enter the street address.");
    if (form.city.trim().length < 2) return setErr("Enter the city.");
    if (!form.state) return setErr("Select the state.");
    if (!/^[1-9]\d{5}$/.test(form.pincode))
      return setErr("PIN code must be 6 digits and cannot start with 0.");
    const authorities = form.authorities.map((a) => ({ name: a.name.trim(), phone: a.phone }));
    if (authorities.length === 0) return setErr("Add at least one society authority.");
    for (const [i, a] of authorities.entries()) {
      if (a.name.length < 2) return setErr(`Enter the name of authority ${i + 1}.`);
      if (!PHONE_RE.test(a.phone))
        return setErr(`Authority ${i + 1}: mobile must be 10 digits starting 6-9.`);
    }
    if (new Set(authorities.map((a) => a.phone)).size !== authorities.length)
      return setErr("Each authority needs a different mobile number.");

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("admin_create_society", {
        p_name: form.name.trim(),
        p_address_line: form.addressLine.trim(),
        p_city: form.city.trim(),
        p_state: form.state,
        p_pincode: form.pincode,
        p_landmark: form.landmark.trim() || null,
        p_authorities: authorities,
        p_request_id: active?.id ?? null,
      });
      if (error) {
        setErr(error.message.replace(/_/g, " ").toLowerCase());
        setBusy(false);
        return;
      }
      setCreated({
        code: data.code,
        society: form.name.trim(),
        authorities: authorities.map((a) => a.name).join(", "),
      });
      if (active) setLeads((l) => l.filter((x) => x.id !== active.id));
      await refresh();
      setBusy(false);
    } catch {
      setErr("Could not create the society. Check your connection.");
      setBusy(false);
    }
  }

  function selectSection(id) {
    setSection(id);
    if (id === "requestsSales" && salesApps === null) loadSalesApps();
    if ((id === "peopleSales" || id === "peopleStaff") && people === null) {
      loadPeople();
    }
  }

  const open = societies.find((s) => s.id === openId);

  return (
    <div
      className="admin-scope flex min-h-screen"
      style={{ backgroundColor: "var(--color-neutral-50)" }}
    >
      {/* ---------------- sidebar ---------------- */}
      <Sidebar
        isAdmin={isAdmin}
        section={section}
        inRequests={inRequests}
        requestsOpen={requestsOpen}
        setRequestsOpen={setRequestsOpen}
        leads={leads}
        onSelect={selectSection}
      />

      {/* ---------------- main ---------------- */}
      <main className="min-w-0 flex-1">
        {/* mobile section switcher — the sidebar is desktop-only */}
        <MobileSectionNav isAdmin={isAdmin} section={section} onSelect={selectSection} />

        {/* Action row — the console's three "make something" actions, together
            at the top right of the content rather than stacked in the sidebar.
            They are page-level actions, not navigation, so they do not belong
            in the nav list. Wraps to its own line on narrow viewports. */}
        <ActionRow
          isAdmin={isAdmin}
          onNewSociety={() => {
            setActive(null);
            setCreated(null);
            setForm(EMPTY_FORM);
            setSection("create");
          }}
        />

        <div
          key={section}
          className="a-rise mx-auto w-full max-w-5xl px-5 pb-5 pt-4 lg:px-8 lg:pb-8"
        >
          {/* ---------------- overview ---------------- */}
          {section === "overview" ? (
            <OverviewSection stats={stats} leads={leads} startFromLead={startFromLead} />
          ) : null}

          {/* ---------------- societies ---------------- */}
          {section === "societies" ? (
            <SocietiesSection societies={societies} setOpenId={setOpenId} />
          ) : null}

          {/* ---------------- appointed platform users ---------------- */}
          {section === "peopleSales" || section === "peopleStaff" ? (
            <PeopleSection
              section={section}
              people={people}
              peopleErr={peopleErr}
              pending={pending}
              onRevoke={onRevoke}
            />
          ) : null}

          {/* ---------------- sales requests ---------------- */}
          {section === "requestsSales" ? (
            <SalesRequestsSection
              isAdmin={isAdmin}
              salesApps={salesApps}
              pending={pending}
              onApprove={onApprove}
            />
          ) : null}

          {/* ---------------- requests ---------------- */}
          {section === "requestsSociety" ? (
            <SocietyRequestsSection leads={leads} startFromLead={startFromLead} />
          ) : null}

          {/* ---------------- catalogue ---------------- */}
          {section === "catalogue" ? (
            <CatalogueSection
              isAdmin={isAdmin}
              features={features}
              priceEdit={priceEdit}
              setPriceEdit={setPriceEdit}
              saveListPrice={saveListPrice}
            />
          ) : null}

          {/* ---------------- create ---------------- */}
          {section === "create" ? (
            <CreateSocietySection
              active={active}
              setActive={setActive}
              created={created}
              setCreated={setCreated}
              copied={copied}
              setCopied={setCopied}
              form={form}
              setForm={setForm}
              err={err}
              busy={busy}
              createSociety={createSociety}
            />
          ) : null}
        </div>
      </main>

      {/* ---------------- society detail drawer ---------------- */}
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close detail"
            onClick={() => setOpenId(null)}
            className="a-scrim fixed inset-0 z-40 bg-[rgba(18,38,28,.42)] backdrop-blur-[2px]"
          />
          <div className="a-drawer fixed right-0 top-0 z-50 h-full w-full max-w-[1100px] lg:w-[88vw] border-l border-[var(--color-neutral-200)] bg-white shadow-2xl">
            <SocietyDetail
              societyId={open.id}
              isAdmin={isAdmin}
              onClose={() => setOpenId(null)}
              onChanged={refresh}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
