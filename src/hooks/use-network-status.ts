import { useEffect, useRef, useState } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';

export type NetworkStatus = {
  isOffline: boolean;
};

// A transient Wi-Fi handoff or cell-tower switch typically resolves within
// one to two seconds — this is the one-directional delay that absorbs those
// without ever delaying the good news that connectivity is back. See
// docs/specs/network-connectivity-indicator/SPEC.md's Data Model.
const OFFLINE_DEBOUNCE_MS = 2500;

/**
 * Debounced, observed-not-owned connectivity signal — no persisted state,
 * mirroring `useBlePermissionStatus`'s "derive from an OS/library signal,
 * hold no disk state of its own" shape.
 *
 * Reflects `isInternetReachable`, not merely `isConnected`: a device
 * associated with Wi-Fi but behind a captive portal or a dead access point
 * reports `isConnected: true` while `isInternetReachable: false`, and this
 * hook must catch that too. Either value being `null` (NetInfo's own
 * "not yet determined" state) is treated as online, so a cold start or a
 * brief re-probe after a network change never flashes the offline state.
 */
export function useNetworkStatus(): NetworkStatus {
  const { isConnected, isInternetReachable } = useNetInfo();
  const rawIsOffline = isConnected === false || isInternetReachable === false;

  const [isOffline, setIsOffline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (rawIsOffline) {
      if (timerRef.current === null) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setIsOffline(true);
        }, OFFLINE_DEBOUNCE_MS);
      }
    } else {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsOffline(false);
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [rawIsOffline]);

  return { isOffline };
}
