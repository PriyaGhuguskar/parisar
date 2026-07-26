"use server";
// apps/web/app/actions/set-language.js
// Phase 7 — Plan 07-04 Task 2: locale-cookie write path.
//
// The first thing we do is whitelist-validate the incoming `lng` string against
// SUPPORTED_LOCALES (T-07-17 mitigation — server actions accept arbitrary
// client input). Only after validation does the cookie write happen, and the
// route cache is invalidated so RSC pages re-render in the new language.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LOCALE_COOKIE_ATTRS, LOCALE_COOKIE_NAME, validateLocale } from "@/lib/i18n/cookie";

/**
 * Set the locale cookie + invalidate the route cache so RSC re-renders pages
 * in the new language. Accepts either a raw locale string (from the client
 * LanguageSelector button) or a FormData with field "lng" (from a no-JS
 * fallback form).
 *
 * @param {FormData|string} input
 * @returns {Promise<{ lng: string }>}
 */
export async function setLanguageAction(input) {
  const raw = typeof input === "string" ? input : (input?.get?.("lng") ?? "en");
  const safe = validateLocale(raw);
  const store = await cookies();
  store.set({
    name: LOCALE_COOKIE_NAME,
    value: safe,
    ...LOCALE_COOKIE_ATTRS,
  });
  // Refresh the whole tree so every RSC page picks up the new locale.
  revalidatePath("/", "layout");
  return { lng: safe };
}
