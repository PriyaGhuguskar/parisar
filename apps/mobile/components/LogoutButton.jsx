import { LogOut } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";
import { useAuthStore } from "../lib/auth-store";

/**
 * One-tap logout button. Renders on all protected screens.
 * - LogOut icon (18px danger.500) + auth.logout text (14px danger.500)
 * - No confirmation dialog (UI-SPEC D4 — logout is reversible)
 * - Calls useAuthStore().signOut() which triggers Stack.Protected redirect
 */
export function LogoutButton() {
  const { t } = useTranslation("auth");
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <TouchableOpacity
      onPress={signOut}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t("auth.logout")}
      className="flex-row items-center gap-1 p-2"
    >
      <LogOut size={18} color="#c81e1e" />
      <Text className="text-sm text-danger-500">{t("auth.logout")}</Text>
    </TouchableOpacity>
  );
}
