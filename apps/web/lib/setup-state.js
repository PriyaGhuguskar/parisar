"use client";

import { create } from "zustand";

/**
 * Zustand store for wizard state across the 6-step Secretary setup flow.
 *
 * NO persistence (no zustand/middleware/persist). A browser refresh clears the store.
 * The layout.jsx uses audit_log resume detection to recover the right step from the server.
 *
 * Fields:
 *   societyId        - UUID returned from createSociety RPC (Step 1)
 *   code             - Society code string, e.g. "PAR7-XKM2" (Step 1)
 *   coSecretaryFound - Boolean: co-sec phone matched a registered user at creation time
 *   coSecPhone       - Normalized 10-digit co-sec phone (Step 1)
 *   wings            - Array of wing name strings ["A", "B"] (Step 2)
 *   flats            - Array of flat objects {id, wing_name, number} (Step 3, from bootstrap)
 *   boardMembers     - Array of {name, flatId, phone, userId} (Step 4)
 *   amenities        - Array of amenity name strings (Step 5)
 *   secretaryFlatId  - UUID of the secretary's chosen flat (Step 3)
 */
export const useSetupState = create((set) => ({
  societyId: null,
  code: null,
  coSecretaryFound: false,
  coSecPhone: "",
  wings: [],
  flats: [],
  boardMembers: [],
  amenities: [],
  secretaryFlatId: null,

  /** Shallow-merge a patch object into the store. */
  set: (patch) => set((s) => ({ ...s, ...patch })),

  /** Reset all wizard state. */
  reset: () =>
    set({
      societyId: null,
      code: null,
      coSecretaryFound: false,
      coSecPhone: "",
      wings: [],
      flats: [],
      boardMembers: [],
      amenities: [],
      secretaryFlatId: null,
    }),
}));
