// Guarded Linking.openURL for URLs built from backend data.
//
// Only https / tel / mailto / whatsapp links may leave the app; plain http is
// accepted in development builds only (the local Supabase stack serves signed
// storage URLs over http://127.0.0.1). Anything else (javascript:, file:,
// intent:, content:, custom schemes, …) is refused.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Linking } from "react-native";

const SAFE_SCHEMES = new Set(["https:", "tel:", "mailto:", "whatsapp:"]);
const TEL_RE = /^tel:\+?[0-9]{3,15}$/;
const MAILTO_RE = /^mailto:[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/;

/**
 * @param {unknown} url
 * @returns {boolean}
 */
export function isSafeExternalUrl(url) {
  if (typeof url !== "string" || url.length === 0 || url.length > 4096) return false;
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(url);
  if (!match) return false;
  const scheme = match[1].toLowerCase();
  if (scheme === "tel:") return TEL_RE.test(url);
  if (scheme === "mailto:") return MAILTO_RE.test(url);
  if (scheme === "https:") return /^https:\/\/[^\s/]+/i.test(url);
  if (scheme === "http:") return __DEV__ && /^http:\/\/[^\s/]+/i.test(url);
  return SAFE_SCHEMES.has(scheme);
}

/**
 * Open the URL when it passes isSafeExternalUrl; otherwise do nothing.
 * @param {string} url
 * @returns {Promise<boolean>} true when the URL was handed to the OS
 */
export async function openExternalUrl(url) {
  if (!isSafeExternalUrl(url)) return false;
  await Linking.openURL(url);
  return true;
}
