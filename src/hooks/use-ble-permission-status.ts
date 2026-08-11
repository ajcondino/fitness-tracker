import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import type { BlePermissionResult } from '@/ble/permissions';
import { checkBlePermissions, requestBlePermissions } from '@/ble/permissions';

/**
 * `BlePermissionResult` plus two UI-session states layered on top of it,
 * because `PermissionsAndroid.check()` can't distinguish "never asked" from
 * "asked and denied" — only an actual `requestBlePermissions()` call reveals
 * that distinction, and this hook is what remembers it for the session.
 */
export type BlePermissionStatus = BlePermissionResult | 'undetermined' | 'requesting';

// Pure so it can sit outside the hook body: given a `checkBlePermissions()`
// read plus this session's "asked before" / "sticky blocked" bits, derives
// what should actually be displayed.
function deriveDisplayStatus(
  result: Exclude<BlePermissionResult, 'blocked'>,
  hasAskedBefore: boolean,
  isStickyBlocked: boolean,
): Exclude<BlePermissionStatus, 'requesting'> {
  if (result === 'granted') {
    return 'granted';
  }
  // Neither a partial nor a denied read is recoverable without Settings, so
  // once blocked, none of them downgrade the displayed status.
  if (isStickyBlocked) {
    return 'blocked';
  }
  if (result === 'denied') {
    return hasAskedBefore ? 'denied' : 'undetermined';
  }
  // 'partial-scan-only' / 'partial-connect-only' are direct API 31+ signals
  // — they don't depend on this session's ask history.
  return result;
}

export function useBlePermissionStatus(): {
  status: BlePermissionStatus;
  requestAccess: () => void;
  openSettings: () => void;
} {
  const [status, setStatus] = useState<BlePermissionStatus>('undetermined');

  // Whether a `requestBlePermissions()` call has resolved in this
  // component's lifetime — see `deriveDisplayStatus`.
  const hasAskedBeforeRef = useRef(false);
  // Sticky once `requestBlePermissions()` resolves 'blocked'; cleared only
  // by a later `checkBlePermissions()` read reporting full 'granted'.
  const isStickyBlockedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const refresh = () => {
      checkBlePermissions().then((result) => {
        if (!isMounted) {
          return;
        }
        if (result === 'granted') {
          isStickyBlockedRef.current = false;
        }
        setStatus(
          deriveDisplayStatus(result, hasAskedBeforeRef.current, isStickyBlockedRef.current),
        );
      });
    };

    // Re-check on mount and every time the app returns to the foreground —
    // never on background/inactive, and never via requestBlePermissions(),
    // so foreground re-entry can't itself trigger the OS dialog.
    refresh();
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refresh();
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  function requestAccess() {
    setStatus('requesting');
    requestBlePermissions().then((result) => {
      hasAskedBeforeRef.current = true;
      isStickyBlockedRef.current = result === 'blocked';
      setStatus(result);
    });
  }

  function openSettings() {
    Linking.openSettings();
  }

  return { status, requestAccess, openSettings };
}
