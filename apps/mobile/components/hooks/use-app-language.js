// useAppLanguage — the active i18next language, re-rendering on change.
//
// Subscribes straight to the app's i18next singleton (lib/i18n.js) through
// useSyncExternalStore instead of useTranslation(), so leaf components such as
// the shared <Text> wrapper don't trigger namespace loading or re-render on
// unrelated i18next events. Falls back to "en" before i18n is initialised (and
// in tests that mock lib/i18n).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useSyncExternalStore } from "react";
import * as appI18n from "../../lib/i18n";

const FALLBACK_LANGUAGE = "en";

function currentI18n() {
  return typeof appI18n.getI18n === "function" ? appI18n.getI18n() : null;
}

function subscribe(onChange) {
  const i18n = currentI18n();
  if (!i18n || typeof i18n.on !== "function") return () => {};
  i18n.on("languageChanged", onChange);
  return () => {
    if (typeof i18n.off === "function") i18n.off("languageChanged", onChange);
  };
}

function getSnapshot() {
  return currentI18n()?.language ?? FALLBACK_LANGUAGE;
}

/** @returns {string} i18next language code ("en" | "hi" | "mr") */
export function useAppLanguage() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
