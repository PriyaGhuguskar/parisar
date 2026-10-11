// /complaints/[id] — SSR complaint detail.
//
// Server component:
//   1. Validates session and resolves the live role (resolveActiveSociety).
//   2. Fetches complaint + responses + attachments via shared api-client helper.
//   3. Generates a signed URL for the first attachment (1h expiry).
//   4. Hands off to ComplaintDetailClient for Realtime + action row + lightbox.
//
// RLS scopes the visibility — if the user cannot see this complaint, the
// detail fetch returns null and we render a Not-found state.

import { COMPLAINTS_BUCKET, getComplaintDetail } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { ComplaintDetailClient } from "../../../../components/complaints/ComplaintDetailClient";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { getServerT } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { DetailNotFound, logLoadError } from "../../_components/DetailNotFound";

export const dynamic = "force-dynamic";

export default async function ComplaintDetailPage({ params }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Live role in the active society — NOT user.app_metadata (getUser() never
  // carries the Auth Hook claims, so the board action row never rendered).
  const { role } = await resolveActiveSociety(supabase, user);

  const { id } = await params;

  let complaint = null;
  let responses = [];
  let attachments = [];
  let loadFailed = false;

  try {
    const detail = await getComplaintDetail(supabase, id);
    complaint = detail.complaint;
    responses = detail.responses;
    attachments = detail.attachments;
  } catch (err) {
    loadFailed = true;
    logLoadError("complaint-detail", err);
  }

  if (!complaint) {
    const { t } = await getServerT(["complaints", "auth"]);
    return (
      <DetailNotFound
        title={t("complaint.notFoundTitle")}
        body={t("complaint.notFoundBody")}
        errorText={loadFailed ? t("auth:common.loadFailed") : null}
        backHref="/complaints"
        backLabel={t("complaint.backToList")}
      />
    );
  }

  // Sign the first attachment (if any) server-side so the client doesn't need
  // to re-authenticate for it.
  let signedPhotoUrl = null;
  const att = attachments?.[0];
  if (att?.storage_key) {
    try {
      const { data } = await supabase.storage
        .from(COMPLAINTS_BUCKET)
        .createSignedUrl(att.storage_key, 3600);
      signedPhotoUrl = data?.signedUrl ?? null;
    } catch {
      signedPhotoUrl = null;
    }
  }

  return (
    <ComplaintDetailClient
      complaint={complaint}
      initialResponses={responses}
      signedPhotoUrl={signedPhotoUrl}
      userId={user.id}
      role={role}
    />
  );
}
