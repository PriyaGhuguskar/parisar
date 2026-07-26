// apps/web/components/dashboard/ProfileMenuDropdown.jsx
// Web profile menu — shadcn DropdownMenu. Two triggers per DT-08 (sidebar
// footer avatar AND dashboard heading avatar) bind to ONE menu by mounting
// this component twice (each instance is independent). Acceptable per UI-SPEC
// — duplicate triggers, single content.
//
// Sign Out is a real form posting to signOutAction (Task 1), which revokes the
// user's web push tokens BEFORE clearing the session (T-04.1-02).
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import { Bell, ChevronRight, HelpCircle, Languages, LogOut, Scale, UserCog } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOutAction } from "@/app/actions/auth";
import { LanguageSelector } from "@/components/profile/LanguageSelector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAvatarColor, initials } from "@/lib/avatar";
import { fetchFlatLabel } from "@/lib/flat-label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Phase 7 — Plan 07-04: language code → i18n label key.
// The active-locale chip on the Language row uses this to look up the
// script-native name of the currently selected language.
const LANG_LABEL_KEY = { en: "english", hi: "hindi", mr: "marathi" };

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);
// Web role-transfer route lives at apps/web/app/(protected)/dashboard/role-transfer
// (confirmed Phase 3 / Wave 0 scan) — href is /dashboard/role-transfer.
const ROLE_TRANSFER_HREF = "/dashboard/role-transfer";

/**
 * @param {object} props
 * @param {string} props.userId
 * @param {string} props.societyId
 * @param {string} props.role
 * @param {string} props.fullName
 * @param {string|undefined} props.flatLabel - if provided in JWT/SSR, pass through; else this component fetches
 * @param {React.ReactNode} [props.trigger] - custom trigger element; defaults to a small avatar button
 */
export function ProfileMenuDropdown({
  userId,
  societyId,
  role,
  fullName,
  flatLabel: flatLabelProp,
  trigger,
}) {
  const isAdmin = ADMIN_ROLES.has(role);
  const avatarColor = getAvatarColor(fullName);
  const [flatLabel, setFlatLabel] = useState(flatLabelProp ?? "—");
  // Phase 7 — Plan 07-04: language row + selector.
  // Plan 07-06 retrofit: expand to ['dashboard','moderation'] so the Grievance
  // Officer + About rows can read namespace-prefixed keys.
  const { t, i18n } = useTranslation(["dashboard", "moderation"]);
  const [langOpen, setLangOpen] = useState(false);
  const activeLangLabel = t(`language.${LANG_LABEL_KEY[i18n.language] ?? "english"}`);

  useEffect(() => {
    if (flatLabelProp) {
      setFlatLabel(flatLabelProp);
      return;
    }
    if (!userId || !societyId) return;
    let cancelled = false;
    fetchFlatLabel(createSupabaseBrowserClient(), userId, societyId).then((label) => {
      if (!cancelled) setFlatLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, societyId, flatLabelProp]);

  const defaultTrigger = (
    <button
      type="button"
      aria-label={t("header.openProfile")}
      className="pk-press inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ring-1 ring-[var(--color-neutral-200)] transition-shadow hover:ring-[var(--color-brand-500)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
      style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
      data-testid="profile-menu-trigger"
    >
      {initials(fullName)}
    </button>
  );

  return (
    <DropdownMenu>
      {/* base-ui composes via `render`, not Radix's `asChild`. */}
      <DropdownMenuTrigger render={trigger ?? defaultTrigger} />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex items-center gap-2">
            <div
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
              style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
            >
              {initials(fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold tracking-[-0.01em] text-[var(--color-neutral-900)]">
                {fullName}
              </div>
              <div className="truncate text-[13px] text-[var(--color-neutral-400)]">
                {flatLabel} · {t(`role.${role}`, { defaultValue: role })}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {isAdmin ? (
          <DropdownMenuItem render={<Link href={ROLE_TRANSFER_HREF} />}>
            <UserCog className="mr-2 h-4 w-4" aria-hidden />
            <span>{t("profile.roleTransfer")}</span>
          </DropdownMenuItem>
        ) : null}

        {/* DT-02 (Phase 6) — admin-only Grievance Officer settings (D-06).
            Inserted between role-transfer and notification-settings; existing rows
            keep their key/order (UI-SPEC Screen 9a ProfileMenu activation note). */}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/settings/grievance-officer" />}>
            <Scale className="mr-2 h-4 w-4" aria-hidden />
            <span>{t("moderation:grievance.menuRow")}</span>
          </DropdownMenuItem>
        ) : null}

        {/* DT-02 (Phase 5) — Notification settings activated: live navigation to
            /settings/notifications. No longer disabled; the Phase 5 pill is gone. */}
        <DropdownMenuItem render={<Link href="/settings/notifications" />}>
          <Bell className="mr-2 h-4 w-4" aria-hidden />
          <span>{t("profile.notificationSettings")}</span>
        </DropdownMenuItem>

        {/* DT-02 (Phase 6) — all-roles About & Help (COMM-05 read-only officer). */}
        <DropdownMenuItem render={<Link href="/about" />}>
          <HelpCircle className="mr-2 h-4 w-4" aria-hidden />
          <span>{t("moderation:about.title")}</span>
        </DropdownMenuItem>

        {/* Phase 7 — Plan 07-04 (L10N-04): Language row above Sign Out.
            onSelect.preventDefault() keeps the dropdown from closing before the
            Dialog opens; the Dialog has its own Portal so nesting is safe. */}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setLangOpen(true);
          }}
          className="flex items-center gap-3"
          aria-label={t("profile.language")}
        >
          <Languages size={20} className="text-neutral-900" aria-hidden />
          <span className="flex-1">{t("profile.language")}</span>
          <span className="text-sm text-neutral-600">{activeLangLabel}</span>
          <ChevronRight size={16} className="text-[#0E5A48]" aria-hidden />
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Sign Out — POST to server action so the cookie clear lands properly */}
        <DropdownMenuItem
          render={<form action={signOutAction} />}
          className="text-[#c81e1e] focus:text-[#c81e1e]"
        >
          <button type="submit" className="w-full flex items-center text-left">
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            <span>{t("profile.signOut")}</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
      {/* Dialog has its own Portal so it stacks above the (now-closed) dropdown. */}
      <LanguageSelector open={langOpen} onOpenChange={setLangOpen} />
    </DropdownMenu>
  );
}
