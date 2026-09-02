import { useEffect, useState } from 'react';

import type { UnitSystem } from '@/units/units';
import { loadUnitsPreference, saveDistanceUnit, saveWeightUnit } from '@/units/units-store';

// Thin hook over units-store.ts — loads on mount, exposes optimistic
// (fire-and-forget-persist, immediate-state-update) setters. State starts
// at the real 'metric' default rather than a "loading" sentinel: unlike
// useHealthConnectSettings's `'checking'` status, metric is itself a
// legitimate value even before the async load resolves. No `AppState`
// re-check — nothing outside this app can change this value. See
// SPEC.md's Interfaces/API.
export function useUnitsPreference(): {
  distance: UnitSystem;
  weight: UnitSystem;
  setDistanceUnit: (system: UnitSystem) => void;
  setWeightUnit: (system: UnitSystem) => void;
} {
  const [distance, setDistance] = useState<UnitSystem>('metric');
  const [weight, setWeight] = useState<UnitSystem>('metric');

  useEffect(() => {
    let isMounted = true;

    loadUnitsPreference().then((preference) => {
      if (isMounted) {
        setDistance(preference.distance);
        setWeight(preference.weight);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function setDistanceUnit(system: UnitSystem) {
    // Optimistic, fire-and-forget — mirrors
    // use-health-connect-settings.ts's setWriteBackEnabled precedent.
    setDistance(system);
    saveDistanceUnit(system);
  }

  function setWeightUnit(system: UnitSystem) {
    setWeight(system);
    saveWeightUnit(system);
  }

  return { distance, weight, setDistanceUnit, setWeightUnit };
}
