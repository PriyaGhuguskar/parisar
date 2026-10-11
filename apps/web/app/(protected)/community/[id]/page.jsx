// /community/[id] — SSR post detail + comments (web). UI-SPEC Screen 6.
//
// Server component:
//   1. Validates session + reads userId from JWT app_metadata.
//   2. getPost(supabase, id) + listComments — RLS gates visibility + filters
//      hidden/deleted (D-03). Not visible → not-found.
//   3. Signs each post photo (1h) server-side for the PhotoGrid.
//   4. Hands off to PostDetailClient (Realtime comments + report flow).

import { COMMUNITY_BUCKET, getPost, listComments } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { PostDetailClient } from "../../../../components/community/PostDetailClient";
import { getServerT } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { DetailNotFound, logLoadError } from "../../_components/DetailNotFound";

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
  let loadFailed = false;
  try {
    detail = await getPost(supabase, id);
    comments = await listComments(supabase, id);
  } catch (err) {
    loadFailed = true;
    logLoadError("post-detail", err);
  }

  if (!detail?.post) {
    const { t } = await getServerT(["community", "auth"]);
    return (
      <DetailNotFound
        title={t("community.notFoundTitle")}
        body={t("community.notFoundBody")}
        errorText={loadFailed ? t("auth:common.loadFailed") : null}
        backHref="/community"
        backLabel={t("community.backToList")}
      />
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
