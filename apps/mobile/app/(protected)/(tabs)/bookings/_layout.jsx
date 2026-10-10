// A feature folder is ONE route of the (tabs) navigator, with its own stack for
// list → detail → new and normal back navigation. Without this layout every
// screen in the folder became a separate (unlabelled) tab button.
import { Stack } from "expo-router";

export default function FeatureStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
