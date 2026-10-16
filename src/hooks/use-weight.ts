import { useEffect, useState } from 'react';

import { saveWeightAndSync } from '@/health/weight-sync';
import type { WeightSyncOutcome } from '@/health/weight-sync';
import { getLatestWeightKg } from '@/weight/weight-store';

// Thin hook over weight-store.ts + weight-sync.ts — loads the latest weight
// on mount; `save` appends an entry, syncs, and returns the outcome so the
// caller can show a notice. No `AppState` re-check. See
// docs/specs/weight-capture-health-connect/SPEC.md.
export function useWeight(): {
  latestKg: number | null | undefined;
  save: (kg: number) => Promise<WeightSyncOutcome>;
} {
  // undefined = still loading; null = loaded, no entry yet.
  const [latestKg, setLatestKg] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;

    getLatestWeightKg().then((kg) => {
      if (isMounted) setLatestKg(kg);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function save(kg: number): Promise<WeightSyncOutcome> {
    const { entry, outcome } = await saveWeightAndSync(kg);
    setLatestKg(entry.kg);
    return outcome;
  }

  return { latestKg, save };
}
