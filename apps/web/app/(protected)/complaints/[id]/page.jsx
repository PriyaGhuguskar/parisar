// /complaints/[id] — SSR complaint detail.
//
// Server component:
//   1. Validates session and reads JWT app_metadata (role).
//   2. Fetches complaint + responses + attachments via shared api-client helper.
//   3. Generates a signed URL for the first attachment (1h expiry).
//   4. Hands off to ComplaintDetailClient for Realtime + action row + lightbox.
//
// RLS scopes the visibility — if the user cannot see this complaint, the
// detail fetch returns null and we render a Not-found state.

import { COMPLAINTS_BUCKET, getComplaintDetail } from "@parisar/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ComplaintDetailClient } from "../../../../components/complaints/ComplaintDetailClient";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ComplaintDetailPage({ params }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jwtMeta = user.app_metadata ?? user.user_metadata ?? {};
  const role = jwtMeta.role ?? "member";

  const { id } = await params;

  let complaint = null;
  let responses = [];
  let attachments = [];
  let loadError = null;

  try {
    const detail = await getComplaintDetail(supabase, id);
    complaint = detail.complaint;
    responses = detail.responses;
    attachments = detail.attachments;
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  if (!complaint) {
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)] flex flex-col items-center justify-center gap-3 px-8 text-center">
        <h2 className="text-xl font-semibold text-[#171717]">Complaint not found</h2>
        <p className="text-base text-[#525252]">
          This complaint may have been removed, or you may not have permission to view it.
        </p>
        {loadError ? <p className="text-sm text-[#6e6e6e]">{loadError}</p> : null}
        <Link
          href="/complaints"
          className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors mt-2"
        >
          Back to complaints
        </Link>
      </div>
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
