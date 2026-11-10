"use client";

// Inline message, in place of toasts. It stays where the person is looking and until
// they move on, which suits slow readers and a page with no toast host. Use it for
// success after a form saves, and for warnings and failures tied to a section.
//
//   <Notice tone="success" title="Request received">Your reference is PR-1042.</Notice>
//
// Success and info are announced politely; warning and danger interrupt.

import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ICON_BUTTON_CLASS } from "./controlStyles";

const TONES = {
  success: {
    icon: CheckCircle2,
    role: "status",
    className: "border-status-success-border bg-status-success-bg text-status-success-fg",
  },
  info: {
    icon: Info,
    role: "status",
    className: "border-status-info-border bg-status-info-bg text-status-info-fg",
  },
  warning: {
    icon: AlertTriangle,
    role: "alert",
    className: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  },
  danger: {
    icon: CircleAlert,
    role: "alert",
    className: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  },
  neutral: {
    icon: Info,
    role: "status",
    className: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
  },
};

export function Notice({ tone = "info", title, children, action, onDismiss, className }) {
  const { t } = useTranslation("kit");
  const config = TONES[tone] ?? TONES.info;
  const Icon = config.icon;
  return (
    <Alert
      role={config.role}
      className={cn("flex items-start gap-3 px-3.5 py-3", config.className, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="type-body font-semibold">{title}</p> : null}
        {children ? <div className="type-body">{children}</div> : null}
        {action ? <div className="mt-2.5 flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("notice.dismiss")}
          className={cn(ICON_BUTTON_CLASS, "-my-2.5 -mr-2 text-current hover:bg-transparent")}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </Alert>
  );
}
