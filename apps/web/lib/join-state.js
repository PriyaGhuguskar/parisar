"use client";

import { create } from "zustand";

/**
 * Zustand store for member join flow state across the web routes.
 *
 * NO persistence — a page refresh clears state. Users should complete
 * the join flow in one browser session.
 *
 * Fields:
 *   code        — formatted code string, e.g. "PAR7-XKM2"
 *   society     — { society_id, name, address, member_count } from validateSocietyCode
 *   structure   — { society_id, wings: [{id, name}], flats: [{id, wing_id, number}] }
 *   joinResult  — { status, flatNumber, autoElevatedToCoSecretary } from joinBySocietyCode
 */
export const useJoinState = create((set) => ({
  code: "",
  society: null,
  structure: null,
  joinResult: null,

  /** Shallow-merge a patch object into the store. */
  set: (patch) => set((s) => ({ ...s, ...patch })),

  /** Reset all join state. */
  reset: () =>
    set({
      code: "",
      society: null,
      structure: null,
      joinResult: null,
    }),
}));
