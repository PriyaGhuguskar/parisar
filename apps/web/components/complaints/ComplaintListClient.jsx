"use client";

// ComplaintListClient — CSR wrapper around the SSR-fetched complaint list.
//
// Responsibilities:
//   1. Subscribe to Realtime INSERT/UPDATE for the current society on mount.
//      Unsubscribe on unmount. New rows get an `animate-slide-down` class for
//      one render pass so they slide in from the top.
//   2. For board roles: render Open / Resolved tabs (in-memory filter).
//      Member view: no tabs (RLS already self-filters reporter_id).
//   3. Render the FlatList of ComplaintCard rows; click → /complaints/{id}.
//   4. Empty / error states per UI-SPEC.
//
// SSR seed comes from the server component above. Realtime mutates the in-memory list.

import { subscribeToComplaints } from "@parisar/api-client";
import { MessageSquareWarning, Plus, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { ComplaintCard } from "./ComplaintCard";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const STATUS_OPEN_SET = new Set(["open", "checking", "will_resolve", "need_info"]);

/**
 * @param {{
 *   initialComplaints: Array,
 *   societyId: string,
 *   role: string,
 *   userId?: string|null,
 *   loadError?: string|null,
 * }} props
 */
export function ComplaintListClient({
  initialComplaints,
  societyId,
  role,
  userId = null,
  loadError = null,
}) {
  const { t } = useTranslation("complaints");
  const router = useRouter();
  const isBoard = BOARD_ROLES.has(role);

  const [complaints, setComplaints] = useState(initialComplaints ?? []);
  const [activeTab, setActiveTab] = useState("open"); // 'open' | 'resolved'
  // Track ids of rows that just arrived via Realtime so we can animate them once.
  const [animatedIds, setAnimatedIds] = useState(new Set());

  const cleanupRef = useRef(null);

  // Realtime subscription — uses the browser client (cookie session shared).
  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = createSupabaseBrowserClient();

    cleanupRef.current = subscribeToComplaints(supabase, societyId, {
      onInsert: (row) => {
        // Member view: defensive client filter (RLS already handles this).
        if (!isBoard && row?.reporter_id !== userId) return;
        setComplaints((prev) => {
          if (prev.some((c) => c.id === row.id)) return prev;
          return [row, ...prev];
        });
        setAnimatedIds((prev) => {
          const next = new Set(prev);
          next.add(row.id);
          return next;
        });
        // Clear the animate flag after the animation duration so re-renders
        // don't keep replaying the slide-in.
        setTimeout(() => {
          setAnimatedIds((prev) => {
            if (!prev.has(row.id)) return prev;
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        }, 300);
      },
      onUpdate: (row) => {
        setComplaints((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)));
      },
      onConnected: () => {
        // Optional reconnect refetch — left for the page's manual refresh; we
        // rely on the next route navigation to re-hydrate from SSR.
      },
    });

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [societyId, isBoard, userId]);

  const visible = useMemo(() => {
    if (isBoard) {
      if (activeTab === "open") {
        return complaints.filter((c) => STATUS_OPEN_SET.has(c.status));
      }
      return complaints.filter((c) => c.status === "resolved");
    }
    return complaints;
  }, [complaints, activeTab, isBoard]);

  function handleOpenComplaint(complaint) {
    router.push(`/complaints/${complaint.id}`);
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="text-sm text-[#0E5A48] hover:underline"
            aria-label="Back to dashboard"
          >
            ← Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-[#171717] truncate">
            {isBoard ? "Complaints" : "My Complaints"}
          </h1>
        </div>
        <Link
          href="/complaints/new"
          className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg border border-[#12715A] text-[#0E5A48] text-sm font-semibold bg-white hover:bg-[#f5f7ff] transition-colors"
          aria-label={t("complaint.fileCta")}
        >
          <Plus size={16} aria-hidden="true" />
          {t("complaint.fileCta")}
        </Link>
      </header>

      {/* Tabs (board only) */}
      {isBoard ? (
        <div className="bg-white border-b border-neutral-100 px-4">
          <div className="flex gap-6 max-w-3xl mx-auto">
            <TabButton
              label="Open"
              active={activeTab === "open"}
              onClick={() => setActiveTab("open")}
            />
            <TabButton
              label="Resolved"
              active={activeTab === "resolved"}
              onClick={() => setActiveTab("resolved")}
            />
          </div>
        </div>
      ) : null}

      {/* Body */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {loadError ? (
          <ErrorState />
        ) : visible.length === 0 ? (
          <EmptyState isBoard={isBoard} activeTab={activeTab} />
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((c) => (
              <div key={c.id} className={animatedIds.has(c.id) ? "animate-slide-down" : ""}>
                <ComplaintCard complaint={c} onClick={handleOpenComplaint} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-3 text-sm transition-colors ${
        active
          ? "font-semibold text-[#0E5A48] border-b-2 border-[#12715A]"
          : "text-[#6e6e6e] border-b-2 border-transparent hover:text-[#525252]"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ isBoard, activeTab }) {
  const { t } = useTranslation("complaints");
  let heading = t("complaint.emptyHeading");
  let body = isBoard ? t("complaint.emptyBodyBoard") : t("complaint.emptyBody");
  if (isBoard && activeTab === "resolved") {
    heading = t("complaint.emptyResolved");
    body = t("complaint.emptyResolvedBody");
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
      <MessageSquareWarning size={80} className="text-[#8a8a8a]" aria-hidden="true" />
      <h2 className="font-semibold text-[#525252]" style={{ fontSize: 28, lineHeight: 1.15 }}>
        {heading}
      </h2>
      <p className="text-base text-[#6e6e6e]">{body}</p>
      {!isBoard ? (
        <Link
          href="/complaints/new"
          className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-[#0E5A48] hover:bg-[#0A4436] text-white text-base font-semibold transition-colors mt-2"
        >
          {t("complaint.fileCta")}
        </Link>
      ) : null}
    </div>
  );
}

function ErrorState() {
  const { t } = useTranslation("complaints");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center bg-white rounded-xl">
      <WifiOff size={48} className="text-[#8a8a8a]" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-[#171717]">{t("complaint.loadError")}</h2>
      <p className="text-base text-[#525252]">{t("complaint.loadErrorBody")}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors mt-2"
      >
        Try again
      </button>
    </div>
  );
}
