"use client";

// SocietyOverview — the Secretary's live view of the whole society: the four
// headline counts, then every wing (expandable to flats + residents), with an
// "Add wing" action. Shown only to secretary / co-secretary (gated by the page).

import { Building2, DoorOpen, KeyRound, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, StatCard, SurfaceCard } from "@/components/kit";
import { AddWingDialog } from "./AddWingDialog";
import { GuardsSection } from "./GuardsSection";
import { WingCard } from "./WingCard";

export function SocietyOverview({ society, structure }) {
  const { t } = useTranslation("auth");
  const [adding, setAdding] = useState(false);

  const { counts, wings } = structure;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("profile.society")}
          </h2>
          <p className="mt-0.5 text-[14px] text-[var(--color-neutral-600)]">
            {t("profile.societyLead")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 sm:self-auto"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          {t("profile.addWing")}
        </button>
      </div>

      {/* Society identity */}
      <SurfaceCard className="p-5">
        <p className="text-[18px] font-extrabold tracking-[-0.01em] text-[var(--color-neutral-900)]">
          {society.name}
        </p>
        {society.address ? (
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-neutral-600)]">
            {society.address}
          </p>
        ) : null}
        {society.code ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-50)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-brand-700)]">
            <KeyRound size={14} strokeWidth={2.2} aria-hidden="true" />
            {t("profile.code")}
            <span className="font-mono font-bold tracking-wider">{society.code}</span>
          </p>
        ) : null}
      </SurfaceCard>

      {/* Headline counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Users}
          label={t("profile.statResidents")}
          value={counts.residents}
          tone="brand"
        />
        <StatCard
          icon={Building2}
          label={t("profile.statWings")}
          value={counts.wings}
          tone="neutral"
        />
        <StatCard
          icon={DoorOpen}
          label={t("profile.statFlats")}
          value={counts.flats}
          tone="neutral"
        />
        <StatCard
          icon={Users}
          label={t("profile.statOccupied")}
          value={`${counts.occupied}/${counts.flats}`}
          tone="brand"
        />
      </div>

      {/* Wings */}
      {wings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("profile.noWings")}
          description={t("profile.noWingsLead")}
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              {t("profile.addWing")}
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {wings.map((wing, i) => (
            <WingCard key={wing.id} wing={wing} defaultOpen={wings.length === 1 || i === 0} />
          ))}
        </div>
      )}

      {adding ? <AddWingDialog societyId={society.id} onClose={() => setAdding(false)} /> : null}

      {/* Gate guards */}
      <div className="mt-4 border-t border-[var(--color-neutral-200)] pt-6">
        <GuardsSection societyId={society.id} />
      </div>
    </section>
  );
}
