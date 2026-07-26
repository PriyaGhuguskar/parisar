import { AlertTriangle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

/**
 * DestructiveConfirmDialog — typed-name gate for irreversible actions (mobile).
 * Uses RN Modal with animationType="slide" + presentationStyle="pageSheet".
 *
 * Props:
 *   open               {boolean}   controlled open state
 *   onClose            {Function}  called when dialog should close
 *   title              {string}    dialog heading
 *   body               {string}    explanatory paragraph
 *   confirmMatchText   {string}    the text the user must type to enable Confirm
 *   confirmMatchLabel  {string}    label above the typed-name input
 *   confirmButtonLabel {string}    label for the destructive confirm button
 *   cancelLabel        {string}    label for cancel (default "Cancel")
 *   mismatchError      {string}    inline error when text doesn't match
 *   onConfirm          {Function}  called when name matches and user confirms
 *   isLoading          {boolean}   shows loading state on confirm button
 */
export function DestructiveConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmMatchText,
  confirmMatchLabel,
  confirmButtonLabel,
  cancelLabel = "Cancel",
  mismatchError = "Name does not match.",
  onConfirm,
  isLoading = false,
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);

  // Reset typed name and auto-focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTyped("");
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const matches = typed.trim().toLowerCase() === (confirmMatchText ?? "").trim().toLowerCase();
  const showMismatch = typed.length > 0 && !matches;

  const canConfirm = matches && !isLoading;

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => !isLoading && onClose()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-neutral-50"
      >
        <View className="flex-1 p-6">
          {/* Header */}
          <View className="flex-row items-center gap-2 mb-3">
            <AlertTriangle size={24} color="#c81e1e" />
            <Text className="text-xl font-semibold text-danger-500 flex-1" numberOfLines={2}>
              {title}
            </Text>
          </View>

          {/* Body */}
          <Text className="text-base text-neutral-700 mb-6">{body}</Text>

          {/* Typed-name input */}
          <View className="gap-2 mb-4">
            <Text className="text-sm text-neutral-600">{confirmMatchLabel}</Text>
            <TextInput
              ref={inputRef}
              value={typed}
              onChangeText={setTyped}
              editable={!isLoading}
              autoCorrect={false}
              autoCapitalize="none"
              className="h-12 px-3 rounded-lg border border-neutral-200 bg-white text-base text-neutral-900"
              accessibilityLabel={confirmMatchLabel}
            />
            {showMismatch && (
              <Text accessibilityRole="alert" className="text-sm text-danger-500">
                {mismatchError}
              </Text>
            )}
          </View>

          {/* Action buttons — pushed to bottom */}
          <View className="mt-auto gap-3">
            <Pressable
              disabled={!canConfirm}
              onPress={() => canConfirm && onConfirm()}
              className={`h-14 rounded-xl items-center justify-center ${
                canConfirm ? "bg-danger-500" : "bg-neutral-200"
              }`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className={`font-semibold text-base ${
                    canConfirm ? "text-white" : "text-neutral-400"
                  }`}
                >
                  {confirmButtonLabel}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => !isLoading && onClose()}
              disabled={isLoading}
              className="h-12 items-center justify-center"
              accessibilityRole="button"
            >
              <Text className="text-neutral-600 text-base">{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
