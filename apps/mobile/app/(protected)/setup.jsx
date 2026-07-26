import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AmenitiesForm } from "../../components/setup/AmenitiesForm";
import { BoardForm } from "../../components/setup/BoardForm";
import { CodeShare } from "../../components/setup/CodeShare";
import { FlatsForm } from "../../components/setup/FlatsForm";
import { SocietyForm } from "../../components/setup/SocietyForm";
// Setup wizard step components (Steps 1–6)
import { WelcomeCard } from "../../components/setup/WelcomeCard";
import { WingsForm } from "../../components/setup/WingsForm";
import { useAuthStore } from "../../lib/auth-store";
import { getSupabase } from "../../lib/supabase";

/**
 * Secretary society-creation wizard (single screen, step state via useState).
 *
 * stepIndex:
 *   0 = WelcomeCard (entry)
 *   1 = Step 1: Society details (SocietyForm)
 *   2 = Step 2: Wings (WingsForm)
 *   3 = Step 3: Flats + Secretary flat (FlatsForm)
 *   4 = Step 4: Board members (BoardForm)
 *   5 = Step 5: Amenities (AmenitiesForm)
 *   6 = Step 6: Share code (CodeShare)
 */
export default function SetupScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);

  // ---------------------------------------------------------------------------
  // Wizard state — shared across all steps
  // ---------------------------------------------------------------------------
  const [stepIndex, setStepIndex] = useState(null); // null = loading
  const [societyId, setSocietyId] = useState(null);
  const [code, setCode] = useState("");
  const [coSecretaryFound, setCoSecretaryFound] = useState(false);
  const [wings, setWings] = useState([]);
  const [flatsByWing, setFlatsByWing] = useState({});
  const [boardMembers, setBoardMembers] = useState([]);
  const [amenities, setAmenities] = useState([]);

  const supabase = getSupabase();

  // ---------------------------------------------------------------------------
  // Mount: detect setup state
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function detectState() {
      if (!session?.user?.id) {
        // No session — auth guard handles redirect
        setStepIndex(0);
        return;
      }

      try {
        // 1. Check for active society membership (setup already complete)
        const { data: membership } = await supabase
          .from("society_memberships")
          .select("id, society_id")
          .eq("user_id", session.user.id)
          .eq("status", "active")
          .maybeSingle();

        if (membership) {
          // Already has active membership — skip wizard, go to dashboard
          router.replace("/(protected)/(tabs)");
          return;
        }

        // 2. Check audit_log for an in-progress society creation (Step 1 was done,
        //    app was closed before Step 3 finalization)
        const { data: auditRows } = await supabase
          .from("audit_log")
          .select("payload, created_at")
          .eq("actor_id", session.user.id)
          .eq("action", "society.created")
          .order("created_at", { ascending: false })
          .limit(1);

        if (auditRows && auditRows.length > 0) {
          const payload = auditRows[0].payload;
          const resumeSocietyId = payload?.society_id;
          if (resumeSocietyId) {
            // Check how far they got — do flats exist?
            const { count: flatCount } = await supabase
              .from("flats")
              .select("id", { count: "exact", head: true })
              .eq("society_id", resumeSocietyId);

            setSocietyId(resumeSocietyId);
            // Resume at step 2 (wings) if no flats yet, else step 3 (flats)
            setStepIndex(flatCount > 0 ? 3 : 2);
            return;
          }
        }

        // 3. No in-progress setup — show Welcome card
        setStepIndex(0);
      } catch {
        // Default to Welcome on any error
        setStepIndex(0);
      }
    }

    detectState();
  }, [session?.user?.id]);

  // ---------------------------------------------------------------------------
  // Step handlers
  // ---------------------------------------------------------------------------

  // Step 1 complete: society created
  function handleStep1Next({ societyId: sid, code: c, coSecretaryFound: csf }) {
    setSocietyId(sid);
    setCode(c);
    setCoSecretaryFound(csf);
    setStepIndex(2);
  }

  // Step 2 complete: wings collected in local state (NO DB write)
  function handleStep2Next({ wings: w }) {
    setWings(w);
    setStepIndex(3);
  }

  // Step 3 complete: flats bootstrapped + finalized
  function handleStep3Next({ flats }) {
    // flats is an array of { id, wing_name, number } from bootstrapSocietyStructure result
    // Group into flatsByWing for later use (BoardForm flat picker)
    const byWing = {};
    (flats ?? []).forEach((f) => {
      if (!byWing[f.wing_name]) byWing[f.wing_name] = [];
      byWing[f.wing_name].push(f);
    });
    setFlatsByWing(byWing);
    setStepIndex(4);
  }

  // Step 4 complete (or skipped)
  function handleStep4Next(members) {
    setBoardMembers(members ?? []);
    setStepIndex(5);
  }

  // Step 5 complete (or skipped)
  function handleStep5Next(selectedAmenities) {
    setAmenities(selectedAmenities ?? []);
    setStepIndex(6);
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (stepIndex === null) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render step
  // ---------------------------------------------------------------------------

  // Step 0: Welcome card
  if (stepIndex === 0) {
    return <WelcomeCard onStart={() => setStepIndex(1)} />;
  }

  // Step 1: Society details
  if (stepIndex === 1) {
    return (
      <View className="flex-1 bg-neutral-50">
        <SocietyForm
          supabase={supabase}
          secretaryPhone={session?.user?.phone ? `+${session.user.phone}` : ""}
          onNext={handleStep1Next}
        />
      </View>
    );
  }

  // Step 2: Wings
  if (stepIndex === 2) {
    return (
      <View className="flex-1 bg-neutral-50">
        <WingsForm onNext={handleStep2Next} onBack={() => setStepIndex(1)} />
      </View>
    );
  }

  // Step 3: Flats + Secretary flat selection
  if (stepIndex === 3) {
    return (
      <View className="flex-1 bg-neutral-50">
        <FlatsForm
          supabase={supabase}
          societyId={societyId}
          wings={wings}
          onNext={handleStep3Next}
          onBack={() => setStepIndex(2)}
        />
      </View>
    );
  }

  // Step 4: Board members
  if (stepIndex === 4) {
    return (
      <View className="flex-1 bg-neutral-50">
        <BoardForm
          supabase={supabase}
          societyId={societyId}
          flatsByWing={flatsByWing}
          coSecPhone={
            // Derive co-sec phone from session if needed — stored in society row
            // The BoardForm uses this to warn if the user tries to add the co-sec
            null
          }
          onNext={handleStep4Next}
          onBack={() => setStepIndex(3)}
          onSkip={() => handleStep4Next([])}
        />
      </View>
    );
  }

  // Step 5: Amenities
  if (stepIndex === 5) {
    return (
      <View className="flex-1 bg-neutral-50">
        <AmenitiesForm
          supabase={supabase}
          societyId={societyId}
          onNext={handleStep5Next}
          onBack={() => setStepIndex(4)}
          onSkip={() => handleStep5Next([])}
        />
      </View>
    );
  }

  // Step 6: Share code
  if (stepIndex === 6) {
    return (
      <View className="flex-1 bg-neutral-50">
        <CodeShare code={code} />
      </View>
    );
  }

  // Fallback
  return null;
}
