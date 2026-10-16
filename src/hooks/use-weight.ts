import { useEffect, useState } from 'react';

import { saveWeightAndSync } from '@/health/weight-sync';
import type { WeightSyncOutcome } from '@/health/weight-sync';
import { loadWeightEntries } from '@/weight/weight-store';
import type { WeightEntry } from '@/weight/weight-store';

// Thin hook over weight-store.ts + weight-sync.ts — loads all entries on
// mount (`latestKg` is derived from them); `save` appends an entry, syncs, and returns the outcome so the
// caller can show a notice. No `AppState` re-check. See
// docs/specs/weight-capture-health-connect/SPEC.md.
export function useWeight(): {
  latestKg: number | null | undefined;
  entries: WeightEntry[] | undefined;
  save: (kg: number) => Promise<WeightSyncOutcome>;
} {
  // undefined = still loading; [] = loaded, no entry yet.
  const [entries, setEntries] = useState<WeightEntry[] | undefined>(undefined);
  // undefined = still loading; null = loaded, no entry yet.
  const latestKg = entries === undefined ? undefined : (entries.at(-1)?.kg ?? null);

  useEffect(() => {
    let isMounted = true;

    loadWeightEntries().then((loaded) => {
      if (isMounted) setEntries(loaded);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function save(kg: number): Promise<WeightSyncOutcome> {
    const { entry, outcome } = await saveWeightAndSync(kg);
    setEntries((current) => [...(current ?? []), entry]);
    return outcome;
  }

  return { latestKg, entries, save };
}
