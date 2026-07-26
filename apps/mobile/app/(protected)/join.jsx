import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { CodeEntry } from "../../components/join/CodeEntry";
import { JoinPending } from "../../components/join/JoinPending";
import { JoinSuccess } from "../../components/join/JoinSuccess";
import { ProfileForm } from "../../components/join/ProfileForm";
import { SocietyPreview } from "../../components/join/SocietyPreview";
import { getSupabase } from "../../lib/supabase";

/**
 * Member Join Flow — single-screen wizard.
 *
 * Steps:
 *   0 — CodeEntry    (type / deep-link code)
 *   1 — SocietyPreview (confirm the society)
 *   2 — ProfileForm  (resident type, flat, family)
 *   3 — JoinSuccess OR JoinPending (decided by joinResult.status)
 *
 * Deep link: parisar://join?code=PAR7-XKM2 pre-fills the CodeEntry input
 * via useLocalSearchParams().code.
 */
export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Step state: 0..3
  const [stepIndex, setStepIndex] = useState(0);

  // Combined preview + structure payload from CodeEntry
  const [preview, setPreview] = useState(null); // { society_id, name, address, member_count }
  const [structure, setStructure] = useState(null); // { society_id, wings, flats }
  const [code, setCode] = useState(params.code ?? ""); // formatted code string

  // Profile + result
  const [userProfile, setUserProfile] = useState(null);
  const [joinResult, setJoinResult] = useState(null);

  // On mount: load user profile + check for existing membership
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Load profile for pre-filling name. PAR-004: own phone comes from the
      // session (auth.users.phone), never the column-restricted profiles.phone.
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      if (!cancelled) {
        setUserProfile({
          full_name: profile?.full_name ?? "",
          phone: user.phone ? `+${user.phone}` : "",
          userId: user.id,
        });
      }

      // Check for existing active or pending membership
      const { data: membership } = await supabase
        .from("society_memberships")
        .select("id, status")
        .eq("user_id", user.id)
        .in("status", ["active", "pending_review"])
        .limit(1)
        .single();

      if (!cancelled && membership) {
        // Already joined — redirect to dashboard
        router.replace("/(protected)/(tabs)");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Callback from CodeEntry when code is validated + structure loaded
  function handleCodeValid({ preview: p, structure: s, code: validatedCode }) {
    setPreview(p);
    setStructure(s);
    // Store the formatted code for ProfileForm to use
    if (validatedCode) setCode(validatedCode);
    setStepIndex(1);
  }

  // Callback from SocietyPreview "Yes, join"
  function handleConfirmSociety() {
    setStepIndex(2);
  }

  // Callback from SocietyPreview "Wrong society?"
  function handleWrongSociety() {
    setPreview(null);
    setStructure(null);
    setStepIndex(0);
  }

  // Callback from ProfileForm when join is complete
  function handleJoin(result) {
    setJoinResult(result);
    setStepIndex(3);
  }

  return (
    <AuthShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {stepIndex === 0 && (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <CodeEntry initialCode={params.code ?? ""} onValid={handleCodeValid} />
          </ScrollView>
        )}

        {stepIndex === 1 && (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <SocietyPreview
              preview={preview}
              onConfirm={handleConfirmSociety}
              onWrong={handleWrongSociety}
            />
          </ScrollView>
        )}

        {stepIndex === 2 && (
          <ProfileForm
            code={code}
            preview={preview}
            structure={structure}
            userProfile={userProfile}
            onJoin={handleJoin}
          />
        )}

        {stepIndex === 3 && joinResult?.status === "active" && (
          <JoinSuccess
            societyName={joinResult.societyName}
            name={userProfile?.full_name ?? ""}
            autoElevatedToCoSecretary={joinResult.autoElevatedToCoSecretary}
          />
        )}

        {stepIndex === 3 && joinResult?.status === "pending_review" && (
          <JoinPending flatNumber={joinResult.flatNumber} />
        )}
      </KeyboardAvoidingView>
    </AuthShell>
  );
}
