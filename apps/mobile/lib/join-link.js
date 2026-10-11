// apps/mobile/lib/join-link.js
// Society-code invite links.
//
// buildJoinLink(code): what residents share on WhatsApp. WhatsApp only makes
// http(s) links tappable, so when the website URL is configured
// (EXPO_PUBLIC_APP_URL → app.config.js extra.appUrl) the link is the website's
// /join/code?code=… page, which works with or without the app installed.
// Without it we fall back to the app's own scheme, parisar://join?code=…,
// handled by app/join.jsx.
//
// Pending code: app/join.jsx stores the code from the link, the user signs in
// as usual (login → OTP → splash), and onboarding pre-fills it.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { formatSocietyCode, SOCIETY_CODE_RE } from "@parisar/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const PENDING_JOIN_CODE_KEY = "parisar_pending_join_code";
const APP_SCHEME = "parisar";

/**
 * The canonical XXXX-XXXX society code (generate_society_code charset, no
 * 0/O/I/1/L), or null for anything else — link input is untrusted.
 */
export function sanitizeJoinCode(raw) {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const code = formatSocietyCode(raw.trim());
  return SOCIETY_CODE_RE.test(code) ? code : null;
}

function appUrl() {
  const raw = Constants.expoConfig?.extra?.appUrl ?? process.env.EXPO_PUBLIC_APP_URL ?? "";
  const url = String(raw).trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(url) ? url : null;
}

/** @param {string} code @returns {string} */
export function buildJoinLink(code) {
  const encoded = encodeURIComponent(code);
  const base = appUrl();
  return base ? `${base}/join/code?code=${encoded}` : `${APP_SCHEME}://join?code=${encoded}`;
}

/** Remember a code from an invite link until onboarding uses it. */
export async function setPendingJoinCode(raw) {
  const code = sanitizeJoinCode(raw);
  if (!code) return null;
  try {
    await AsyncStorage.setItem(PENDING_JOIN_CODE_KEY, code);
  } catch {
    // Non-critical: the user can still type the code.
  }
  return code;
}

/** @returns {Promise<string|null>} */
export async function getPendingJoinCode() {
  try {
    return sanitizeJoinCode(await AsyncStorage.getItem(PENDING_JOIN_CODE_KEY));
  } catch {
    return null;
  }
}

export async function clearPendingJoinCode() {
  try {
    await AsyncStorage.removeItem(PENDING_JOIN_CODE_KEY);
  } catch {
    // ignore
  }
}
