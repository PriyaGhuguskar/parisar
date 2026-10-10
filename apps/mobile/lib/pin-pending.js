// apps/mobile/lib/pin-pending.js
// The PIN is a second factor after OTP. Between "OTP verified" and "PIN done"
// the user already has a session, so if they closed the app at the PIN screen
// the next launch would skip straight in. This flag (per user) makes the
// splash send them back to the PIN screen instead.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "parisar_pin_pending";
/** Set just before verifyOtp, when the user id isn't known yet. */
export const ANY_USER = "*";

export async function setPinPending(userId) {
  try {
    await AsyncStorage.setItem(KEY, String(userId));
  } catch {
    // Storage failure only loses the resume guard; login itself still works.
  }
}

export async function clearPinPending() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export async function isPinPending(userId) {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === ANY_USER || v === String(userId);
  } catch {
    return false;
  }
}
