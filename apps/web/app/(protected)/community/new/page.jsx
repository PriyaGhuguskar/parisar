// /community/new — post composer (web, all roles — COMM-01). UI-SPEC Screen 5.
//
// Server component: validates session + reads societyId, then renders the client
// PostComposer (which owns the D-02 image-safety gate + the client-side createPost
// quarantine → moderate-image → create_post handoff).

import Link from "next/link";
import { redirect } from "next/navigation";
import { PostComposer } from "../../../../components/community/PostComposer";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { initTranslations, readLocaleFromCookies } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["community"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/community"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to community"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("community.composeTitle")}
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-6">
          <PostComposer societyId={societyId} />
        </div>
      </main>
    </div>
  );
}
