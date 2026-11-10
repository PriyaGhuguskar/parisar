"use client";

// The label and tone for any onboarding status, in the viewer's language.
//
//   <StatusBadge status="pending_review" />
//
// `label` and `tone` override the defaults. A value missing from lib/statuses.js renders
// readable and neutral rather than as a raw key; add it there and to the kit shards.

import { useTranslation } from "react-i18next";
import { humanizeStatus, STATUS_TONES, statusTone } from "./lib/statuses";
import { StatusPill } from "./StatusPill";

export function StatusBadge({ status, label, tone }) {
  const { t } = useTranslation("kit");
  const known = Object.hasOwn(STATUS_TONES, status);
  const text = label ?? (known ? t(`status.${status}`) : humanizeStatus(status));
  return <StatusPill tone={tone ?? statusTone(status)}>{text}</StatusPill>;
}
