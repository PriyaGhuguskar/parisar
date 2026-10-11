// apps/mobile/app/(protected)/_layout.jsx
// Signed-in stack. Keeps each account kind on its own screens (lib/route-guard):
// gate guards and Parisar staff are sent away from the resident tabs, and
// residents away from /guard, /staff and /structure. Unknown state → allowed.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Redirect, Stack, useSegments } from "expo-router";
import { protectedRedirect, useLoginState } from "../../lib/route-guard";

export default function ProtectedLayout() {
  const segments = useSegments();
  const loginState = useLoginState();
  const redirect = protectedRedirect(segments[1], loginState);

  if (redirect) return <Redirect href={redirect} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
