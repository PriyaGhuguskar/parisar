"use client";

// WingCard — one wing in the society map. Collapsed it shows the wing name with
// flat + resident counts; expanded it lists every flat and who lives there.
// Resident phone numbers reveal through PhonePrivacyChip, the same audited
// reveal_phone path the directory uses — no raw numbers are rendered up front.

import { ChevronDown, DoorOpen, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PhonePrivacyChip } from "@/components/directory/PhonePrivacyChip";
import { SurfaceCard } from "@/components/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColor, initials } from "@/lib/avatar";

function CountChip({ icon: Icon, value, label }) {
  // Visible "3 flats" text is itself the accessible label — no aria-label needed.
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-neutral-600)]">
      <Icon
        size={15}
        strokeWidth={2}
        className="text-[var(--color-neutral-400)]"
        aria-hidden="true"
      />
      {value} {label}
    </span>
  );
}

export function WingCard({ wing, defaultOpen = false }) {
  const { t } = useTranslation("auth");
  const [open, setOpen] = useState(defaultOpen);

  const residentCount = wing.flats.reduce((n, f) => n + f.residents.length, 0);

  return (
    <SurfaceCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--color-neutral-50)]"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[16px] font-extrabold tracking-[-0.01em] text-[var(--color-neutral-900)]">
            {wing.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <CountChip icon={DoorOpen} value={wing.flats.length} label={t("profile.flatsSuffix")} />
            <CountChip icon={Users} value={residentCount} label={t("profile.peopleSuffix")} />
          </span>
        </div>
        <ChevronDown
          size={20}
          strokeWidth={2.2}
          aria-hidden="true"
          className={`shrink-0 text-[var(--color-neutral-400)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="border-t border-[var(--color-neutral-100)]">
          {wing.flats.length === 0 ? (
            <p className="px-5 py-5 text-[14px] text-[var(--color-neutral-500)]">
              {t("profile.noFlats")}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-neutral-100)]">
              {wing.flats.map((flat) => (
                <li key={flat.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded-lg bg-[var(--color-neutral-100)] px-2.5 py-1 text-[13px] font-bold text-[var(--color-neutral-700)]">
                      {flat.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      {flat.residents.length === 0 ? (
                        <p className="py-1 text-[13px] italic text-[var(--color-neutral-400)]">
                          {t("profile.vacant")}
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {flat.residents.map((r) => (
                            <li key={r.userId} className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2.5">
                                <Avatar className="h-8 w-8 text-[12px]">
                                  <AvatarFallback
                                    style={{
                                      backgroundColor: getAvatarColor(r.name).bg,
                                      color: getAvatarColor(r.name).text,
                                    }}
                                  >
                                    {initials(r.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate text-[14px] font-semibold text-[var(--color-neutral-900)]">
                                  {r.name}
                                </span>
                              </span>
                              <PhonePrivacyChip targetUserId={r.userId} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </SurfaceCard>
  );
}
