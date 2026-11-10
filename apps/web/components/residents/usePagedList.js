"use client";

// Server-side paging for a kit DataTable over a paged RPC ({ items, total }).
// `fetchPage({ search, filterValues, limit, offset })` returns the api-client result.
// Hand `onQueryChange` to the DataTable; `retry` re-runs the last query.
// Out-of-order responses are dropped, so a slow first page never overwrites a later one.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useCallback, useEffect, useRef, useState } from "react";

export const PAGE_SIZE = 20;

/**
 * @param {(q: { search: string, filterValues: object, limit: number, offset: number }) => Promise<object>} fetchPage
 */
export function usePagedList(fetchPage) {
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const lastQuery = useRef({ search: "", filterValues: {}, page: 1, pageSize: PAGE_SIZE });
  const seq = useRef(0);

  const run = useCallback(async (query) => {
    lastQuery.current = query;
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetchRef.current({
        search: query.search?.trim() || "",
        filterValues: query.filterValues ?? {},
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      });
      if (mine !== seq.current) return;
      if (!res || res.error || !Array.isArray(res.items)) {
        setState({ rows: [], total: 0, loading: false, error: res?.error ?? "LOAD_FAILED" });
        return;
      }
      setState({
        rows: res.items,
        total: res.total ?? res.items.length,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("[list] load failed:", err?.message ?? err);
      if (mine === seq.current) {
        setState({ rows: [], total: 0, loading: false, error: "LOAD_FAILED" });
      }
    }
  }, []);

  useEffect(() => {
    run(lastQuery.current);
  }, [run]);

  const onQueryChange = useCallback((query) => run(query), [run]);
  const retry = useCallback(() => run(lastQuery.current), [run]);

  return { ...state, onQueryChange, retry };
}
