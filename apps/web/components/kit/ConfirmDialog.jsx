"use client";

// Confirmation for an action someone may regret.
//
//   <ConfirmDialog
//     open={open}
//     onOpenChange={setOpen}
//     title="Remove this resident?"
//     description="They lose access to the society straight away."
//     confirmLabel="Remove resident"
//     onConfirm={() => removeResident(id)}
//   />
//
// `onConfirm` may be async. The dialog stays open and locked while it runs, closes when
// it resolves, and if it throws stays open with `errorMessage` or a default message, so a
// failed action never looks finished. Focus starts on Cancel for destructive actions, so
// a stray Enter is harmless. To make someone type a name first, use
// DestructiveConfirmDialog, which the kit also exports.

import { AlertTriangle, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open: controlledOpen,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  workingLabel,
  errorMessage,
  destructive = true,
  onConfirm,
  children,
}) {
  const { t } = useTranslation("kit");
  const cancelRef = useRef(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = controlledOpen ?? internalOpen;

  function setOpen(next) {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  function handleOpenChange(next) {
    if (working) return;
    if (next) setFailed(false);
    setOpen(next);
  }

  async function handleConfirm() {
    setFailed(false);
    setWorking(true);
    try {
      await onConfirm?.();
      setWorking(false);
      setOpen(false);
    } catch {
      setWorking(false);
      setFailed(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        initialFocus={destructive ? cancelRef : undefined}
        className="gap-5 p-5 shadow-overlay sm:max-w-md"
      >
        <DialogHeader className="gap-2.5">
          <div className="flex items-start gap-3">
            {destructive ? (
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-danger-bg text-status-danger-fg">
                <AlertTriangle aria-hidden="true" className="size-4" />
              </span>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1.5">
              <DialogTitle className="type-h3 leading-snug font-semibold">{title}</DialogTitle>
              {description ? (
                <DialogDescription className="type-body">{description}</DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        {children}
        {failed ? (
          <p role="alert" className="type-body-sm text-destructive">
            {errorMessage ?? t("confirm.failed")}
          </p>
        ) : null}
        <DialogFooter className="-mx-5 -mb-5 p-4">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            size="touch"
            disabled={working}
            onClick={() => handleOpenChange(false)}
          >
            {cancelLabel ?? t("confirm.cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "danger" : "default"}
            size="touch"
            disabled={working}
            aria-busy={working || undefined}
            onClick={handleConfirm}
          >
            {working ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {working
              ? (workingLabel ?? t("confirm.working"))
              : (confirmLabel ?? t("confirm.confirm"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
