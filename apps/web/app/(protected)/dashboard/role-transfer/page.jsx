"use client";

/**
 * Secretary Role Transfer page — /dashboard/role-transfer (Plan 03-10).
 * Allows Secretary to transfer their role to an eligible member (co_secretary or board_member).
 * Typed-name confirmation uses Secretary's OWN name (not the recipient's).
 *
 * Pattern mirrors apps/mobile/app/(protected)/role-transfer.jsx (Plan 03-08).
 */

import { transferSecretaryRole } from "@parisar/api-client";
import { AlertOctagon, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  { bg: "#DCEFE6", text: "#12715A" },
  { bg: "#f0fdf4", text: "#16a34a" },
  { bg: "#fef3c7", text: "#d97706" },
  { bg: "#fdf2f8", text: "#db2777" },
];

function getAvatarColor(name = "") {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// EligibleMemberRow — one selectable row in the radio list
// ---------------------------------------------------------------------------
function EligibleMemberRow({ membership, isSelected, onSelect }) {
  const name = membership?.profiles?.full_name ?? "Member";
  const flatNum = membership?.flats?.number ?? "";
  const wing = membership?.flats?.wings?.name ?? "";
  const flatLabel = [wing, flatNum].filter(Boolean).join("-");
  const role = membership?.role ?? "board_member";
  const colors = getAvatarColor(name);

  const roleLabel = role === "co_secretary" ? "Co-Secretary" : "Board Member";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-colors text-left ${
        isSelected
          ? "bg-[var(--color-brand-50)] border border-[var(--color-brand-500)]"
          : "bg-white border border-[var(--color-neutral-200)] hover:bg-[var(--color-neutral-50)]"
      }`}
    >
      {/* Radio indicator */}
      <div
        className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          isSelected
            ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]"
            : "border-[var(--color-neutral-200)]"
        }`}
      >
        {isSelected && <div className="size-2 rounded-full bg-white" />}
      </div>

      {/* Avatar */}
      <Avatar className="size-9 shrink-0" style={{ backgroundColor: colors.bg }}>
        <AvatarFallback style={{ backgroundColor: colors.bg, color: colors.text }}>
          {initials(name)}
        </AvatarFallback>
      </Avatar>

      {/* Name + flat + role */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-[var(--color-neutral-900)] truncate">{name}</p>
        <p className="text-sm text-[var(--color-neutral-600)]">
          {[flatLabel, roleLabel].filter(Boolean).join(" · ")}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// RoleTransferPage
// ---------------------------------------------------------------------------
export default function RoleTransferPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();

  const [eligible, setEligible] = useState([]);
  const [secretaryName, setSecretaryName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [societyId, setSocietyId] = useState(null);

  const supabase = createSupabaseBrowserClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { societyId: sid } = await resolveActiveSociety(supabase, user);
      setSocietyId(sid);
      const currentUserId = user?.id ?? null;

      // Secretary's own name for dialog confirmation
      if (currentUserId) {
        const profileRes = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", currentUserId)
          .maybeSingle();
        if (profileRes.data?.full_name) {
          setSecretaryName(profileRes.data.full_name);
        }
      }

      if (!sid) {
        setEligible([]);
        setLoading(false);
        return;
      }

      // Fetch eligible members: co_secretary + board_member, active, excluding self
      const { data, error: fetchErr } = await supabase
        .from("society_memberships")
        .select(
          "id, user_id, role, flat_id, profiles:user_id(full_name), flats:flat_id(number, wings:wing_id(name))",
        )
        .eq("society_id", sid)
        .eq("status", "active")
        .in("role", ["co_secretary", "board_member"])
        .neq("user_id", currentUserId);

      if (fetchErr) throw fetchErr;
      setEligible(data ?? []);
    } catch (err) {
      setError(err?.message ?? "Failed to load eligible members");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTransferConfirm() {
    if (!selectedMember) return;
    setIsTransferring(true);
    try {
      await transferSecretaryRole(supabase, selectedMember.user_id);
      setShowDialog(false);
      // transferSecretaryRole calls refreshSession() internally (Plan 02)
      router.replace("/dashboard?transferSuccess=1");
    } catch (err) {
      setError(err?.message ?? "Transfer failed");
      setIsTransferring(false);
    }
  }

  const selectedName = selectedMember?.profiles?.full_name ?? "";

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Header */}
      <header className="bg-white border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-[var(--color-neutral-600)] hover:text-[var(--color-neutral-900)] transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("roleTransfer.heading")}
        </h1>
      </header>

      <main className="max-w-[480px] mx-auto px-4 py-6">
        {/* Warning banner */}
        <div className="flex items-start gap-3 rounded-xl border-[1.5px] border-[var(--color-danger)] bg-[#fff5f5] p-4 mb-6">
          <AlertOctagon
            size={20}
            className="text-[var(--color-danger)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-base text-[var(--color-neutral-700)]">{t("roleTransfer.warning")}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-white rounded-xl animate-pulse" aria-hidden="true" />
            ))}
          </div>
        )}

        {/* Eligible member list */}
        {!loading && eligible.length > 0 && (
          <>
            <h2 className="text-xl font-semibold text-[var(--color-neutral-900)] mb-4">
              {t("roleTransfer.selectLabel")}
            </h2>
            <div className="flex flex-col gap-3 mb-8">
              {eligible.map((membership) => (
                <EligibleMemberRow
                  key={membership.id}
                  membership={membership}
                  isSelected={selectedMember?.id === membership.id}
                  onSelect={() => setSelectedMember(membership)}
                />
              ))}
            </div>

            {/* Transfer button */}
            <button
              type="button"
              disabled={!selectedMember}
              onClick={() => setShowDialog(true)}
              className="h-12 w-full rounded-xl bg-[var(--color-danger)] text-white text-base font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {t("roleTransfer.confirmCta")}
            </button>
          </>
        )}

        {/* No eligible members */}
        {!loading && eligible.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-base text-[var(--color-neutral-600)] text-center">
              No eligible members found. Only Co-Secretary and Board Members can become Secretary.
            </p>
          </div>
        )}
      </main>

      {/* Role transfer DestructiveConfirmDialog — Secretary types their OWN name */}
      <DestructiveConfirmDialog
        open={showDialog}
        onClose={() => !isTransferring && setShowDialog(false)}
        title={t("roleTransfer.confirmTitle", { name: selectedName })}
        body={t("roleTransfer.confirmBody", { name: selectedName })}
        confirmMatchText={secretaryName}
        confirmMatchLabel={t("roleTransfer.typedSelfLabel")}
        confirmButtonLabel={t("roleTransfer.confirmCta")}
        cancelLabel={t("roleTransfer.cancel")}
        mismatchError="Name does not match. Type your own name to confirm."
        onConfirm={handleTransferConfirm}
        isLoading={isTransferring}
      />
    </div>
  );
}
