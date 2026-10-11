// apps/mobile/lib/use-society-realtime.js
// Postgres-changes subscription for one society-scoped table, open only while
// the screen is focused.
//
// Tab screens stay mounted after you leave them, so a subscription opened in a
// plain useEffect kept streaming (and refetching) in the background. Before
// this hook the channels also had no filter, so every change in the table
// woke every client up (RLS hides the rows, but the refetch still ran).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { getSupabase } from "./supabase";

let channelSeq = 0;

/**
 * @param {string} table   public table name, e.g. "facility_events"
 * @param {string|null} societyId  subscription is skipped while null
 * @param {(payload: object) => void} onChange  called for INSERT/UPDATE/DELETE
 * @param {{ column?: string }} [opts] filter column (default "society_id")
 */
export function useSocietyRealtime(table, societyId, onChange, { column = "society_id" } = {}) {
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  }, [onChange]);

  useFocusEffect(
    useCallback(() => {
      if (!societyId) return undefined;
      const supabase = getSupabase();
      channelSeq += 1;
      const channel = supabase
        .channel(`${table}:${societyId}:${channelSeq}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `${column}=eq.${societyId}` },
          (payload) => handlerRef.current?.(payload),
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }, [table, societyId, column]),
  );
}
