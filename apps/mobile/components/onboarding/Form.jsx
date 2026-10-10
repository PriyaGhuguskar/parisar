// apps/mobile/components/onboarding/Form.jsx
// Small form pieces shared by the onboarding and wings/flats setup screens,
// styled like the existing auth screens (AuthShell / PrimaryButton / FormError).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

export function Field({ label, hint, children }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-neutral-900">{label}</Text>
      {children}
      {hint ? <Text className="text-xs text-neutral-600">{hint}</Text> : null}
    </View>
  );
}

export function TextField({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholderTextColor="#6e6e6e"
      className={[
        "h-12 rounded-lg bg-neutral-0 px-3 text-base text-neutral-900",
        focused ? "border-2 border-brand-700" : "border border-neutral-200",
        props.editable === false ? "bg-neutral-100 text-neutral-600" : "",
      ].join(" ")}
      style={style}
    />
  );
}

export function StepHeader({ title, sub, onBack, backLabel }) {
  return (
    <View className="gap-2">
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          className="flex-row items-center gap-1 self-start py-1"
        >
          <ArrowLeft size={14} color="#4A5C50" />
          <Text className="text-sm font-semibold text-neutral-600">{backLabel}</Text>
        </Pressable>
      ) : null}
      <Text className="text-2xl font-semibold text-neutral-900">{title}</Text>
      {sub ? <Text className="text-base text-neutral-600">{sub}</Text> : null}
    </View>
  );
}

export function Progress({ step, total }) {
  return (
    <View className="flex-row gap-1.5 pt-6 pb-2">
      {Array.from({ length: total }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed positional segments
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-brand-500" : "bg-neutral-200"}`}
        />
      ))}
    </View>
  );
}

/** Two-or-more-way choice as tappable cards (owner/tenant, toggles). */
export function Choice({ options, value, onChange }) {
  return (
    <View className="flex-row gap-2">
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable
            key={String(v)}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            className={[
              "flex-1 items-center rounded-lg border px-3 py-3",
              on ? "border-brand-500 bg-brand-50" : "border-neutral-200 bg-neutral-0",
            ].join(" ")}
          >
            <Text className={`text-sm font-semibold ${on ? "text-brand-700" : "text-neutral-600"}`}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DashedButton({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="items-center rounded-lg border border-dashed border-neutral-200 py-2.5"
    >
      <Text className="text-sm font-semibold text-brand-600">+ {label}</Text>
    </Pressable>
  );
}
