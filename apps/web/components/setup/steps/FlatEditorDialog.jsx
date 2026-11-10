"use client";

// Add one flat to a floor, or edit / delete an existing one. Writes go through
// setup_upsert_flat and setup_delete_flat; the dialog closes only after the server
// confirms, and keeps what was typed when it refuses.

import { setupDeleteFlat, setupUpsertFlat } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormField, Notice, TextInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { callRpc } from "../lib/rpc";
import { flatPayload, LIMITS, validateFlatAttributes } from "../lib/setupModel";
import { EMPTY_ATTRS, FlatFields } from "./FlatFields";

function attrsFromFlat(flat) {
  if (!flat) return { ...EMPTY_ATTRS };
  return {
    flatType: flat.flat_type ?? "",
    areaSqft: flat.area_sqft == null ? "" : String(flat.area_sqft),
    bedrooms: flat.bedrooms == null ? "" : String(flat.bedrooms),
    parkingSlot: flat.parking_slot ?? "",
    status: flat.status ?? "vacant",
  };
}

/** target: { wing, floor, flat? } or null when closed. */
export function FlatEditorDialog({ target, societyId, reload, errorText, onClose }) {
  const { t } = useTranslation("setup-wizard");
  const flat = target?.flat ?? null;
  const [number, setNumber] = useState(flat?.number ?? "");
  const [attrs, setAttrs] = useState(() => attrsFromFlat(flat));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null); // save | delete
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e) {
    e.preventDefault();
    const next = validateFlatAttributes(attrs);
    const trimmed = number.trim();
    if (!trimmed) next.number = "flats.errors.numberRequired";
    else if (trimmed.length > LIMITS.flatNumber) next.number = "flats.errors.numberLong";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy("save");
    setError(null);
    const p = flatPayload(trimmed, attrs);
    const res = await callRpc((sb) =>
      setupUpsertFlat(sb, {
        societyId,
        wingId: target.wing.id,
        floorId: target.floor?.id ?? null,
        flatId: flat?.id ?? null,
        number: p.number,
        flatType: p.flat_type,
        areaSqft: p.area_sqft,
        bedrooms: p.bedrooms,
        parkingSlot: p.parking_slot,
        status: p.status,
      }),
    );
    if (res.error) {
      setBusy(null);
      if (res.error === "FLAT_EXISTS") setErrors({ number: "flats.errors.numberExists" });
      else setError(errorText(res.error));
      return;
    }
    await reload();
    setBusy(null);
    onClose();
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const res = await callRpc((sb) => setupDeleteFlat(sb, flat.id));
    if (res.error) {
      setBusy(null);
      setConfirmDelete(false);
      setError(errorText(res.error));
      return;
    }
    await reload();
    setBusy(null);
    onClose();
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (!open && !busy ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {flat ? t("flats.editTitle", { number: flat.number }) : t("flats.addTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("flats.dialogWhere", {
              wing: target?.wing?.name ?? "",
              floor: target?.floor ? String(target.floor.number) : t("flats.noFloor"),
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5" noValidate>
          <FormField
            label={t("flats.number")}
            required
            error={errors.number ? t(errors.number) : null}
          >
            <TextInput
              value={number}
              maxLength={LIMITS.flatNumber}
              onChange={(e) => setNumber(e.target.value)}
            />
          </FormField>
          <FlatFields value={attrs} onChange={setAttrs} errors={errors} />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {confirmDelete ? (
            <Notice
              tone="warning"
              title={t("flats.deleteTitle", { number: flat?.number ?? "" })}
              action={
                <>
                  <Button
                    type="button"
                    variant="danger"
                    size="touch"
                    disabled={Boolean(busy)}
                    onClick={remove}
                  >
                    {busy === "delete" ? t("saving") : t("flats.deleteConfirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    disabled={Boolean(busy)}
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t("cancel")}
                  </Button>
                </>
              }
            >
              {t("flats.deleteBody")}
            </Notice>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {flat && !confirmDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="touch"
                disabled={Boolean(busy)}
                onClick={() => setConfirmDelete(true)}
              >
                {t("flats.delete")}
              </Button>
            ) : null}
            <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row-reverse">
              <Button type="submit" size="touch" disabled={Boolean(busy)}>
                {busy === "save" ? t("saving") : t("flats.saveFlat")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={Boolean(busy)}
                onClick={onClose}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
