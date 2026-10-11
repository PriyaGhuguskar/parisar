import { fetchJoinPercent } from "@parisar/api-client";
import { CheckCircle2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";

/**
 * JoinedPercentGauge — polled join-% card for the Secretary onboarding dashboard (mobile).
 * Pauses polling via AppState when the app goes to background to preserve battery + data.
 *
 * Props:
 *   societyId       {string}
 *   pollIntervalMs  {number}
 */
export function JoinedPercentGauge({ societyId, pollIntervalMs = 30000 }) {
  const { t } = useTranslation("auth");
  const [percent, setPercent] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    async function load() {
      try {
        const p = await fetchJoinPercent(supabase, societyId);
        if (!cancelled) setPercent(p);
      } catch {
        // silent — keep prior value
      }
    }

    function start() {
      if (intervalRef.current) return; // already running
      load();
      intervalRef.current = setInterval(load, pollIntervalMs);
    }

    function stop() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Start polling immediately (app is active on mount)
    start();

    // Pause when backgrounded; resume when foregrounded
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        start();
      } else {
        stop();
      }
    });

    return () => {
      cancelled = true;
      stop();
      appStateSub.remove();
    };
  }, [societyId, pollIntervalMs]);

  const complete = percent === 100;

  return (
    <View className="bg-white rounded-2xl p-6">
      <Text className="text-xl font-semibold text-neutral-900 mb-3">
        {complete ? t("dashboard.joinedPercent.complete") : t("dashboard.joinedPercent.heading")}
      </Text>

      {percent === null ? (
        /* Loading placeholder */
        <View
          className="h-3 w-full rounded-full bg-neutral-100"
          accessibilityLabel="Loading join percentage"
        />
      ) : (
        <>
          {/* Progress bar track + fill */}
          <View className="h-3 w-full rounded-full bg-neutral-100 overflow-hidden mb-3">
            <View
              className={complete ? "h-3 bg-success-500" : "h-3 bg-brand-500"}
              style={{ width: `${percent}%` }}
              accessibilityRole="progressbar"
              accessibilityValue={{ now: percent, min: 0, max: 100 }}
            />
          </View>

          <View className="flex-row items-baseline gap-2">
            <Text
              className={`text-3xl font-semibold ${
                complete ? "text-success-500" : "text-brand-500"
              }`}
            >
              {percent}%
            </Text>
            {complete && <CheckCircle2 size={20} color="#047857" />}
          </View>
        </>
      )}
    </View>
  );
}
