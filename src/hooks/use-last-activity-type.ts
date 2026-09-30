import { useEffect, useState } from 'react';

import { loadLastActivityType, saveLastActivityType } from '@/workout/activity-type-store';
import type { ActivityType } from '@/workout/workout-record';

// Thin hook over activity-type-store.ts — loads on mount, exposes an
// optimistic (fire-and-forget-persist, immediate-state-update) setter.
// State starts at 'run' synchronously: a legitimate value, not a loading
// sentinel, same reasoning as useUnitsPreference's synchronous 'metric'
// default. See SPEC.md's Interfaces/API.
export function useLastActivityType(): {
  activityType: ActivityType;
  setActivityType: (type: ActivityType) => void;
} {
  const [activityType, setActivityTypeState] = useState<ActivityType>('run');

  useEffect(() => {
    let isMounted = true;

    loadLastActivityType().then((type) => {
      if (isMounted) {
        setActivityTypeState(type);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function setActivityType(type: ActivityType) {
    setActivityTypeState(type);
    saveLastActivityType(type);
  }

  return { activityType, setActivityType };
}
