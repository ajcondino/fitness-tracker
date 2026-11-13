import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import type { SessionPhase } from '@/hooks/use-workout-session';
import { LOCATION_SAMPLE_INTERVAL_MS } from '@/location/location-config';
import { deriveLocationStatus } from '@/location/location-types';
import type { LocationPermissionResult, LocationTrackingStatus } from '@/location/location-types';
import { checkLocationPermission, requestLocationPermission } from '@/location/permissions';
import type { RoutePoint } from '@/workout/workout-record';

type PermissionState = 'undetermined' | 'requesting' | LocationPermissionResult;

/**
 * Foreground GPS sampling for a workout session. Takes only `phase` (like
 * `useWorkoutSession` takes primitives) so it's testable in isolation, and
 * never feeds anything back into the session's phase machine — every failure
 * here is a status to display, not an error to throw.
 *
 * Route points are appended only while `phase === 'running'`: the
 * subscription is torn down on pause/stop/unmount, and the ingestion point
 * re-checks the phase (via a ref) so a fix delivered after a Pause tap but
 * before teardown is dropped. See
 * docs/specs/foreground-location-gps-sampling/SPEC.md.
 */
export function useLocationRoute(phase: SessionPhase): {
  status: LocationTrackingStatus;
  route: RoutePoint[];
  requestAccess: () => void;
  openSettings: () => void;
} {
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [servicesEnabled, setServicesEnabled] = useState(true);
  const [hasFixThisStretch, setHasFixThisStretch] = useState(false);
  const [route, setRoute] = useState<RoutePoint[]>([]);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      checkLocationPermission().then(
        (result) => {
          if (!isMountedRef.current) {
            return;
          }
          // A read can only upgrade to 'granted' or downgrade from it — it
          // can't tell "never asked" from "asked and denied", so it never
          // overwrites what a real request already settled (incl. 'blocked'),
          // and never itself shows the dialog.
          setPermission((prev) =>
            result === 'granted' ? 'granted' : prev === 'granted' ? 'denied' : prev,
          );
        },
        () => {
          // A failed read leaves the status as it was.
        },
      );
    };

    refresh();
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refresh();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (phase !== 'running' || permission !== 'granted') {
      return undefined;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // A new running stretch starts with no fix (Resume returns to
    // 'acquiring-fix').
    setHasFixThisStretch(false);
    setServicesEnabled(true);

    const markUnavailable = () => {
      if (!cancelled) {
        setServicesEnabled(false);
      }
    };

    const start = async () => {
      try {
        if (!(await Location.hasServicesEnabledAsync())) {
          throw new Error('location services disabled');
        }
        const next = await Location.watchPositionAsync(
          {
            accuracy: Location.LocationAccuracy.Balanced,
            timeInterval: LOCATION_SAMPLE_INTERVAL_MS,
            distanceInterval: 0,
          },
          (location) => {
            if (cancelled || phaseRef.current !== 'running') {
              return;
            }
            const { latitude, longitude } = location.coords;
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return;
            }
            setServicesEnabled(true);
            setHasFixThisStretch(true);
            setRoute((prev) => [...prev, { latitude, longitude, timestamp: Date.now() }]);
          },
          markUnavailable,
        );
        if (cancelled) {
          next.remove();
        } else {
          subscription = next;
          // A retry after an outage just got through — no longer unavailable,
          // merely waiting on the next fix.
          setServicesEnabled(true);
        }
      } catch {
        // Services off / provider error: surface it, then keep trying at the
        // sampling interval so sampling resumes once GPS is back.
        markUnavailable();
        if (!cancelled) {
          retryTimer = setTimeout(start, LOCATION_SAMPLE_INTERVAL_MS);
        }
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (retryTimer != null) {
        clearTimeout(retryTimer);
      }
      subscription?.remove();
    };
  }, [phase, permission]);

  function requestAccess() {
    // Already settled (or in flight): never re-prompt, and a blocked
    // permission can only be recovered from Settings.
    if (permission !== 'undetermined' && permission !== 'denied') {
      return;
    }
    setPermission('requesting');
    requestLocationPermission().then(
      (result) => {
        if (isMountedRef.current) {
          setPermission(result);
        }
      },
      () => {
        if (isMountedRef.current) {
          setPermission('denied');
        }
      },
    );
  }

  function openSettings() {
    void Linking.openSettings();
  }

  return {
    status: deriveLocationStatus({ permission, servicesEnabled, phase, hasFixThisStretch }),
    route,
    requestAccess,
    openSettings,
  };
}
