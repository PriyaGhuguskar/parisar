"use client";

// Server-loaded data with a client-side retry. `initial` is what the page loaded
// ({ data } or { error: true }); without it the hook loads on mount. `load` returns
// the api-client result: JSON on success, { error: CODE } for an expected failure,
// or it throws. Either failure becomes status "error"; the raw message never shows.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useCallback, useEffect, useRef, useState } from "react";

function fromInitial(initial) {
  if (initial?.data) return { status: "ready", data: initial.data, code: null };
  if (initial?.error) return { status: "error", data: null, code: initial.code ?? null };
  return { status: "loading", data: null, code: null };
}

/**
 * @param {{ data?: object, error?: boolean, code?: string } | undefined} initial
 * @param {() => Promise<object>} load
 */
export function useReloadable(initial, load) {
  const [state, setState] = useState(() => fromInitial(initial));
  const loadRef = useRef(load);
  loadRef.current = load;
  const live = useRef(true);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, status: s.data ? "refreshing" : "loading" }));
    try {
      const res = await loadRef.current();
      if (!live.current) return;
      if (!res || res.error) {
        setState((s) => ({ status: s.data ? "ready" : "error", data: s.data, code: res?.error }));
        return;
      }
      setState({ status: "ready", data: res, code: null });
    } catch (err) {
      console.error("[dashboard] reload failed:", err?.message ?? err);
      if (live.current)
        setState((s) => ({ status: s.data ? "ready" : "error", data: s.data, code: null }));
    }
  }, []);

  const loadOnMount = !initial;
  useEffect(() => {
    live.current = true;
    if (loadOnMount) reload();
    return () => {
      live.current = false;
    };
  }, [loadOnMount, reload]);

  return { ...state, reload };
}
