"use client";

// StatusBadge with a label from this area's shard. Colour is always paired with text.

import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/kit";
import { hasStatusLabel, statusTone } from "./lib/statusMeta";

export function StateBadge({ kind, status }) {
  const { t } = useTranslation("resident-onboarding");
  const label = hasStatusLabel(kind, status) ? t(`status.${kind}.${status}`) : undefined;
  return <StatusBadge status={status} label={label} tone={statusTone(kind, status)} />;
}
