"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * DestructiveConfirmDialog — typed-name gate for irreversible actions.
 *
 * Props:
 *   open               {boolean}   controlled open state
 *   onClose            {Function}  called when dialog should close
 *   title              {string}    dialog heading (shown in danger color)
 *   body               {string}    explanatory paragraph
 *   confirmMatchText   {string}    the text the user must type to enable Confirm
 *   confirmMatchLabel  {string}    label above the typed-name input
 *   confirmButtonLabel {string}    label for the destructive confirm button
 *   cancelLabel        {string}    label for cancel (default "Cancel")
 *   mismatchError      {string}    inline error when text doesn't match
 *   onConfirm          {Function}  called when name matches and user confirms
 *   isLoading          {boolean}   shows loading state on confirm button
 */
export function DestructiveConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmMatchText,
  confirmMatchLabel,
  confirmButtonLabel,
  cancelLabel = "Cancel",
  mismatchError = "Name does not match.",
  onConfirm,
  isLoading = false,
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);

  // Reset and focus when dialog opens
  useEffect(() => {
    if (open) {
      setTyped("");
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const matches = typed.trim().toLowerCase() === (confirmMatchText ?? "").trim().toLowerCase();
  const showMismatch = typed.length > 0 && !matches;

  function handleOpenChange(isOpen) {
    if (!isOpen && !isLoading) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent role="alertdialog" showCloseButton={!isLoading}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-[var(--color-danger)] shrink-0" />
            <DialogTitle className="text-[var(--color-danger)]">{title}</DialogTitle>
          </div>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label htmlFor="confirm-match-input" className="text-sm text-neutral-600">
            {confirmMatchLabel}
          </label>
          {/* Use native input so ref works reliably */}
          <input
            id="confirm-match-input"
            ref={inputRef}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-invalid={showMismatch || undefined}
            disabled={isLoading}
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-neutral-200 bg-transparent px-3 text-sm outline-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/30 disabled:opacity-50 aria-invalid:border-[var(--color-danger)]"
          />
          {showMismatch && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {mismatchError}
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="destructive"
            disabled={!matches || isLoading}
            onClick={() => matches && !isLoading && onConfirm()}
            className="w-full sm:w-auto"
          >
            {isLoading ? "Loading…" : confirmButtonLabel}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
