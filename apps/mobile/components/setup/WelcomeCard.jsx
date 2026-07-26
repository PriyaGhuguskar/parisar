import { Building2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { PrimaryButton } from "../auth/PrimaryButton";

/**
 * WelcomeCard — entry point of the Secretary society-creation wizard.
 *
 * Props:
 *   onStart {function}  Called when the user taps "Get Started"
 */
export function WelcomeCard({ onStart }) {
  const { t } = useTranslation("auth");
  return (
    <View className="flex-1 bg-neutral-50 items-center justify-center px-6">
      <View className="bg-white rounded-2xl p-8 w-full shadow-sm">
        {/* Building icon */}
        <View className="items-center mb-4">
          <Building2 size={48} color="#12715A" />
        </View>

        {/* Heading */}
        <Text className="text-3xl font-semibold text-neutral-900 text-center mb-3">
          {t("setup.welcome.heading")}
        </Text>

        {/* Illustration placeholder — apartment-block outline (SVG lines) */}
        <View className="items-center my-4" accessibilityElementsHidden={true}>
          <ApartmentIllustration />
        </View>

        {/* Body */}
        <Text className="text-base text-neutral-600 text-center mb-8">
          {t("setup.welcome.body")}
        </Text>

        {/* CTA */}
        <PrimaryButton label={t("setup.welcome.cta")} onPress={onStart} />

        {/* Already set up? */}
        <Text className="text-sm text-neutral-400 text-center mt-4">
          {t("setup.welcome.alreadySetup")}
        </Text>
      </View>
    </View>
  );
}

/**
 * Simple SVG apartment-block outline — neutral.200 strokes.
 */
function ApartmentIllustration() {
  try {
    const { Svg, Rect, Line } = require("react-native-svg");
    return (
      <Svg width={200} height={80} viewBox="0 0 200 80">
        {/* Building A — tall */}
        <Rect
          x="20"
          y="10"
          width="50"
          height="65"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="2"
          rx="2"
        />
        <Rect x="30" y="20" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />
        <Rect x="50" y="20" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />
        <Rect x="30" y="38" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />
        <Rect x="50" y="38" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />
        <Rect x="30" y="56" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />
        <Rect x="50" y="56" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />

        {/* Building B — shorter */}
        <Rect
          x="80"
          y="25"
          width="45"
          height="50"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="2"
          rx="2"
        />
        <Rect x="90" y="35" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />
        <Rect
          x="106"
          y="35"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />
        <Rect x="90" y="53" width="10" height="10" fill="none" stroke="#e5e5e5" strokeWidth="1.5" />
        <Rect
          x="106"
          y="53"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />

        {/* Building C — medium */}
        <Rect
          x="135"
          y="15"
          width="45"
          height="60"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="2"
          rx="2"
        />
        <Rect
          x="145"
          y="25"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />
        <Rect
          x="161"
          y="25"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />
        <Rect
          x="145"
          y="43"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />
        <Rect
          x="161"
          y="43"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />
        <Rect
          x="145"
          y="61"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />
        <Rect
          x="161"
          y="61"
          width="10"
          height="10"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.5"
        />

        {/* Ground line */}
        <Line x1="10" y1="76" x2="190" y2="76" stroke="#e5e5e5" strokeWidth="1.5" />
      </Svg>
    );
  } catch {
    return null;
  }
}
