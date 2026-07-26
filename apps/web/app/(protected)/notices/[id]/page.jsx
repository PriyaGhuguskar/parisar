// /notices/[id] — SSR notice detail (+ embedded poll).
//
// Server component:
//   1. Validates session + reads JWT app_metadata (role + user id).
//   2. Fetches the notice + attachments + poll + options + the caller's own vote
//      via getNoticeDetail.
//   3. Signs the first attachment (1h) server-side and detects its mime so the
//      client renders a PDF link or an image lightbox.
//   4. Hands off to NoticeDetailClient (Realtime poll tally + PollBlock).
//
// RLS scopes visibility — a notice the caller can't see returns null → not-found.

import { getNoticeDetail, NOTICES_BUCKET } from "@parisar/api-client";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, PageShell } from "@/components/kit";
import { NoticeDetailClient } from "../../../../components/notices/NoticeDetailClient";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NoticeDetailPage({ params }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jwtMeta = user.app_metadata ?? user.user_metadata ?? {};
  const role = jwtMeta.role ?? "member";

  const { id } = await params;

  let detail = null;
  let loadError = null;
  try {
    detail = await getNoticeDetail(supabase, id);
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  if (!detail?.notice) {
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)]">
        <PageShell width="narrow">
          <EmptyState
            icon={FileQuestion}
            title="Notice not found"
            description="This notice may have been removed, or you may not have permission to view it."
            action={
              <div className="flex flex-col items-center gap-3">
                {loadError ? (
                  <p className="text-xs text-[var(--color-neutral-400)]">{loadError}</p>
                ) : null}
                <Link
                  href="/notices"
                  className="pk-press inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-5 text-sm font-bold text-[var(--color-neutral-900)] transition-colors hover:bg-[var(--color-neutral-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
                >
                  Back to notices
                </Link>
              </div>
            }
          />
        </PageShell>
      </div>
    );
  }

  // Sign the first attachment (if any) server-side; expose its mime so the client
  // can choose a PDF link vs an image lightbox.
  let signedAttachmentUrl = null;
  let attachmentMime = null;
  const att = detail.attachments?.[0];
  if (att?.storage_key) {
    attachmentMime = att.mime_type ?? null;
    try {
      const { data } = await supabase.storage
        .from(NOTICES_BUCKET)
        .createSignedUrl(att.storage_key, 3600);
      signedAttachmentUrl = data?.signedUrl ?? null;
    } catch {
      signedAttachmentUrl = null;
    }
  }

  const isAuthor = detail.notice.author_id === user.id;

  return (
    <NoticeDetailClient
      notice={detail.notice}
      poll={detail.poll}
      options={detail.options}
      myVote={detail.myVote}
      signedAttachmentUrl={signedAttachmentUrl}
      attachmentMime={attachmentMime}
      role={role}
      isAuthor={isAuthor}
    />
  );
}
