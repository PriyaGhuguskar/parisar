"use client";

// Step 4: flats. Generate them in bulk by floor (FlatGenerator), then open any
// flat to set its type, area, bedrooms, parking slot or status, or add a single
// flat to a floor. Continue marks the step completed, which the server refuses
// until a flat really exists.

import { setupCompleteStep, setupSaveDraft } from "@parisar/api-client";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, FormActions, Notice, SurfaceCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { callRpc } from "../lib/rpc";
import { flatsInWing, stepDraft } from "../lib/setupModel";
import { FlatEditorDialog } from "./FlatEditorDialog";
import { FlatGenerator } from "./FlatGenerator";

const STATUS_DOT = {
  occupied: "bg-status-success-solid",
  vacant: "bg-status-neutral-solid",
  under_construction: "bg-status-warning-solid",
  maintenance: "bg-status-info-solid",
};

function FlatChip({ flat, onOpen, t }) {
  const status = flat.effective_status ?? flat.status ?? "vacant";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("flats.openAria", { number: flat.number, status: t(`flatStatus.${status}`) })}
      className="focus-ring flex min-h-11 min-w-16 flex-col items-start justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-left hover:bg-muted"
    >
      <span className="type-body-sm flex items-center gap-1.5 font-semibold tabular-nums text-foreground">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT.vacant}`}
        />
        {flat.number}
      </span>
      {flat.flat_type ? (
        <span className="type-caption text-muted-foreground">
          {t(`flatType.${flat.flat_type}`)}
        </span>
      ) : null}
    </button>
  );
}

function WingFlats({ wing, onOpen, t }) {
  const groups = [
    ...(wing.floors ?? []).map((floor) => ({ key: floor.id, floor, flats: floor.flats ?? [] })),
  ];
  if (wing.unassigned_flats?.length) {
    groups.push({ key: "none", floor: null, flats: wing.unassigned_flats });
  }
  return (
    <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="type-h3 text-foreground">
        {t("flats.wingTitle", { name: wing.name, count: flatsInWing(wing).length })}
      </h2>
      {groups.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t("flats.noFloors")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map(({ key, floor, flats }) => (
            <li key={key} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="type-label text-foreground">
                  {floor
                    ? t("flats.floorLabel", {
                        number: floor.number,
                        name: floor.name ? ` · ${floor.name}` : "",
                      })
                    : t("flats.noFloor")}
                </h3>
                {floor ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    onClick={() => onOpen({ wing, floor })}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    {t("flats.addOne")}
                  </Button>
                ) : null}
              </div>
              {flats.length ? (
                <div className="flex flex-wrap gap-2">
                  {flats.map((flat) => (
                    <FlatChip
                      key={flat.id}
                      flat={flat}
                      t={t}
                      onOpen={() => onOpen({ wing, floor, flat })}
                    />
                  ))}
                </div>
              ) : (
                <p className="type-body-sm text-muted-foreground">{t("flats.floorEmpty")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}

export function FlatsStep({ societyId, state, reload, errorText, onNext, onBack }) {
  const { t } = useTranslation("setup-wizard");
  const wings = state?.wings ?? [];
  const [target, setTarget] = useState(null);
  const [draft, setDraft] = useState(() => stepDraft(state, "flats"));
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
            {t("previous")}
          </Button>
        }
      />
    );
  }

  async function saveDraft() {
    setBusy("draft");
    setMessage(null);
    const res = await callRpc((sb) =>
      setupSaveDraft(sb, { societyId, step: "flats", draft: draft ?? {} }),
    );
    setBusy(null);
    setMessage(
      res.error
        ? { tone: "danger", text: errorText(res.error) }
        : { tone: "success", text: t("draftSaved") },
    );
    if (!res.error) await reload();
  }

  async function submit(e) {
    e.preventDefault();
    setBusy("save");
    setMessage(null);
    const res = await callRpc((sb) => setupCompleteStep(sb, { societyId, step: "flats" }));
    if (res.error) {
      setBusy(null);
      setMessage({
        tone: "danger",
        text: res.error === "STEP_INCOMPLETE" ? t("flats.errors.needOne") : errorText(res.error),
      });
      return;
    }
    await reload();
    setBusy(null);
    onNext();
  }

  const total = state?.counts?.flats ?? 0;

  // A flat added or created below makes an earlier "create at least one flat"
  // notice stale, so clear it whenever the structure reloads.
  async function reloadAndClear() {
    setMessage(null);
    await reload();
  }

  return (
    <div className="flex flex-col gap-8">
      <FlatGenerator
        wings={wings}
        societyId={societyId}
        reload={reloadAndClear}
        errorText={errorText}
        draft={draft}
        onDraftChange={setDraft}
      />
      {wings.map((wing) => (
        <WingFlats key={wing.id} wing={wing} t={t} onOpen={setTarget} />
      ))}
      {target ? (
        <FlatEditorDialog
          key={target.flat?.id ?? `new-${target.floor?.id}`}
          target={target}
          societyId={societyId}
          reload={reloadAndClear}
          errorText={errorText}
          onClose={() => setTarget(null)}
        />
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <p className="type-body-sm tabular-nums text-muted-foreground">
          {t("flats.total", { count: total })}
        </p>
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
    </div>
  );
}
