"use client";

// Step 2: wings. Add one or several (name, optional code, number of floors).
// Continue creates each wing and its floors through setup_upsert_wing and
// setup_upsert_floor, then marks the step completed (the server refuses that
// unless a wing really exists). Save draft keeps unsaved rows on the server.

import {
  setupCompleteStep,
  setupSaveDraft,
  setupUpsertFloor,
  setupUpsertWing,
} from "@parisar/api-client";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, FormField, Notice, SurfaceCard, TextInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { callRpc } from "../lib/rpc";
import {
  emptyWingRow,
  floorNumbersFor,
  LIMITS,
  stepDraft,
  validateWingRows,
} from "../lib/setupModel";
import { WingList } from "./WingList";

const isBlank = (row) => !row.name.trim() && !row.code.trim() && !String(row.floors).trim();

function initialRows(state) {
  const saved = new Set((state?.wings ?? []).map((w) => w.name.trim().toLowerCase()));
  const draft = stepDraft(state, "wings");
  const rows = Array.isArray(draft?.rows)
    ? draft.rows
        .filter((r) => r && typeof r.name === "string")
        .filter((r) => !saved.has(r.name.trim().toLowerCase()))
        .map((r) => ({ ...emptyWingRow(), ...r, floors: String(r.floors ?? "") }))
    : [];
  if (rows.length) return rows;
  return (state?.wings ?? []).length ? [] : [emptyWingRow()];
}

export function WingsStep({ societyId, state, reload, errorText, onNext, onBack }) {
  const { t } = useTranslation("setup-wizard");
  const wings = state?.wings ?? [];
  const [rows, setRows] = useState(() => initialRows(state));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(null); // null | "save" | "draft"
  const [message, setMessage] = useState(null); // { tone, text }

  function update(i, patch) {
    setRows((current) => current.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    setErrors((current) => current.map((e, idx) => (idx === i ? {} : e)));
    setMessage(null);
  }

  async function saveDraft() {
    setBusy("draft");
    setMessage(null);
    const res = await callRpc((sb) =>
      setupSaveDraft(sb, { societyId, step: "wings", draft: { rows } }),
    );
    setBusy(null);
    setMessage(
      res.error
        ? { tone: "danger", text: errorText(res.error) }
        : { tone: "success", text: t("draftSaved") },
    );
    if (!res.error) await reload();
  }

  async function createRow(row) {
    const wing = await callRpc((sb) =>
      setupUpsertWing(sb, {
        societyId,
        name: row.name.trim(),
        code: row.code.trim().toUpperCase() || null,
      }),
    );
    if (wing.error)
      return { error: wing.error, field: wing.error === "WING_CODE_EXISTS" ? "code" : "name" };
    for (const number of floorNumbersFor(row.floors, row.ground)) {
      const floor = await callRpc((sb) =>
        setupUpsertFloor(sb, { societyId, wingId: wing.data.id, number, flatCount: 0 }),
      );
      if (floor.error && floor.error !== "FLOOR_EXISTS")
        return { error: floor.error, created: true };
    }
    return {};
  }

  async function submit(e) {
    e.preventDefault();
    setMessage(null);
    const pending = rows.filter((row) => !isBlank(row));
    if (!pending.length && !wings.length) {
      setMessage({ tone: "danger", text: t("wings.errors.needOne") });
      return;
    }
    const check = validateWingRows(pending, wings);
    if (!check.valid) {
      const byRow = rows.map((row) => (isBlank(row) ? {} : check.errors[pending.indexOf(row)]));
      setErrors(byRow);
      return;
    }

    setBusy("save");
    const left = [];
    const leftErrors = [];
    let failure = null;
    for (const row of pending) {
      if (failure) {
        left.push(row);
        leftErrors.push({});
        continue;
      }
      const res = await createRow(row);
      if (res.error && !res.created) {
        failure = res.error;
        left.push(row);
        leftErrors.push({
          [res.field]:
            res.error === "WING_NAME_EXISTS"
              ? "wings.errors.nameDuplicate"
              : res.error === "WING_CODE_EXISTS"
                ? "wings.errors.codeDuplicate"
                : null,
        });
      } else if (res.error) {
        failure = res.error;
      }
    }
    await reload();
    setRows(left);
    setErrors(leftErrors);
    if (failure) {
      setBusy(null);
      setMessage({ tone: "danger", text: errorText(failure) });
      return;
    }
    const done = await callRpc((sb) => setupCompleteStep(sb, { societyId, step: "wings" }));
    setBusy(null);
    if (done.error) {
      setMessage({ tone: "danger", text: errorText(done.error) });
      return;
    }
    await reload();
    onNext();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Outside the form: each saved wing's editor is a form of its own. */}
      <WingList wings={wings} societyId={societyId} reload={reload} errorText={errorText} />
      <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
        <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <h2 className="type-h3 text-foreground">
              {wings.length ? t("wings.addMoreTitle") : t("wings.title")}
            </h2>
            <p className="type-body-sm mt-1 text-muted-foreground">{t("wings.lead")}</p>
          </div>

          {rows.map((row, i) => {
            const err = errors[i] ?? {};
            return (
              <fieldset
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and unsaved
                key={i}
                className="flex flex-col gap-4 rounded-lg border border-border p-4"
              >
                <legend className="type-label px-1 text-foreground">
                  {t("wings.rowLegend", { n: i + 1 })}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField label={t("wings.name")} required error={err.name ? t(err.name) : null}>
                    <TextInput
                      value={row.name}
                      maxLength={LIMITS.wingName}
                      placeholder={t("wings.namePlaceholder")}
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </FormField>
                  <FormField
                    label={t("wings.code")}
                    optional
                    hint={t("wings.codeHint")}
                    error={err.code ? t(err.code) : null}
                  >
                    <TextInput
                      value={row.code}
                      maxLength={LIMITS.wingCode}
                      onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
                    />
                  </FormField>
                  <FormField
                    label={t("wings.floors")}
                    required
                    hint={t("wings.floorsHint")}
                    error={err.floors ? t(err.floors) : null}
                  >
                    <TextInput
                      inputMode="numeric"
                      value={row.floors}
                      onChange={(e) =>
                        update(i, { floors: e.target.value.replace(/\D/g, "").slice(0, 3) })
                      }
                    />
                  </FormField>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="type-body flex min-h-11 cursor-pointer items-center gap-3 text-foreground">
                    <input
                      type="checkbox"
                      checked={row.ground}
                      onChange={(e) => update(i, { ground: e.target.checked })}
                      className="size-4 accent-[var(--primary)]"
                    />
                    {t("wings.ground")}
                  </label>
                  {rows.length > 1 || wings.length ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      onClick={() => {
                        setRows((current) => current.filter((_, idx) => idx !== i));
                        setErrors((current) => current.filter((_, idx) => idx !== i));
                      }}
                    >
                      <X aria-hidden="true" className="size-4" />
                      {t("wings.removeRow")}
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            );
          })}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setRows((current) => [...current, emptyWingRow()])}
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("wings.addRow")}
            </Button>
            {!wings.length ? (
              <Button
                type="button"
                variant="ghost"
                size="touch"
                onClick={() => {
                  setRows([{ ...emptyWingRow(), name: t("wings.singleName") }]);
                  setErrors([]);
                }}
              >
                {t("wings.single")}
              </Button>
            ) : null}
          </div>
        </SurfaceCard>

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
          {rows.some((row) => !isBlank(row)) ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={Boolean(busy)}
              onClick={saveDraft}
            >
              {busy === "draft" ? t("saving") : t("saveDraft")}
            </Button>
          ) : null}
        </FormActions>
      </form>
    </div>
  );
}
