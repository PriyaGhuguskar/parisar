"use client";

/**
 * Member Directory page — Web Secretary admin screen (Plan 03-10).
 * Lists active members with wing filter + search; each row uses MemberRow
 * which delegates phone reveals to PhonePrivacyChip (audited via reveal_phone RPC).
 *
 * Pattern mirrors apps/mobile/app/(protected)/directory.jsx (Plan 03-08).
 *
 * VISUAL NOTE: the search + wing filters live in a sticky "controls" surface directly
 * under the header, because on a 300-flat society the filters are the screen. The
 * result count is bound to the FILTERED list, not the total — a search that returns
 * nothing must say so, and the EmptyState carries that message.
 */

import { Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemberRow } from "@/components/directory/MemberRow";
import { RecentJoinersSection } from "@/components/directory/RecentJoinersSection";
import { EmptyState, ListSkeleton, PageHeader, PageShell } from "@/components/kit";
import { resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function DirectoryPage() {
  const { t } = useTranslation("auth");
  // Back-link copy lives in the dashboard namespace (nav.home) — reused rather
  // than re-authored so the label stays localised in hi/mr.
  const { t: tNav } = useTranslation("dashboard");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedWing, setSelectedWing] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [societyId, setSocietyId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState("member");

  const supabase = createSupabaseBrowserClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { societyId: sid, role } = await resolveActiveSociety(supabase, user);
      setSocietyId(sid);
      setCurrentUserRole(role);

      if (!sid) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from("society_memberships")
        .select(
          "id, user_id, flat_id, joined_at, residency, status, profiles:user_id(full_name), flats:flat_id(number, wings:wing_id(name))",
        )
        .eq("society_id", sid)
        .eq("status", "active")
        .order("joined_at", { ascending: false });

      if (fetchErr) throw fetchErr;
      setMembers(data ?? []);
    } catch (err) {
      setError(err?.message ?? "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Derive unique wing names from member data
  const wings = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const m of members) {
      const name = m?.flats?.wings?.name;
      if (name && !seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }
    return result.sort();
  }, [members]);

  // Filter list by wing + search
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const wingName = m?.flats?.wings?.name ?? "";
      const passesWing = selectedWing === "all" || wingName === selectedWing;

      const memberName = m?.profiles?.full_name ?? "";
      const flatNum = m?.flats?.number ?? "";
      const q = searchQuery.trim().toLowerCase();
      const passesSearch =
        q.length === 0 ||
        memberName.toLowerCase().includes(q) ||
        flatNum.toLowerCase().includes(q) ||
        wingName.toLowerCase().includes(q);

      return passesWing && passesSearch;
    });
  }, [members, selectedWing, searchQuery]);

  const chipClass = (active) =>
    [
      "pk-press inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2",
      active
        ? "border-[var(--color-brand-500)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]"
        : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-[var(--color-neutral-600)] hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-600)]",
    ].join(" ");

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <PageShell width="wide">
        <PageHeader
          backHref="/dashboard"
          backLabel={t("nav.home", { ns: "dashboard" })}
          title={t("directory.title")}
          actions={
            members.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-50)] px-3 py-1.5 text-[13px] font-bold tabular-nums text-[var(--color-brand-700)]">
                <Users size={14} strokeWidth={2.3} aria-hidden="true" />
                {members.length}
              </span>
            ) : null
          }
        />

        {/* Controls: search first (it is the primary tool), then wing chips. */}
        <div className="pk-in mb-6 flex flex-col gap-3" style={{ "--d": "60ms" }}>
          <div className="relative">
            <Search
              size={17}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("directory.search")}
              className="h-12 w-full rounded-[14px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] pl-11 pr-4 text-[15px] text-[var(--color-neutral-900)] outline-none transition-colors placeholder:text-[var(--color-neutral-400)] focus-visible:border-[var(--color-brand-500)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/25"
              style={{ boxShadow: "0 1px 2px rgba(18,38,28,.05)" }}
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedWing("all")}
              aria-pressed={selectedWing === "all"}
              className={chipClass(selectedWing === "all")}
            >
              {t("directory.filterAll")}
            </button>
            {wings.map((wing) => (
              <button
                key={wing}
                type="button"
                onClick={() => setSelectedWing(wing)}
                aria-pressed={selectedWing === wing}
                className={chipClass(selectedWing === wing)}
              >
                {wing}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-[14px] border px-4 py-3 text-sm font-semibold"
            style={{
              borderColor: "var(--color-danger)",
              backgroundColor: "#FCE9E6",
              color: "#94291A",
            }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && <ListSkeleton rows={5} />}

        {/* Recently joined section (D-03) — top of the directory body. Renders
            nothing when there are no recent joiners or on fetch failure. */}
        {!loading && <RecentJoinersSection societyId={societyId} />}

        {/* Member list */}
        {!loading && filteredMembers.length > 0 && (
          <div className="pk-stagger flex flex-col gap-2.5">
            {filteredMembers.map((membership) => (
              <MemberRow
                key={membership.id}
                membership={membership}
                currentUserRole={currentUserRole}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredMembers.length === 0 && !error && (
          <EmptyState icon={Users} title={t("directory.noResults")} />
        )}
      </PageShell>
    </div>
  );
}
