"use client";

// NoticeDetailClient — CSR notice detail (web). UI-SPEC Screen 3.
//
//   Section 1: header card — title + "Posted by {{name}} ({{flat}}) at {{time}}"
//              (NOTF-04) + full body (no truncation).
//   Section 2: attachment (conditional) — PDF → open in a new tab; image → 4:3
//              thumbnail → shadcn Dialog lightbox (mirrors Phase 4 complaint photo).
//   Section 3: PollBlock (conditional — only when the notice carries a poll).
//
// markNoticeRead fires on mount (05-03 fast-follow no-op until the read-marker DB
// surface lands; harmless, documents intent + wires the future call site).
//
// Layout comes from the shared page kit (PageShell / PageHeader / SurfaceCard);
// the fetch, read-marker and lightbox behaviour above is unchanged.

import { markNoticeRead } from "@parisar/api-client";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader, PageShell, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { PollBlock } from "../polls/PollBlock";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";

function formatFlat(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAt(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   notice: object,
 *   poll: object|null,
 *   options: Array,
 *   myVote: object|null,
 *   signedAttachmentUrl: string|null,
 *   attachmentMime: string|null,
 *   role: string,
 *   isAuthor?: boolean,
 * }} props
 */
export function NoticeDetailClient({
  notice,
  poll,
  options,
  myVote,
  signedAttachmentUrl,
  attachmentMime,
  role,
  isAuthor = false,
}) {
  const { t } = useTranslation("notifications");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Mark read on mount (fast-follow no-op — see module header).
  useEffect(() => {
    if (!notice?.id) return;
    const supabase = createSupabaseBrowserClient();
    markNoticeRead(supabase, notice.id);
  }, [notice?.id]);

  const authorName = notice?.author?.full_name ?? "—";
  const authorFlat = formatFlat(notice?.author_flat);
  const postedByLine = t("notice.postedByAt")
    .replace("{{name}}", authorName)
    .replace("{{flat}}", authorFlat)
    .replace("{{time}}", safeAt(notice?.created_at));

  const isPdf = attachmentMime === "application/pdf";
  const isImage = !!attachmentMime && attachmentMime.startsWith("image/");

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <PageShell width="narrow">
        <PageHeader
          eyebrow={t("notice.detailTitle")}
          title={notice?.title ?? ""}
          description={postedByLine}
          backHref="/notices"
          backLabel={t("notice.listTitle")}
        />

        <div className="flex flex-col gap-4">
          {/* Section 1 — body */}
          <SurfaceCard className="pk-in p-5 sm:p-6">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--color-neutral-600)]">
              {notice?.body}
            </p>
          </SurfaceCard>

          {/* Section 2 — attachment */}
          {signedAttachmentUrl && isPdf ? (
            <a
              href={signedAttachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`block rounded-[18px] ${FOCUS_RING}`}
            >
              <SurfaceCard interactive className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="pk-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: "var(--color-brand-50)",
                      color: "var(--color-brand-600)",
                    }}
                  >
                    <FileText size={19} strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-[15px] font-bold text-[var(--color-neutral-900)]">
                    {t("notice.attachmentPdf")}
                  </span>
                  <span className="pk-ul text-sm font-bold text-[var(--color-brand-600)]">
                    {t("notice.openAttachment")}
                  </span>
                </div>
              </SurfaceCard>
            </a>
          ) : null}

          {signedAttachmentUrl && isImage ? (
            <SurfaceCard className="overflow-hidden">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label="Open notice attachment full size"
                className={`block w-full overflow-hidden rounded-[18px] ${FOCUS_RING}`}
                style={{ aspectRatio: "4 / 3" }}
              >
                {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs not compatible with next/image */}
                <img
                  src={signedAttachmentUrl}
                  alt="Notice attachment"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
              <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
                <DialogContent className="max-w-3xl bg-[var(--color-neutral-900)] p-0">
                  <DialogTitle className="sr-only">Notice attachment</DialogTitle>
                  {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs not compatible with next/image */}
                  <img
                    src={signedAttachmentUrl}
                    alt="Notice attachment full size"
                    className="h-auto w-full"
                  />
                  <DialogClose className="sr-only">Close</DialogClose>
                </DialogContent>
              </Dialog>
            </SurfaceCard>
          ) : null}

          {/* Section 3 — embedded poll */}
          {poll ? (
            <PollBlock
              poll={poll}
              options={options ?? []}
              myVote={myVote ?? null}
              role={role}
              isAuthor={isAuthor}
            />
          ) : null}
        </div>
      </PageShell>
    </div>
  );
}
