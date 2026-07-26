"use client";

/**
 * Member detail page — /dashboard/directory/[id] (Plan 03-10).
 * Shows member profile + DPDP removal flow via DestructiveConfirmDialog.
 *
 * Pattern mirrors apps/mobile/app/(protected)/member-detail.jsx (Plan 03-08).
 */

import { removeMember } from "@parisar/api-client";
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhonePrivacyChip } from "@/components/directory/PhonePrivacyChip";
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

// PAR-004: maskPhone removed — phone is shown via PhonePrivacyChip (audited reveal RPC).

// ---------------------------------------------------------------------------
// MemberDetailPage
// ---------------------------------------------------------------------------
export default function MemberDetailPage({ params }) {
  const { t } = useTranslation("auth");
  const membershipId = params?.id ?? null;
  const router = useRouter();

  const [membership, setMembership] = useState(null);
  const [familyCount, setFamilyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [successToast, setSuccessToast] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("member");

  const supabase = createSupabaseBrowserClient();

  const load = useCallback(async () => {
    if (!membershipId) return;
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const meta = user?.app_metadata ?? user?.user_metadata ?? {};
      setCurrentUserRole(meta.role ?? "member");

      const [memberRes, familyRes] = await Promise.all([
        supabase
          .from("society_memberships")
          .select(
            "id, user_id, flat_id, joined_at, residency, status, profiles:user_id(full_name), flats:flat_id(number, wings:wing_id(name))",
          )
          .eq("id", membershipId)
          .maybeSingle(),
        supabase
          .from("family_members")
          .select("id", { count: "exact", head: true })
          .eq("membership_id", membershipId),
      ]);

      if (memberRes.error) throw memberRes.error;
      setMembership(memberRes.data);
      setFamilyCount(familyRes.count ?? 0);
    } catch (err) {
      setError(err?.message ?? "Failed to load member");
    } finally {
      setLoading(false);
    }
  }, [membershipId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = currentUserRole === "secretary" || currentUserRole === "co_secretary";

  async function handleRemoveConfirm() {
    setIsRemoving(true);
    try {
      await removeMember(supabase, membershipId);
      setShowRemoveDialog(false);
      setSuccessToast(true);
      setTimeout(() => {
        router.push("/dashboard/directory");
      }, 1200);
    } catch (err) {
      setError(err?.message ?? "Remove failed");
      setIsRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)]">
        <header className="bg-white border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center gap-3">
          <Link
            href="/dashboard/directory"
            className="text-[var(--color-neutral-600)] hover:text-[var(--color-neutral-900)]"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Link>
        </header>
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="h-48 bg-white rounded-2xl animate-pulse" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (error || !membership) {
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)]">
        <header className="bg-white border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard/directory" className="text-[var(--color-neutral-600)]">
            <ArrowLeft size={20} />
          </Link>
        </header>
        <div className="max-w-lg mx-auto px-4 py-8 flex flex-col items-center gap-4">
          <Users size={48} className="text-[var(--color-neutral-200)]" aria-hidden="true" />
          <p className="text-base text-[var(--color-neutral-600)] text-center">
            {error ?? "Member not found."}
          </p>
        </div>
      </div>
    );
  }

  const name = membership?.profiles?.full_name ?? "Member";
  const flatNum = membership?.flats?.number ?? "";
  const wing = membership?.flats?.wings?.name ?? "";
  const flatLabel = [wing, flatNum].filter(Boolean).join("-");
  const residency = membership?.residency ?? membership?.residency_type ?? null;
  const joinedAt = membership?.joined_at
    ? new Date(membership.joined_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const colors = getAvatarColor(name);

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Header */}
      <header className="bg-white border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center gap-3">
        <Link
          href="/dashboard/directory"
          className="flex items-center gap-1 text-[var(--color-neutral-600)] hover:text-[var(--color-neutral-900)] transition-colors"
          aria-label="Back to directory"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--color-neutral-900)] truncate">{name}</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Profile card */}
        <div className="bg-white rounded-2xl p-6">
          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-3 mb-6">
            <Avatar className="size-16" style={{ backgroundColor: colors.bg }}>
              <AvatarFallback
                style={{ backgroundColor: colors.bg, color: colors.text }}
                className="text-xl font-semibold"
              >
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-[var(--color-neutral-900)]">{name}</h2>
              {flatLabel ? (
                <p className="text-sm text-[var(--color-neutral-600)] mt-1">{flatLabel}</p>
              ) : null}
            </div>
          </div>

          {/* Detail rows */}
          <dl className="divide-y divide-[var(--color-neutral-100)]">
            {residency && (
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-[var(--color-neutral-600)]">Residency</dt>
                <dd>
                  <Badge
                    variant="secondary"
                    className="bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] text-xs"
                  >
                    {residency === "tenant" ? t("directory.tenant") : t("directory.owner")}
                  </Badge>
                </dd>
              </div>
            )}

            <div className="flex items-center justify-between py-3">
              <dt className="text-sm text-[var(--color-neutral-600)]">Phone</dt>
              <dd>
                <PhonePrivacyChip targetUserId={membership?.user_id} />
              </dd>
            </div>

            {joinedAt && (
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-[var(--color-neutral-600)]">Joined</dt>
                <dd className="text-sm text-[var(--color-neutral-900)]">{joinedAt}</dd>
              </div>
            )}

            <div className="flex items-center justify-between py-3">
              <dt className="text-sm text-[var(--color-neutral-600)]">Family members</dt>
              <dd className="text-sm text-[var(--color-neutral-900)]">{familyCount}</dd>
            </div>
          </dl>

          {/* DPDP Remove action — only Secretary / Co-Secretary */}
          {isAdmin && (
            <div className="mt-6 pt-4 border-t border-[var(--color-neutral-100)]">
              <button
                type="button"
                onClick={() => setShowRemoveDialog(true)}
                className="text-base font-semibold text-[var(--color-danger)] hover:underline"
              >
                {t("directory.removeMember")}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Success toast */}
      {successToast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-emerald-500 px-4 py-3 text-white text-sm font-medium shadow-lg"
        >
          {t("removal.success")}
        </div>
      )}

      {/* DPDP Remove dialog */}
      <DestructiveConfirmDialog
        open={showRemoveDialog}
        onClose={() => !isRemoving && setShowRemoveDialog(false)}
        title={t("removal.title")}
        body={t("removal.warningBody", { name, flat: flatLabel })}
        confirmMatchText={name}
        confirmMatchLabel={t("removal.typedNameLabel")}
        confirmButtonLabel={t("removal.confirm", { name })}
        cancelLabel={t("removal.cancel")}
        mismatchError={t("removal.nameMismatch", { name })}
        onConfirm={handleRemoveConfirm}
        isLoading={isRemoving}
      />
    </div>
  );
}
