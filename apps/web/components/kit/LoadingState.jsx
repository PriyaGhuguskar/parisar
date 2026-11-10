"use client";

// Loading treatment, shaped like what is coming.
//   variant="page"   spinner and label centred in the content area
//   variant="inline" small spinner and label, for inside a card or popover
//   variant="list"   row placeholders (ListSkeleton)
//   variant="cards"  a grid of metric-card placeholders

import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "./ListSkeleton";

export function LoadingState({ variant = "page", label, rows, className }) {
  const { t } = useTranslation("kit");
  const text = label ?? t("loading.default");

  if (variant === "list") {
    return (
      <div className={className}>
        <ListSkeleton rows={rows} label={text} />
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <output className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4", className)}>
        <span className="sr-only">{text}</span>
        {Array.from({ length: rows ?? 4 }, (_, i) => i).map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="h-28 animate-pulse rounded-xl border border-border bg-muted"
          />
        ))}
      </output>
    );
  }

  return (
    <output
      className={cn(
        "type-body flex items-center gap-2 text-muted-foreground",
        variant === "page" && "min-h-48 justify-center py-12",
        className,
      )}
    >
      <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
      <span>{text}</span>
    </output>
  );
}
