import { Check } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

/**
 * WizardProgress — horizontal step indicator for the Secretary setup wizard.
 * Uses horizontal ScrollView so circles never wrap on narrow screens.
 *
 * Props:
 *   currentStep  {number}  1-indexed step the user is currently on
 *   totalSteps   {number}  total number of steps (default 6)
 */
export function WizardProgress({ currentStep, totalSteps = 6 }) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="items-center px-4 py-3"
    >
      <View className="flex-row items-center">
        {steps.map((step, idx) => {
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;

          let circleBg = "bg-neutral-200";
          let textColor = "text-neutral-600";
          if (isActive) {
            circleBg = "bg-brand-500";
            textColor = "text-white";
          }
          if (isCompleted) {
            circleBg = "bg-success-500";
            textColor = "text-white";
          }

          return (
            <View key={step} className="flex-row items-center">
              {/* Step circle */}
              <View
                className={`w-7 h-7 rounded-full items-center justify-center ${circleBg}`}
                accessibilityRole="image"
                accessibilityLabel={
                  `Step ${step}` + (isCompleted ? " completed" : isActive ? " current" : "")
                }
              >
                {isCompleted ? (
                  <Check size={14} color="white" />
                ) : (
                  <Text className={`text-sm font-semibold ${textColor}`}>{step}</Text>
                )}
              </View>

              {/* Connecting line between circles */}
              {idx < totalSteps - 1 && (
                <View
                  className={`w-8 h-0.5 mx-1 ${isCompleted ? "bg-success-500" : "bg-neutral-200"}`}
                />
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
