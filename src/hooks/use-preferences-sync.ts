import { useEffect, useRef } from 'react';

import type { AccountSectionStatus } from '@/auth/auth-types';
import { fetchRemotePreferences, writeRemotePreferences } from '@/sync/preferences-store';
import type { UnitSystem } from '@/units/units';

// The only place this ticket's auth-status-driven behavior lives. Takes
// already-loaded units state and its setters as parameters — it does NOT
// call useUnitsPreference() or useAuth() itself, preserving each hook's
// single-owner boundary. See SPEC.md's Interfaces/API and Style &
// Conventions.
export function usePreferencesSync(params: {
  authStatus: AccountSectionStatus;
  uid: string | null;
  distance: UnitSystem;
  weight: UnitSystem;
  setDistanceUnit: (system: UnitSystem) => void;
  setWeightUnit: (system: UnitSystem) => void;
}): void {
  const { authStatus, uid, distance, weight, setDistanceUnit, setWeightUnit } = params;
  // Starts undefined (never "already signedIn") rather than seeded with the
  // first render's authStatus, so a cold-start/remount that lands directly
  // on 'signedIn' on its very first render still counts as a transition —
  // see SPEC.md's Interfaces/API.
  const previousAuthStatusRef = useRef<AccountSectionStatus | undefined>(undefined);

  // Effect 1: pull, once per transition into 'signedIn' — covers a real
  // sign-in and a cold-start/remount session restore that lands directly on
  // 'signedIn'. Conflict rule: remote wins.
  useEffect(() => {
    const previousAuthStatus = previousAuthStatusRef.current;
    previousAuthStatusRef.current = authStatus;

    if (authStatus !== 'signedIn' || previousAuthStatus === 'signedIn' || uid == null) {
      return;
    }

    fetchRemotePreferences(uid)
      .then((remote) => {
        if (remote != null) {
          setDistanceUnit(remote.units.distance);
          setWeightUnit(remote.units.weight);
        }
        // remote == null (never-synced account): nothing to do here —
        // effect 2 below pushes the current local values up as the seed.
      })
      .catch(() => {
        // Offline, no cache, or a permission issue — local values stand for
        // this session; the next successful pull tries again.
      });
  }, [authStatus, uid, setDistanceUnit, setWeightUnit]);

  // Effect 2: push, on every distance/weight/authStatus/uid change. Not
  // awaited — a failed write is invisible to the caller, matching
  // use-health-connect-settings.ts's setWriteBackEnabled fire-and-forget
  // precedent.
  useEffect(() => {
    if (authStatus !== 'signedIn' || uid == null) {
      return;
    }

    writeRemotePreferences(uid, { distance, weight }).catch(() => {
      // Intentionally swallowed — see SPEC.md's Interfaces/API.
    });
  }, [authStatus, uid, distance, weight]);
}
