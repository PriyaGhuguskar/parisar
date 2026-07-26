"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ProfileForm from "../../../../components/join/ProfileForm";
import { useJoinState } from "../../../../lib/join-state";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

/**
 * /join/profile — Profile form page.
 *
 * Guards against missing Zustand state (user refreshed the page without a valid code).
 * Loads the user's current profile for pre-filling name + phone.
 */
export default function JoinProfilePage() {
  const router = useRouter();
  const joinStore = useJoinState();

  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Guard: if no society in store, go back to code entry
  useEffect(() => {
    if (!joinStore.society) {
      router.replace("/join/code");
      return;
    }

    // Load user profile for pre-fill
    async function loadProfile() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .single();

        // PAR-004: own phone comes from the session (auth.users.phone), never the
        // column-restricted profiles.phone.
        setUserProfile({
          full_name: profile?.full_name ?? "",
          phone: user.phone ? `+${user.phone}` : "",
          userId: user.id,
        });
      } catch {
        // Non-critical — form still renders with empty pre-fill
        setUserProfile({ full_name: "", phone: "", userId: null });
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-spin w-6 h-6 rounded-full border-2 border-[var(--color-brand-500)] border-t-transparent" />
      </div>
    );
  }

  if (!joinStore.society) {
    // Redirecting — render nothing
    return null;
  }

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <ProfileForm userProfile={userProfile} />
      </div>
    </div>
  );
}
