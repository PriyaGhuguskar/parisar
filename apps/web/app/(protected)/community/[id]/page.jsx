// /community/[id] — SSR post detail + comments (web). UI-SPEC Screen 6.
//
// Server component:
//   1. Validates session + reads userId from JWT app_metadata.
//   2. getPost(supabase, id) + listComments — RLS gates visibility + filters
//      hidden/deleted (D-03). Not visible → not-found.
//   3. Signs each post photo (1h) server-side for the PhotoGrid.
//   4. Hands off to PostDetailClient (Realtime comments + report flow).

import { COMMUNITY_BUCKET, getPost, listComments } from "@parisar/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PostDetailClient } from "../../../../components/community/PostDetailClient";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  let detail = null;
  let comments = [];
  let loadError = null;
  try {
    detail = await getPost(supabase, id);
    comments = await listComments(supabase, id);
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  if (!detail?.post) {
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)] flex flex-col items-center justify-center gap-3 px-8 text-center">
        <h2 className="text-xl font-semibold text-[#171717]">Post not found</h2>
        <p className="text-base text-[#525252]">
          This post may have been removed, or you may not have permission to view it.
        </p>
        {loadError ? <p className="text-sm text-[#6e6e6e]">{loadError}</p> : null}
        <Link
          href="/community"
          className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors mt-2"
        >
          Back to Community
        </Link>
      </div>
    );
  }

  // Sign each photo attachment (1h) server-side for the PhotoGrid.
  const photoUrls = [];
  for (const att of detail.attachments ?? []) {
    if (!att?.storage_key) continue;
    try {
      const { data } = await supabase.storage
        .from(COMMUNITY_BUCKET)
        .createSignedUrl(att.storage_key, 3600);
      if (data?.signedUrl) photoUrls.push(data.signedUrl);
    } catch {
      // Skip a photo that fails to sign.
    }
  }

  return (
    <PostDetailClient
      post={detail.post}
      initialComments={comments}
      photoUrls={photoUrls}
      userId={user.id}
    />
  );
}
