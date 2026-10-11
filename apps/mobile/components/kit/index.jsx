// apps/mobile/components/kit/index.jsx
// Mobile equivalents of the website's components/kit primitives (SurfaceCard,
// StatusPill, PageHeader, EmptyState) so screens ported from the website share
// one design language: white cards with a hairline border and 12–14px radius,
// tinted status pills, a back-link page header.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import { ArrowLeft, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

// Same tones as the website's StatusPill.
const TONES = {
  done: { bg: "#DCEFE6", fg: "#0A4436" },
  neutral: { bg: "#F1F5F9", fg: "#475569" },
  progress: { bg: "#FDF0DF", fg: "#8A4708" },
  danger: { bg: "#FCE9E6", fg: "#94291A" },
  open: { bg: "#E7F0FB", fg: "#1F5FA0" },
};

export function StatusPill({ tone = "neutral", children }) {
  const c = TONES[tone] ?? TONES.neutral;
  return (
    <View className="self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: c.bg }}>
      <Text className="text-xs font-semibold" style={{ color: c.fg }}>
        {children}
      </Text>
    </View>
  );
}

export function SurfaceCard({ children, className = "", onPress, ...rest }) {
  const cls = `rounded-2xl border border-neutral-200 bg-neutral-0 p-4 ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" className={cls} {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <View className={cls} {...rest}>
      {children}
    </View>
  );
}

/** Back link + title + optional lead + optional right-side action. */
export function PageHeader({ title, description, backLabel, backHref, action }) {
  const router = useRouter();
  return (
    <View className="gap-1.5 pb-4">
      {backLabel ? (
        <Pressable
          onPress={() => (backHref ? router.replace(backHref) : router.back())}
          accessibilityRole="button"
          className="flex-row items-center gap-1 self-start py-1"
        >
          <ArrowLeft size={14} color="#475569" />
          <Text className="text-sm font-semibold text-neutral-600">{backLabel}</Text>
        </Pressable>
      ) : null}
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-2xl font-semibold text-neutral-900">{title}</Text>
        {action ?? null}
      </View>
      {description ? <Text className="text-base text-neutral-600">{description}</Text> : null}
    </View>
  );
}

export function SectionTitle({ title, lead, action }) {
  return (
    <View className="gap-1 pb-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-lg font-semibold text-neutral-900">{title}</Text>
        {action ?? null}
      </View>
      {lead ? <Text className="text-sm text-neutral-600">{lead}</Text> : null}
    </View>
  );
}

/** Tappable row with an icon well, label and chevron (website "manage" links). */
export function LinkRow({ icon: Icon, label, onPress }) {
  return (
    <SurfaceCard onPress={onPress} className="flex-row items-center gap-3 py-3.5">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
        <Icon size={18} color="#12715A" />
      </View>
      <Text className="flex-1 text-base font-semibold text-neutral-900">{label}</Text>
      <ChevronRight size={18} color="#94A3B8" />
    </SurfaceCard>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <View className="items-center gap-2 rounded-2xl border border-dashed border-neutral-200 px-6 py-8">
      {Icon ? <Icon size={28} color="#94A3B8" /> : null}
      <Text className="text-center text-base font-semibold text-neutral-900">{title}</Text>
      {body ? <Text className="text-center text-sm text-neutral-600">{body}</Text> : null}
      {action ?? null}
    </View>
  );
}

export function SmallButton({ label, icon: Icon, onPress, tone = "brand", disabled }) {
  const solid = tone === "brand";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center gap-1.5 rounded-xl px-3.5 py-2 ${
        solid ? "bg-brand-600" : "border border-neutral-200 bg-neutral-0"
      }`}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      {Icon ? <Icon size={15} color={solid ? "#fff" : "#0E5A48"} /> : null}
      <Text className={`text-sm font-semibold ${solid ? "text-neutral-0" : "text-brand-600"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Back arrow for screen headers — the website's ArrowLeft in slate. */
export function BackArrow() {
  return <ArrowLeft size={20} color="#475569" />;
}
