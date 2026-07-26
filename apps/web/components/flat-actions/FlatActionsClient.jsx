"use client";

// FlatActionsClient — CSR wrapper around the SSR-fetched flat-action list (web).
// UI-SPEC Screen 2 (member) + Screen 3 (board).
//
// Role-aware:
//   - MEMBER: shows ONLY their own flat (RLS scopes server-side — D-05). A Lock +
//     "Actions for your flat · {{flat}}" privacy subtitle, NO flat picker. Cards
//     never show a target-flat pill (always their own flat). Realtime scoped to flatId.
//   - BOARD/ADMIN: a FlatPicker filter (allowAll), All/Fines tabs, cards WITH the
//     target-flat pill. Admin (secretary/co_secretary) additionally sees the
//     "Issue Action" header button. Realtime scoped to the society.
//
// listFlatActions returns exactly what RLS allows — the client never filters by flat.

import { subscribeFlatActions } from "@parisar/api-client";
import { formatDistanceToNow } from "date-fns";
import { Lock, Plus, ShieldCheck, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { OwnerChip } from "../complaints/OwnerChip";
import { FineStatusBadge } from "./FineStatusBadge";
import { FlatActionKindBadge, KIND_ACCENT } from "./FlatActionKindBadge";
import { FlatPicker, formatFlatLabel } from "./FlatPicker";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

function safeAge(iso) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   initialActions: Array,
 *   societyId: string,
 *   role: string,
 *   memberFlatId?: string|null,
 *   memberFlatLabel?: string|null,
 *   flats?: Array,
 *   loadError?: string|null,
 * }} props
 */
export function FlatActionsClient({
  initialActions,
  societyId,
  role,
  memberFlatId = null,
  memberFlatLabel = null,
  flats = [],
  loadError = null,
}) {
  const { t } = useTranslation("flat-actions");
  const router = useRouter();
  const isBoard = BOARD_ROLES.has(role);
  const isAdmin = ADMIN_ROLES.has(role);

  const [actions, setActions] = useState(initialActions ?? []);
  const [filterFlatId, setFilterFlatId] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'fines'
  const [animatedIds, setAnimatedIds] = useState(new Set());
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = createSupabaseBrowserClient();
    cleanupRef.current = subscribeFlatActions(supabase, {
      societyId,
      flatId: isBoard ? null : memberFlatId,
      onInsert: (row) => {
        setActions((prev) => {
          if (prev.some((a) => a.id === row.id)) return prev;
          return [row, ...prev];
        });
        setAnimatedIds((prev) => new Set(prev).add(row.id));
        setTimeout(() => {
          setAnimatedIds((prev) => {
            if (!prev.has(row.id)) return prev;
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        }, 300);
      },
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [societyId, isBoard, memberFlatId]);

  const visible = useMemo(() => {
    let list = actions;
    if (isBoard && filterFlatId) {
      list = list.filter((a) => a.flat_id === filterFlatId);
    }
    if (isBoard && activeTab === "fines") {
      list = list.filter((a) => a.kind === "fine");
    }
    return list;
  }, [actions, isBoard, filterFlatId, activeTab]);

  function openAction(action) {
    router.push(`/flat-actions/${action.id}`);
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
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
            {isBoard ? t("flatAction.memberTitle") : t("flatAction.memberTitle")}
          </h1>
        </div>
        {isAdmin ? (
          <Link
            href="/flat-actions/new"
            className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-[#0E5A48] text-white text-sm font-semibold hover:bg-[#0A4436] transition-colors"
            aria-label={t("flatAction.issueCta")}
          >
            <Plus size={16} aria-hidden="true" />
            {t("flatAction.issueCta")}
          </Link>
        ) : null}
      </header>

      {/* Member privacy subtitle (D-05) — Lock + "Actions for your flat · {{flat}}" */}
      {!isBoard ? (
        <div className="bg-white border-b border-neutral-100 px-4 py-2">
          <div className="max-w-3xl mx-auto flex items-center gap-1">
            <Lock size={14} color="#6e6e6e" aria-hidden="true" />
            <span className="text-sm text-[#525252]">
              {t("flatAction.memberSubtitle").replace("{{flat}}", memberFlatLabel || "—")}
            </span>
          </div>
        </div>
      ) : null}

      {/* Board: flat filter + All/Fines tabs */}
      {isBoard ? (
        <div className="bg-white border-b border-neutral-100 px-4 py-3">
          <div className="max-w-3xl mx-auto flex flex-col gap-3">
            <FlatPicker
              flats={flats}
              selectedId={filterFlatId}
              onSelect={(flat) => setFilterFlatId(flat?.id ?? null)}
              label={t("flatAction.filterFlat")}
              allowAll
              id="board-flat-filter"
            />
            <div className="flex gap-6">
              <TabButton
                label="All"
                active={activeTab === "all"}
                onClick={() => setActiveTab("all")}
              />
              <TabButton
                label={t("flatAction.kindFine")}
                active={activeTab === "fines"}
                onClick={() => setActiveTab("fines")}
              />
            </div>
          </div>
        </div>
      ) : null}

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loadError ? (
          <ErrorState />
        ) : visible.length === 0 ? (
          <EmptyState isBoard={isBoard} />
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((a) => (
              <div key={a.id} className={animatedIds.has(a.id) ? "animate-slide-down" : ""}>
                <FlatActionCard action={a} showFlatPill={isBoard} onClick={openAction} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlatActionCard — mirrors ComplaintCard token (left accent stripe by kind)
// ---------------------------------------------------------------------------

function FlatActionCard({ action, showFlatPill, onClick }) {
  const { t } = useTranslation("flat-actions");
  const accent = KIND_ACCENT[action?.kind] ?? "#12715A";
  const issuerName = action?.issuer?.full_name ?? "—";
  const issuerFlat = formatFlatLabel(action?.issuer_flat);
  const issuedBy = t("flatAction.issuedBy")
    .replace("{{name}}", issuerName)
    .replace("{{flat}}", issuerFlat);
  const targetFlat = formatFlatLabel(action?.flat);
  const age = safeAge(action?.created_at);
  const isFine = action?.kind === "fine";

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(action);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: card pattern with div + role
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(action)}
      onKeyDown={handleKeyDown}
      aria-label={`Flat action: ${(action?.body ?? "").slice(0, 60)}`}
      className="flex gap-2 bg-white rounded-xl shadow-sm border border-neutral-200 p-4 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
    >
      <span
        aria-hidden="true"
        className="shrink-0 rounded-l-xl"
        style={{
          width: 4,
          alignSelf: "stretch",
          backgroundColor: accent,
          marginLeft: -16,
          marginTop: -16,
          marginBottom: -16,
        }}
      />
      <div className="flex-1 flex flex-col gap-2 min-w-0 pl-2">
        <div className="flex items-start gap-2 flex-wrap">
          <FlatActionKindBadge kind={action?.kind} />
          {showFlatPill ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100 text-[#525252] text-sm">
              {targetFlat}
            </span>
          ) : null}
          {age ? <span className="text-sm text-[#6e6e6e] ml-auto shrink-0">{age}</span> : null}
        </div>

        <p className="text-base text-[#171717] line-clamp-2 break-words">{action?.body ?? ""}</p>

        {isFine ? (
          <div className="flex items-center gap-2 flex-wrap">
            <FineStatusBadge fineStatus={action?.fine_status} dueDate={action?.due_date} />
            <span className="text-sm text-[#171717]">
              {t("flatAction.amountValue").replace("{{amount}}", String(action?.amount ?? 0))}
            </span>
          </div>
        ) : null}

        <OwnerChip ownerName={issuerName} ownerFlat={issuerFlat} labelText={issuedBy} />
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-2 text-sm transition-colors ${
        active
          ? "font-semibold text-[#0E5A48] border-b-2 border-[#12715A]"
          : "text-[#6e6e6e] border-b-2 border-transparent hover:text-[#525252]"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ isBoard }) {
  const { t } = useTranslation("flat-actions");
  const heading = isBoard ? t("flatAction.emptyHeadingBoard") : t("flatAction.emptyHeading");
  const body = isBoard ? t("flatAction.emptyBodyBoard") : t("flatAction.emptyBody");
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
      <ShieldCheck size={80} className="text-[#8a8a8a]" aria-hidden="true" />
      <h2 className="font-semibold text-[#525252]" style={{ fontSize: 28, lineHeight: 1.15 }}>
        {heading}
      </h2>
      <p className="text-base text-[#6e6e6e]">{body}</p>
      {isBoard ? (
        <Link
          href="/flat-actions/new"
          className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-[#0E5A48] hover:bg-[#0A4436] text-white text-base font-semibold transition-colors mt-2"
        >
          {t("flatAction.issueCta")}
        </Link>
      ) : null}
    </div>
  );
}

function ErrorState() {
  const { t } = useTranslation("flat-actions");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center bg-white rounded-xl">
      <WifiOff size={48} className="text-[#8a8a8a]" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-[#171717]">{t("flatAction.loadError")}</h2>
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
