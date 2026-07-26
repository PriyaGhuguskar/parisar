import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Check, CircleCheck, Copy, Share2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Share, Text, TouchableOpacity, View } from "react-native";
import { WizardProgress } from "./WizardProgress";

// WhatsApp green — per UI-SPEC, this is an intentional brand-color exception
const WHATSAPP_GREEN = "#16a34a";

// Deep link for joining a society
function buildJoinUrl(code) {
  if (__DEV__) {
    // Use the Expo dev URL scheme in development (parisar:// deep link)
    return `parisar://join?code=${encodeURIComponent(code)}`;
  }
  return `https://parisar.app/join?code=${encodeURIComponent(code)}`;
}

/**
 * CodeShare — Step 6 (final step) of the Secretary wizard.
 */
export function CodeShare({ code }) {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareWhatsApp() {
    const joinUrl = buildJoinUrl(code);
    const message = t("setup.shareMessage", { link: joinUrl });
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    try {
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        // Fallback to native share sheet
        await Share.share({ message });
      }
    } catch {
      // Last-resort fallback
      await Share.share({ message });
    }
  }

  return (
    <ScrollView contentContainerClassName="pb-8 px-4 pt-2" showsVerticalScrollIndicator={false}>
      {/* Progress (step 6 = all complete) */}
      <WizardProgress currentStep={7} totalSteps={6} />

      {/* Step card */}
      <View className="bg-white rounded-2xl p-6 shadow-sm mt-2 items-center">
        {/* Success icon */}
        <CircleCheck size={48} color="#047857" style={{ marginBottom: 16 }} />

        {/* Heading */}
        <Text className="text-3xl font-semibold text-neutral-900 text-center mb-3">
          {t("setup.step6.heading")}
        </Text>

        {/* Body */}
        <Text className="text-base text-neutral-600 text-center mb-6">{t("setup.step6.body")}</Text>

        {/* Society Code display block */}
        <View className="bg-neutral-100 rounded-2xl p-6 w-full items-center mb-6">
          <Text
            className="text-brand-500 font-semibold tracking-widest text-3xl"
            style={{
              fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
              letterSpacing: 6,
            }}
            accessibilityLabel={`Society code: ${code}`}
            selectable
          >
            {code}
          </Text>

          {/* Copy button */}
          <TouchableOpacity
            onPress={handleCopy}
            className={[
              "flex-row items-center gap-2 mt-4 px-4 py-2 rounded-lg border",
              copied ? "border-success-500 bg-green-50" : "border-neutral-300 bg-white",
            ].join(" ")}
            accessibilityRole="button"
            accessibilityLabel={copied ? t("setup.step6.copied") : t("setup.step6.copyCode")}
          >
            {copied ? <Check size={16} color="#047857" /> : <Copy size={16} color="#737373" />}
            <Text
              className={[
                "text-sm font-medium",
                copied ? "text-success-500" : "text-neutral-700",
              ].join(" ")}
            >
              {copied ? t("setup.step6.copied") : t("setup.step6.copyCode")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Share via WhatsApp button */}
        <TouchableOpacity
          onPress={handleShareWhatsApp}
          activeOpacity={0.85}
          className="w-full h-14 rounded-xl items-center justify-center flex-row gap-3 mb-4"
          style={{ backgroundColor: WHATSAPP_GREEN }}
          accessibilityRole="button"
          accessibilityLabel={t("setup.step6.shareWhatsApp")}
        >
          {/* WhatsApp logo (inline SVG path via react-native-svg) */}
          <WhatsAppIcon />
          <Text className="text-base font-semibold text-white">
            {t("setup.step6.shareWhatsApp")}
          </Text>
        </TouchableOpacity>

        {/* Go to Dashboard */}
        <TouchableOpacity
          onPress={() => router.replace("/(protected)/(tabs)")}
          className="w-full h-14 rounded-xl border border-neutral-200 items-center justify-center"
          accessibilityRole="button"
        >
          <Text className="text-base font-medium text-neutral-900">
            {t("setup.step6.goToDashboard")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/**
 * WhatsAppIcon — minimal inline SVG of the WhatsApp logo.
 */
function WhatsAppIcon() {
  try {
    const { Svg, Path } = require("react-native-svg");
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="white">
        <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </Svg>
    );
  } catch {
    return <Share2 size={22} color="white" />;
  }
}
