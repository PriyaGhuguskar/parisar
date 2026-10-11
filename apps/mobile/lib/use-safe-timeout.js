// apps/mobile/lib/use-safe-timeout.js
// A setTimeout that is cleared when the screen unmounts (or when a new one is
// scheduled), so a "go back after the success toast" never fires on a screen
// the user already left.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useCallback, useEffect, useRef } from "react";

/** @returns {(fn: () => void, ms: number) => void} */
export function useSafeTimeout() {
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    },
    [],
  );

  return useCallback((fn, ms) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fn();
    }, ms);
  }, []);
}
