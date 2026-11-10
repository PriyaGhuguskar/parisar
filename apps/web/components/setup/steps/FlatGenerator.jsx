"use client";

// Bulk flat generation. The shared FloorFlats builder gives each floor a From-To
// range (Floor 2: 201-204); the shared attributes apply to every generated flat.
// Target one wing or every wing (same layout, as StructureSetup offered). For each
// floor the flats go in one all-or-nothing setup_bulk_create_flats call; a floor
// that does not exist yet in a wing is created first. Numbers a wing already has
// are skipped and reported, never sent.

import { setupBulkCreateFlats, setupUpsertFloor } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CONTROL_CLASS, FormField, Notice, SurfaceCard } from "@/components/kit";
import { FloorFlats } from "@/components/structure/FloorFlats";
import { Button } from "@/components/ui/button";
import { buildFlats, initialFloors, makeFloor } from "@/lib/flats/floors";
import { cn } from "@/lib/utils";
import { callRpc } from "../lib/rpc";
import {
  flatsInWing,
  planBulkFlats,
  suggestedRange,
  validateFlatAttributes,
} from "../lib/setupModel";
import { EMPTY_ATTRS, FlatFields } from "./FlatFields";

export const ALL_WINGS = "__all__";

/** FloorFlats rows for the target: its floors, with ranges for floors that have no flats yet. */
export function seedFloors(wings) {
  const levels = new Map();
  for (const wing of wings) {
    const taken = new Set(flatsInWing(wing).map((f) => f.floor_id));
    for (const floor of wing.floors ?? []) {
      if (levels.has(floor.number)) continue;
      const range = taken.has(floor.id) ? { from: "", to: "" } : suggestedRange(floor);
      levels.set(floor.number, makeFloor(floor.number, range.from, range.to));
    }
  }
  const rows = [...levels.values()].sort((a, b) => a.level - b.level);
  return rows.length ? rows : initialFloors();
}

export function FlatGenerator({ wings, societyId, reload, errorText, draft, onDraftChange }) {
  const { t } = useTranslation("setup-wizard");
  const [target, setTarget] = useState(draft?.target ?? wings[0]?.id ?? "");
  const targets = target === ALL_WINGS ? wings : wings.filter((w) => w.id === target);
  const [floors, setFloors] = useState(() =>
    Array.isArray(draft?.floors) && draft.floors.length ? draft.floors : seedFloors(targets),
  );
  const [attrs, setAttrs] = useState(() => ({ ...EMPTY_ATTRS, ...(draft?.attrs ?? {}) }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const { perFloor, anyInvalid } = buildFlats(floors);
  const plan = planBulkFlats(perFloor, targets, attrs);

  function change(next) {
    const merged = { target, floors, attrs, ...next };
    if (next.floors) setFloors(next.floors);
    if (next.attrs) setAttrs(next.attrs);
    setMessage(null);
    onDraftChange?.(merged);
  }

  function pickTarget(value) {
    setTarget(value);
    const nextTargets = value === ALL_WINGS ? wings : wings.filter((w) => w.id === value);
    const seeded = seedFloors(nextTargets);
    setFloors(seeded);
    setMessage(null);
    onDraftChange?.({ target: value, floors: seeded, attrs });
  }

  async function generate() {
    const attrErrors = validateFlatAttributes(attrs);
    setErrors(attrErrors);
    if (Object.keys(attrErrors).length) return;
    if (anyInvalid) {
      setMessage({ tone: "danger", text: t("flats.errors.rangeInvalid") });
      return;
    }
    if (!plan.total) {
      setMessage({
        tone: "warning",
        text: plan.skipped ? t("flats.allExist") : t("flats.errors.noneToCreate"),
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    let created = 0;
    let failure = null;
    for (const task of plan.tasks) {
      let floorId = task.floorId;
      if (!floorId) {
        const floor = await callRpc((sb) =>
          setupUpsertFloor(sb, {
            societyId,
            wingId: task.wingId,
            number: task.floorNumber,
            flatCount: task.flats.length,
          }),
        );
        if (floor.error) {
          failure = { code: floor.error, task };
          break;
        }
        floorId = floor.data.id;
      }
      const res = await callRpc((sb) =>
        setupBulkCreateFlats(sb, { societyId, floorId, flats: task.flats }),
      );
      if (res.error) {
        failure = { code: res.error, task };
        break;
      }
      created += res.data?.created ?? task.flats.length;
    }
    await reload();
    setBusy(false);
    if (failure) {
      setMessage({
        tone: "danger",
        text: t("flats.generateFailed", {
          created,
          wing: failure.task.wingName,
          floor: failure.task.floorNumber,
          reason: errorText(failure.code),
        }),
      });
      return;
    }
    setMessage({ tone: "success", text: t("flats.generated", { created, skipped: plan.skipped }) });
  }

  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="type-h3 text-foreground">{t("flats.generatorTitle")}</h2>
        <p className="type-body-sm mt-1 text-muted-foreground">{t("flats.generatorLead")}</p>
      </div>
      <FormField label={t("flats.target")} required>
        <select
          value={target}
          onChange={(e) => pickTarget(e.target.value)}
          className={cn(CONTROL_CLASS, "w-full sm:max-w-xs")}
        >
          {wings.map((wing) => (
            <option key={wing.id} value={wing.id}>
              {wing.name}
            </option>
          ))}
          {wings.length > 1 ? <option value={ALL_WINGS}>{t("flats.allWings")}</option> : null}
        </select>
      </FormField>
      <FloorFlats
        floors={floors}
        onChange={(next) => change({ floors: next })}
        showPreview={false}
      />
      <div className="flex flex-col gap-3">
        <h3 className="type-label text-foreground">{t("flats.sharedTitle")}</h3>
        <FlatFields
          value={attrs}
          onChange={(next) => change({ attrs: next })}
          errors={errors}
          withParking={false}
        />
      </div>
      <p className="type-body-sm tabular-nums text-muted-foreground" aria-live="polite">
        {t("flats.planSummary", { total: plan.total, skipped: plan.skipped })}
      </p>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button
        type="button"
        size="touch"
        variant="outline"
        className="self-start"
        disabled={busy}
        onClick={generate}
      >
        {busy ? t("flats.generating") : t("flats.generate", { count: plan.total })}
      </Button>
    </SurfaceCard>
  );
}
