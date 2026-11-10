"use client";

// The button row at the end of a form or wizard step.
//
//   <FormActions
//     submitLabel="Save and continue"
//     submitting={saving}
//     onBack={goBack}
//     onCancel={close}
//   />
//
// The submit button is type="submit", so wrap this in the <form>, or pass onSubmit to
// run a handler instead. Actions stack on phones with the primary first, and sit on one
// line from sm up with Back on the far left. `sticky` pins the row to the bottom of the
// viewport on phones, for long forms. Children go between Back and the other actions.

import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FormActions({
  submitLabel,
  submittingLabel,
  submitting = false,
  disabled = false,
  destructive = false,
  onSubmit,
  onBack,
  backLabel,
  onCancel,
  cancelLabel,
  sticky = false,
  className,
  children,
}) {
  const { t } = useTranslation("kit");
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center",
        sticky &&
          "sticky bottom-0 z-10 -mx-4 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,var(--safe-b))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0",
        className,
      )}
    >
      <div className="order-2 flex flex-col gap-2 sm:order-none sm:flex-row sm:items-center">
        {onBack ? (
          <Button type="button" variant="ghost" size="touch" disabled={submitting} onClick={onBack}>
            {backLabel ?? t("actions.back")}
          </Button>
        ) : null}
        {children}
      </div>
      <div className="order-1 flex flex-col gap-2 sm:order-none sm:ml-auto sm:flex-row-reverse sm:items-center">
        <Button
          type={onSubmit ? "button" : "submit"}
          variant={destructive ? "danger" : "default"}
          size="touch"
          disabled={disabled || submitting}
          aria-busy={submitting || undefined}
          onClick={onSubmit}
        >
          {submitting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {submitting
            ? (submittingLabel ?? t("actions.saving"))
            : (submitLabel ?? t("actions.save"))}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={submitting}
            onClick={onCancel}
          >
            {cancelLabel ?? t("actions.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
