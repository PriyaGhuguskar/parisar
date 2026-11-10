"use client";

// Which features are switched on for the active society (my_society_features).
//
// While the list loads, or if it fails, only core features count as on: a disabled
// module must never be offered, and core ones are on for every society. A failed
// load reports status "error" so the caller can offer a retry.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { mySocietyFeatures } from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../supabase/client";
import { enabledFeatureKeys, featureChecker } from "./sidebarNav";

/**
 * @param {string|null} societyId
 * @param {{ initial?: string[]|null }} [options] enabled keys already loaded on the server
 * @returns {{ status: "loading"|"ready"|"error", isEnabled: (key: string) => boolean, retry: () => void }}
 */
export function useSocietyFeatures(societyId, { initial = null } = {}) {
  const [state, setState] = useState(() => ({
    status: initial ? "ready" : societyId ? "loading" : "ready",
    enabled: initial ? new Set(initial) : null,
  }));
  const [attempt, setAttempt] = useState(0);
  const hasInitial = Boolean(initial);

  useEffect(() => {
    if (!societyId || (hasInitial && attempt === 0)) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading" }));
    (async () => {
      try {
        const result = await mySocietyFeatures(createSupabaseBrowserClient(), societyId);
        const enabled = enabledFeatureKeys(result);
        if (cancelled) return;
        setState(enabled ? { status: "ready", enabled } : { status: "error", enabled: null });
      } catch (err) {
        console.error("[nav] feature list failed:", err?.message ?? err);
        if (!cancelled) setState({ status: "error", enabled: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [societyId, attempt, hasInitial]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status: state.status, isEnabled: featureChecker(state.enabled), retry };
}
