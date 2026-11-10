"use client";

// Wings already saved for the society: rename, change code, or delete.
// Every change goes through setup_upsert_wing / setup_delete_wing; the list is
// re-read from the server afterwards, so it never shows an unsaved state.

import { setupDeleteWing, setupUpsertWing } from "@parisar/api-client";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog, FormField, SurfaceCard, TextInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { callRpc } from "../lib/rpc";
import { flatsInWing, LIMITS, validateWingRows } from "../lib/setupModel";

function WingEditor({ wing, others, societyId, reload, errorText, onDone }) {
  const { t } = useTranslation("setup-wizard");
  const [name, setName] = useState(wing.name);
  const [code, setCode] = useState(wing.code ?? "");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  async function save(e) {
    e.preventDefault();
    const { errors: rowErrors } = validateWingRows([{ name, code, floors: "1" }], others);
    setErrors(rowErrors[0]);
    if (Object.keys(rowErrors[0]).length) return;
    setSaving(true);
    setFormError(null);
    const res = await callRpc((sb) =>
      setupUpsertWing(sb, {
        societyId,
        wingId: wing.id,
        name: name.trim(),
        code: code.trim().toUpperCase() || null,
      }),
    );
    if (res.error) {
      if (res.error === "WING_NAME_EXISTS") setErrors({ name: "wings.errors.nameDuplicate" });
      else if (res.error === "WING_CODE_EXISTS") setErrors({ code: "wings.errors.codeDuplicate" });
      else setFormError(errorText(res.error));
      setSaving(false);
      return;
    }
    await reload();
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("wings.name")} required error={errors.name ? t(errors.name) : null}>
          <TextInput
            value={name}
            maxLength={LIMITS.wingName}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField
          label={t("wings.code")}
          optional
          hint={t("wings.codeHint")}
          error={errors.code ? t(errors.code) : null}
        >
          <TextInput
            value={code}
            maxLength={LIMITS.wingCode}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </FormField>
      </div>
      {formError ? (
        <p role="alert" className="type-body-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="touch" disabled={saving}>
          {saving ? t("saving") : t("wings.saveWing")}
        </Button>
        <Button type="button" variant="ghost" size="touch" disabled={saving} onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export function WingList({ wings, societyId, reload, errorText }) {
  const { t } = useTranslation("setup-wizard");
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeError, setRemoveError] = useState(null);

  async function remove() {
    const res = await callRpc((sb) => setupDeleteWing(sb, removing.id));
    if (res.error) {
      setRemoveError(errorText(res.error));
      throw new Error(res.error);
    }
    await reload();
  }

  if (!wings.length) return null;

  return (
    <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="type-h3 text-foreground">{t("wings.savedTitle", { count: wings.length })}</h2>
      <ul className="flex flex-col divide-y divide-border">
        {wings.map((wing) => (
          <li key={wing.id} className="py-3 first:pt-0 last:pb-0">
            {editing === wing.id ? (
              <WingEditor
                wing={wing}
                others={wings.filter((w) => w.id !== wing.id)}
                societyId={societyId}
                reload={reload}
                errorText={errorText}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="type-body font-semibold text-foreground">
                    {wing.name}
                    {wing.code ? (
                      <span className="type-body-sm ml-2 font-normal text-muted-foreground">
                        {wing.code}
                      </span>
                    ) : null}
                  </p>
                  <p className="type-body-sm tabular-nums text-muted-foreground">
                    {t("wings.summary", {
                      floors: wing.floors?.length ?? 0,
                      flats: flatsInWing(wing).length,
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  aria-label={t("wings.editAria", { name: wing.name })}
                  onClick={() => setEditing(wing.id)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  aria-label={t("wings.deleteAria", { name: wing.name })}
                  onClick={() => {
                    setRemoveError(null);
                    setRemoving(wing);
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t("wings.deleteTitle", { name: removing?.name ?? "" })}
        description={t("wings.deleteBody")}
        confirmLabel={t("wings.deleteConfirm")}
        errorMessage={removeError}
        onConfirm={remove}
      />
    </SurfaceCard>
  );
}
