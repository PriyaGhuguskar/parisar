"use client";

// Every flat in the manager's society as SearchableSelect options, from
// setup_get_state (manager or staff only). Labels match the server's "Wing-101".

import { setupGetState } from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Pure, for tests. */
export function flatOptionsFromSetup(state) {
  const out = [];
  for (const w of state?.wings ?? []) {
    const flats = [
      ...(w.floors ?? []).flatMap((fl) => fl.flats ?? []),
      ...(w.unassigned_flats ?? []),
    ];
    for (const f of flats) {
      out.push({
        value: f.id,
        label: `${w.name}-${f.number}`,
        keywords: `${w.code ?? ""} ${f.number}`,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function useSocietyFlats(societyId) {
  const [options, setOptions] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await setupGetState(createSupabaseBrowserClient(), societyId);
      if (res?.error) throw new Error(res.error);
      setOptions(flatOptionsFromSetup(res));
    } catch {
      setFailed(true);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { options, failed, reload: load };
}
