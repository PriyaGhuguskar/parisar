// PollBuilder — optional 2-4 option poll builder embedded in the NoticeComposer.
//
// Visual contract per 05-UI-SPEC.md Screen 2 (Poll builder).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { BarChart3, Plus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";

const QUESTION_MAX = 200;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const BRAND_500 = "#12715A";
const DANGER_500 = "#c81e1e";

/**
 * @param {{
 *   value: { active: boolean, question: string, options: string[] },
 *   onChange: (next: { active: boolean, question: string, options: string[] }) => void,
 * }} props
 */
export function PollBuilder({ value, onChange }) {
  const { t } = useTranslation(["polls", "notifications"]);
  const { active, question, options } = value;

  function open() {
    onChange({ active: true, question: "", options: ["", ""] });
  }

  function removePoll() {
    onChange({ active: false, question: "", options: ["", ""] });
  }

  function setQuestion(q) {
    onChange({ ...value, question: q });
  }

  function setOption(index, text) {
    const next = options.slice();
    next[index] = text;
    onChange({ ...value, options: next });
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    onChange({ ...value, options: [...options, ""] });
  }

  function removeOption(index) {
    if (options.length <= MIN_OPTIONS) return;
    const next = options.filter((_, i) => i !== index);
    onChange({ ...value, options: next });
  }

  // The "Add a poll" CTA label lives in the notifications shard (notice.addPoll).
  const addPollLabel = t("notifications:notice.addPoll", { defaultValue: "Add a poll" });

  // ---- Collapsed: ghost "Add a poll" ----
  if (!active) {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={addPollLabel}
        className="flex-row items-center justify-center gap-2 rounded-xl border border-brand-500"
        style={{ minHeight: 44, borderColor: BRAND_500 }}
      >
        <BarChart3 size={16} color={BRAND_500} />
        <Text className="text-sm font-semibold" style={{ color: BRAND_500 }}>
          {addPollLabel}
        </Text>
      </Pressable>
    );
  }

  // ---- Expanded: brand.50 sub-card ----
  return (
    <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: "#f5f7ff" }}>
      {/* Poll question */}
      <View className="gap-1">
        <Text className="text-sm text-neutral-600">{t("polls:poll.questionLabel")}</Text>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder={t("polls:poll.questionPlaceholder")}
          placeholderTextColor="#6e6e6e"
          maxLength={QUESTION_MAX}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
          accessibilityLabel={t("polls:poll.questionLabel")}
        />
      </View>

      {/* Option rows */}
      {options.map((opt, index) => {
        const optLabel = t("polls:poll.optionPlaceholder", { n: String(index + 1) });
        return (
          <View key={`opt-${index}`} className="flex-row items-center gap-2">
            <TextInput
              value={opt}
              onChangeText={(v) => setOption(index, v)}
              placeholder={optLabel}
              placeholderTextColor="#6e6e6e"
              maxLength={120}
              className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
              style={{ minHeight: 44 }}
              accessibilityLabel={optLabel}
            />
            {/* Remove only allowed on rows beyond the minimum (rows 3-4) */}
            {options.length > MIN_OPTIONS ? (
              <Pressable
                onPress={() => removeOption(index)}
                accessibilityRole="button"
                accessibilityLabel={`Remove option ${index + 1}`}
                className="items-center justify-center"
                style={{ width: 44, height: 44 }}
              >
                <X size={18} color="#525252" />
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {/* Add option — hidden at MAX_OPTIONS */}
      {options.length < MAX_OPTIONS ? (
        <Pressable
          onPress={addOption}
          accessibilityRole="button"
          accessibilityLabel={t("polls:poll.addOption")}
          className="flex-row items-center gap-2 rounded-xl border border-brand-500 px-3"
          style={{ minHeight: 44, alignSelf: "flex-start", borderColor: BRAND_500 }}
        >
          <Plus size={16} color={BRAND_500} />
          <Text className="text-sm font-semibold" style={{ color: BRAND_500 }}>
            {t("polls:poll.addOption")}
          </Text>
        </Pressable>
      ) : null}

      {/* Remove poll */}
      <Pressable
        onPress={removePoll}
        accessibilityRole="button"
        accessibilityLabel={t("polls:poll.removePoll")}
        className="items-start"
        style={{ minHeight: 32 }}
      >
        <Text className="text-sm font-semibold" style={{ color: DANGER_500 }}>
          {t("polls:poll.removePoll")}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Normalize a PollBuilder value into the { pollQuestion, pollOptions } the
 * fileNotification RPC expects. Trims whitespace, drops empty trailing options,
 * and returns nulls when the poll is inactive or invalid (so the composer can
 * decide whether to surface a validation error).
 *
 * @param {{ active: boolean, question: string, options: string[] }} value
 * @returns {{ pollQuestion: string|null, pollOptions: string[]|null, valid: boolean }}
 */
export function normalizePoll(value) {
  if (!value?.active) {
    return { pollQuestion: null, pollOptions: null, valid: true };
  }
  const question = (value.question ?? "").trim();
  const options = (value.options ?? []).map((o) => (o ?? "").trim()).filter(Boolean);
  const valid =
    question.length >= 3 && options.length >= MIN_OPTIONS && options.length <= MAX_OPTIONS;
  return {
    pollQuestion: question || null,
    pollOptions: options.length ? options : null,
    valid,
  };
}
