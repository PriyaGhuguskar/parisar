"use client";

// ConfirmRemoveDialog — localized "type the name to remove" confirmation built
// on DestructiveConfirmDialog. Used by the amenity / staff / facility-event
// deletes so none of them fires on a single stray click.
//
// The caller owns the delete: onConfirm returns a Promise resolving to
//   { ok: true }                     → dialog closes
//   { error: "NOT_ALLOWED" | ... }   → localized error, dialog stays open
// A thrown error is treated like a generic failure.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DestructiveConfirmDialog } from "./DestructiveConfirmDialog";

const PERMISSION_CODES = new Set(["NOT_ALLOWED", "NOT_SECRETARY", "INSUFFICIENT_PRIVILEGES"]);

/**
 * @param {{
 *   target: { id: string, name: string } | null,
 *   onClose: () => void,
 *   onConfirm: (target: { id: string, name: string }) => Promise<{ ok?: boolean, error?: string }>,
 * }} props
 */
export function ConfirmRemoveDialog({ target, onClose, onConfirm }) {
  const { t } = useTranslation("auth");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  function close() {
    if (busy) return;
    setErrorKey(null);
    onClose();
  }

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    setErrorKey(null);
    let res;
    try {
      res = await onConfirm(target);
    } catch {
      res = { error: "FAILED" };
    }
    setBusy(false);
    if (res?.error) {
      setErrorKey(PERMISSION_CODES.has(res.error) ? "confirm.notAllowed" : "confirm.removeError");
      return;
    }
    onClose();
  }

  const name = target?.name ?? "";
  return (
    <DestructiveConfirmDialog
      open={!!target}
      onClose={close}
      title={t("confirm.removeTitle", { name })}
      body={t("confirm.removeBody")}
      confirmMatchText={name}
      confirmMatchLabel={t("confirm.typeToConfirm", { name })}
      confirmButtonLabel={t("confirm.removeCta")}
      cancelLabel={t("confirm.cancel")}
      mismatchError={t("confirm.mismatch")}
      loadingLabel={t("confirm.removing")}
      error={errorKey ? t(errorKey) : null}
      onConfirm={confirm}
      isLoading={busy}
    />
  );
}
