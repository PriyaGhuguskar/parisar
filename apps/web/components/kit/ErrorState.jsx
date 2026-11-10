"use client";

// A failed load: what happened and how to recover. Pass your own friendly
// `description`. Never pass a raw database or network message: they leak internals
// and nobody using the product can act on them.

import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({ title, description, onRetry, retryLabel, action, className }) {
  const { t } = useTranslation("kit");
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-xl border border-border bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mb-3 flex size-10 items-center justify-center rounded-lg bg-status-danger-bg text-status-danger-fg"
      >
        <AlertCircle className="size-5" />
      </span>
      <p className="type-h3 text-foreground">{title ?? t("error.title")}</p>
      <p className="type-body mt-1.5 max-w-md text-muted-foreground">
        {description ?? t("error.body")}
      </p>
      {onRetry || action ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <Button type="button" variant="outline" size="touch" onClick={onRetry}>
              {retryLabel ?? t("error.retry")}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
