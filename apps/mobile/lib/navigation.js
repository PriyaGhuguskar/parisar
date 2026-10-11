// apps/mobile/lib/navigation.js
// Navigation helpers shared by screens.
//
// goBack(): `router.back()` on a screen opened from a push notification, a
// deep link or a `router.replace` has nothing to go back to — expo-router then
// logs "The action 'GO_BACK' was not handled" and the button does nothing.
// goBack() goes back when there is history and otherwise replaces the screen
// with a sensible fallback (Home by default).
//
// JavaScript only — no TypeScript per CLAUDE.md.

export const HOME_ROUTE = "/(protected)/(tabs)";

/**
 * @param {{ back: Function, canGoBack?: Function, replace?: Function }} router
 * @param {string} [fallback] route to show when there is no history
 */
export function goBack(router, fallback = HOME_ROUTE) {
  if (!router) return;
  // Older routers / test doubles without canGoBack: keep the plain back().
  if (typeof router.canGoBack !== "function") {
    router.back?.();
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace?.(fallback);
}
