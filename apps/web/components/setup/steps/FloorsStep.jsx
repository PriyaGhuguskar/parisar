"use client";

// Step 3: floors for each wing (number, optional name, planned flat count).
// Rows start from the floors saved on the server (step 2 creates them). On
// Continue the edits are diffed against the server and applied through
// setup_upsert_floor / setup_delete_floor, then the step is marked completed.

import {
  setupCompleteStep,
  setupDeleteFloor,
  setupSaveDraft,
  setupUpsertFloor,
} from "@parisar/api-client";
import { Building2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EmptyState,
  FormActions,
  FormField,
  Notice,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { callRpc } from "../lib/rpc";
import {
  diffFloors,
  floorRowsFromWing,
  LIMITS,
  stepDraft,
  toInt,
  validateFloorRows,
} from "../lib/setupModel";

function initialRows(state) {
  const draft = stepDraft(state, "floors")?.wings ?? {};
  const out = {};
  for (const wing of state?.wings ?? []) {
    const fromDraft = Array.isArray(draft[wing.id]) ? draft[wing.id] : null;
    out[wing.id] = fromDraft
      ? fromDraft.map((r) => ({
          id: r.id ?? null,
          number: String(r.number ?? ""),
          name: r.name ?? "",
          flatCount: String(r.flatCount ?? ""),
          flats: Number(r.flats ?? 0),
        }))
      : floorRowsFromWing(wing);
  }
  return out;
}

function nextNumber(rows) {
  const numbers = rows.map((r) => toInt(r.number)).filter((n) => n !== null);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function WingFloors({ wing, rows, errors, onChange, t }) {
  const [each, setEach] = useState("");
  const setRow = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="type-h3 text-foreground">{t("floors.wingTitle", { name: wing.name })}</h2>
        <div className="flex items-end gap-2">
          <FormField label={t("floors.eachLabel")} className="w-40">
            <TextInput
              inputMode="numeric"
              value={each}
              onChange={(e) => setEach(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={each === ""}
            onClick={() => onChange(rows.map((r) => ({ ...r, flatCount: each })))}
          >
            {t("floors.applyEach")}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t("floors.noneYet")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => {
            const err = errors?.[i] ?? {};
            return (
              <li
                key={row.id ?? `new-${i}`}
                className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[7rem_1fr_8rem_auto] sm:items-start"
              >
                <FormField
                  label={t("floors.number")}
                  required
                  error={err.number ? t(err.number) : null}
                >
                  <TextInput
                    inputMode="numeric"
                    value={row.number}
                    onChange={(e) =>
                      setRow(i, { number: e.target.value.replace(/[^\d-]/g, "").slice(0, 4) })
                    }
                  />
                </FormField>
                <FormField label={t("floors.name")} optional error={err.name ? t(err.name) : null}>
                  <TextInput
                    value={row.name}
                    maxLength={LIMITS.floorName}
                    placeholder={t("floors.namePlaceholder")}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                  />
                </FormField>
                <FormField
                  label={t("floors.flatCount")}
                  required
                  error={err.flatCount ? t(err.flatCount) : null}
                >
                  <TextInput
                    inputMode="numeric"
                    value={row.flatCount}
                    onChange={(e) =>
                      setRow(i, { flatCount: e.target.value.replace(/\D/g, "").slice(0, 3) })
                    }
                  />
                </FormField>
                <div className="flex min-h-11 items-center sm:mt-7">
                  {row.flats > 0 ? (
                    <span className="type-body-sm tabular-nums text-muted-foreground">
                      {t("floors.hasFlats", { count: row.flats })}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      aria-label={t("floors.removeAria", { number: row.number })}
                      onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        onClick={() =>
          onChange([
            ...rows,
            { id: null, number: String(nextNumber(rows)), name: "", flatCount: "", flats: 0 },
          ])
        }
      >
        <Plus aria-hidden="true" className="size-4" />
        {t("floors.addFloor")}
      </Button>
    </SurfaceCard>
  );
}

export function FloorsStep({ societyId, state, reload, errorText, onNext, onBack }) {
  const { t } = useTranslation("setup-wizard");
  const wings = state?.wings ?? [];
  const [byWing, setByWing] = useState(() => initialRows(state));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  if (!wings.length) {
    return (
      <EmptyState
        icon={Building2}
        title={t("floors.noWingsTitle")}
        description={t("floors.noWings")}
        action={
          <Button type="button" size="touch" onClick={onBack}>
            {t("floors.goToWings")}
          </Button>
        }
      />
    );
  }

  async function saveDraft() {
    setBusy("draft");
    setMessage(null);
    const res = await callRpc((sb) =>
      setupSaveDraft(sb, { societyId, step: "floors", draft: { wings: byWing } }),
    );
    setBusy(null);
    setMessage(
      res.error
        ? { tone: "danger", text: errorText(res.error) }
        : { tone: "success", text: t("draftSaved") },
    );
    if (!res.error) await reload();
  }

  async function applyWing(wing, rows) {
    const diff = diffFloors(wing.floors, rows);
    for (const floorId of diff.deletes) {
      const res = await callRpc((sb) => setupDeleteFloor(sb, floorId));
      if (res.error) return res.error;
    }
    for (const change of [...diff.updates, ...diff.creates]) {
      const res = await callRpc((sb) =>
        setupUpsertFloor(sb, { societyId, wingId: wing.id, ...change }),
      );
      if (res.error) return res.error;
    }
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    setMessage(null);
    const nextErrors = {};
    let valid = true;
    for (const wing of wings) {
      const check = validateFloorRows(byWing[wing.id] ?? []);
      nextErrors[wing.id] = check.errors;
      if (!check.valid) valid = false;
    }
    setErrors(nextErrors);
    if (!valid) return;
    if (!wings.some((w) => (byWing[w.id] ?? []).length)) {
      setMessage({ tone: "danger", text: t("floors.errors.needOne") });
      return;
    }

    setBusy("save");
    let failure = null;
    for (const wing of wings) {
      failure = await applyWing(wing, byWing[wing.id] ?? []);
      if (failure) break;
    }
    const reloadError = await reload();
    if (failure || reloadError) {
      setBusy(null);
      setMessage({ tone: "danger", text: errorText(failure ?? reloadError) });
      return;
    }
    const done = await callRpc((sb) => setupCompleteStep(sb, { societyId, step: "floors" }));
    setBusy(null);
    if (done.error) {
      setMessage({ tone: "danger", text: errorText(done.error) });
      return;
    }
    await reload();
    onNext();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <p className="type-body text-muted-foreground">{t("floors.lead")}</p>
      {wings.map((wing) => (
        <WingFloors
          key={wing.id}
          wing={wing}
          rows={byWing[wing.id] ?? []}
          errors={errors[wing.id]}
          t={t}
          onChange={(rows) => {
            setByWing((current) => ({ ...current, [wing.id]: rows }));
            setErrors((current) => ({ ...current, [wing.id]: [] }));
            setMessage(null);
          }}
        />
      ))}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <FormActions
        submitLabel={t("continue")}
        submittingLabel={t("saving")}
        submitting={busy === "save"}
        disabled={busy === "draft"}
        onBack={onBack}
        backLabel={t("previous")}
        sticky
      >
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={Boolean(busy)}
          onClick={saveDraft}
        >
          {busy === "draft" ? t("saving") : t("saveDraft")}
        </Button>
      </FormActions>
    </form>
  );
}
