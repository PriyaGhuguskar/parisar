"use client";

// ComplaintCard — list row showing a single complaint (web).
//
// Visual contract per 04-UI-SPEC.md Screen 1:
//   - Surface: neutral.0 / rounded-xl / shadow-sm / border neutral.200
//   - Left accent stripe: 4px wide / color by status (STATUS_ACCENT)
//   - Internal layout:
//        [stripe] [content (badge+age, description, attribution, OwnerChip)] [64×64 thumbnail?]
//   - Thumbnail: only shown when a signed URL is provided (list query doesn't
//     embed attachments — caller may pass a pre-fetched signedUrl)
//   - Description: line-clamp-2
//   - Attribution: complaint.filedBy with name + wing-flat
//   - Age: formatDistanceToNow (date-fns)

import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { OwnerChip } from "./OwnerChip";
import { STATUS_ACCENT, StatusBadge } from "./StatusBadge";

function formatFlat(reporterFlat) {
  if (!reporterFlat) return "—";
  const wing = reporterFlat?.wing?.name ?? "";
  const num = reporterFlat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAge(iso) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   complaint: object,
 *   onClick?: (complaint: object) => void,
 *   thumbnailUrl?: string|null,
 * }} props
 */
export function ComplaintCard({ complaint, onClick, thumbnailUrl = null }) {
  const { t } = useTranslation("complaints");
  const status = complaint?.status ?? "open";
  const accent = STATUS_ACCENT[status] ?? STATUS_ACCENT.open;

  const reporterName = complaint?.reporter?.full_name ?? "—";
  const reporterFlat = formatFlat(complaint?.reporter_flat);
  const ownerName = complaint?.owner?.full_name ?? null;
  // Owner's flat is not joined on the list query; OwnerChip falls back to "—".
  const ownerFlat = null;

  const age = safeAge(complaint?.created_at);
  const filedByText = t("complaint.filedBy", { name: reporterName, flat: reporterFlat });

  const descPreview = (complaint?.description ?? "").slice(0, 50);
  const a11yLabel = `${status} complaint: ${descPreview}`;

  function handleClick() {
    onClick?.(complaint);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(complaint);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: card pattern with shadcn-style div + role
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={a11yLabel}
      className="flex bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Left accent stripe */}
      <div aria-hidden="true" style={{ width: 4, backgroundColor: accent, flexShrink: 0 }} />

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {age ? <span className="text-sm text-[#6e6e6e] ml-auto truncate">{age}</span> : null}
        </div>

        <p className="text-base text-[#171717] line-clamp-2 break-words">
          {complaint?.description ?? ""}
        </p>

        <p className="text-sm text-[#525252] truncate">{filedByText}</p>

        {ownerName ? <OwnerChip ownerName={ownerName} ownerFlat={ownerFlat} /> : null}
      </div>

      {/* Thumbnail — only when signed URL provided */}
      {thumbnailUrl ? (
        <div className="p-2 flex-shrink-0">
          {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs not compatible with next/image */}
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            className="w-16 h-16 rounded-lg object-cover"
          />
        </div>
      ) : null}
    </div>
  );
}
