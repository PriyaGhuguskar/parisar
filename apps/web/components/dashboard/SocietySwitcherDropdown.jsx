// apps/web/components/dashboard/SocietySwitcherDropdown.jsx
// Web mirror of mobile SocietySwitcherSheet — shadcn DropdownMenu instead of Modal.
// DT-05: hide chevron entirely when memberships.length === 1.
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * @param {object} props
 * @param {Array<{society_id: string, society_name: string}>} props.memberships
 * @param {string|null} props.activeSocietyId
 * @param {(societyId: string) => void} [props.onSelect]
 */
export function SocietySwitcherDropdown({ memberships = [], activeSocietyId, onSelect }) {
  const { t } = useTranslation("dashboard");
  const active = memberships.find((m) => m.society_id === activeSocietyId);
  const activeName = active?.society_name ?? memberships[0]?.society_name ?? "Society";

  if (memberships.length <= 1) {
    // Static text — no interactive chrome. DT-05.
    return (
      <span className="text-sm text-neutral-700" data-testid="society-static">
        {activeName}
      </span>
    );
  }

  return (
    <DropdownMenu>
      {/* base-ui composes via `render`, not Radix's `asChild` (which would leak
          to the DOM and nest a button inside the trigger's own button). */}
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-neutral-900 hover:text-[#0E5A48]"
            aria-label={t("switcher.title")}
          />
        }
      >
        <span>{activeName}</span>
        <ChevronDown size={16} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {memberships.map((m) => {
          const isActive = m.society_id === activeSocietyId;
          return (
            <DropdownMenuItem
              key={m.society_id}
              onSelect={() => {
                if (!isActive) onSelect?.(m.society_id);
              }}
              aria-current={isActive ? "true" : undefined}
            >
              <Check
                className={`mr-2 h-4 w-4 ${isActive ? "opacity-100" : "opacity-0"}`}
                aria-hidden
              />
              <span>{m.society_name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
