"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetupState } from "../../../lib/setup-state";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

/**
 * /setup root page — Welcome card entry point.
 *
 * On mount:
 *  - If user has an active secretary membership → redirect /dashboard (wizard already done).
 *  - Else if audit_log has 'society.created' AND flats exist → redirect /setup/flats (resume Step 3).
 *  - Else if audit_log has 'society.created' (no flats yet) → redirect /setup/wings (resume Step 2).
 *  - Otherwise → show WelcomeCard with "Get Started" → /setup/society.
 */
export default function SetupRootPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const setupStore = useSetupState();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        // 1. Active secretary membership → already done
        const { data: membership } = await supabase
          .from("society_memberships")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "secretary")
          .eq("status", "active")
          .maybeSingle();

        if (membership) {
          router.replace("/dashboard");
          return;
        }

        // 2. Check audit_log for in-progress setup
        const { data: logRows } = await supabase
          .from("audit_log")
          .select("society_id")
          .eq("actor_id", user.id)
          .eq("action", "society.created")
          .order("created_at", { ascending: false })
          .limit(1);

        if (logRows && logRows.length > 0) {
          const societyId = logRows[0].society_id;
          // Check if flats exist (Step 3 was completed)
          const { count: flatCount } = await supabase
            .from("flats")
            .select("id", { count: "exact", head: true })
            .eq("society_id", societyId);

          if (flatCount && flatCount > 0) {
            router.replace("/setup/flats");
          } else {
            router.replace("/setup/wings");
          }
          return;
        }
      } catch {
        // Fall through to WelcomeCard
      } finally {
        setChecking(false);
      }
    }

    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-7rem)]">
      {/* Welcome Card */}
      <div className="w-full max-w-[560px] bg-[var(--color-neutral-0)] rounded-2xl shadow-sm p-8 flex flex-col items-center gap-6 text-center">
        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-brand-50,#f5f7ff)]">
          <Building2 size={48} className="text-[var(--color-brand-500)]" />
        </div>

        {/* Heading */}
        <div className="flex flex-col gap-3">
          <h1 className="text-[28px] font-semibold text-[var(--color-neutral-900)] leading-tight">
            {t("setup.welcome.heading")}
          </h1>
          <p className="text-base text-[var(--color-neutral-600)] leading-relaxed">
            {t("setup.welcome.body")}
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push("/setup/society")}
          className="w-full h-12 rounded-xl bg-[var(--color-brand-500)] text-white text-base font-semibold hover:opacity-90 transition-opacity"
        >
          {t("setup.welcome.cta")}
        </button>

        {/* Already set up note */}
        <p className="text-sm text-[var(--color-neutral-400)]">{t("setup.welcome.alreadySetup")}</p>
      </div>
    </div>
  );
}
