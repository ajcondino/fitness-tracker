import { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import {
  checkHealthConnectPermission,
  getHealthConnectAvailability,
  hasScreenLock,
  openHealthConnectApp as openHealthConnectAppNative,
  requestHealthConnectPermission,
} from '@/health/health-connect-client';
import {
  clearDeclineCount,
  loadDeclineCount,
  loadWriteBackEnabled,
  recordDeclinedAttempt,
  saveWriteBackEnabled,
} from '@/health/health-connect-store';

const DECLINE_COUNT_EXHAUSTED_THRESHOLD = 2;

export type HealthConnectSectionStatus =
  | 'checking' // initial load in flight — not one of the ticket's six
  // states; mirrors index.tsx/history.tsx's `undefined`-while-loading
  // convention. The section renders nothing during this state.
  | 'unavailable'
  | 'noScreenLock'
  | 'permissionExhausted'
  | 'notGranted'
  | 'grantedEnabled'
  | 'grantedDisabled';

const SECURITY_SETTINGS_INTENT = 'android.settings.SECURITY_SETTINGS';
const PLAY_STORE_MARKET_URL = 'market://details?id=com.google.android.apps.healthdata';
const PLAY_STORE_HTTPS_URL =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

// Runs the full four-step precedence chain — availability -> screen lock ->
// permission -> decline count — never calling `requestHealthConnectPermission()`.
// See SPEC.md's Interfaces/API.
async function deriveStatus(): Promise<HealthConnectSectionStatus> {
  const availability = await getHealthConnectAvailability();
  if (availability === 'unavailable') {
    return 'unavailable';
  }

  if (!(await hasScreenLock())) {
    return 'noScreenLock';
  }

  if (await checkHealthConnectPermission()) {
    const writeBackEnabled = await loadWriteBackEnabled();
    await clearDeclineCount();
    return writeBackEnabled ? 'grantedEnabled' : 'grantedDisabled';
  }

  const declineCount = await loadDeclineCount();
  return declineCount >= DECLINE_COUNT_EXHAUSTED_THRESHOLD ? 'permissionExhausted' : 'notGranted';
}

export function useHealthConnectSettings(): {
  status: HealthConnectSectionStatus;
  grantAccess: () => void;
  setWriteBackEnabled: (enabled: boolean) => void;
  openHealthConnectApp: () => void;
  openSecuritySettings: () => void;
  openPlayStore: () => void;
} {
  const [status, setStatus] = useState<HealthConnectSectionStatus>('checking');

  useEffect(() => {
    let isMounted = true;

    const refresh = () => {
      deriveStatus().then((next) => {
        if (isMounted) {
          setStatus(next);
        }
      });
    };

    // Re-check on mount and every time the app returns to the foreground —
    // never on background/inactive — so revocation via system settings, or
    // a Health-Connect uninstall, is reflected without a restart. Mirrors
    // use-ble-permission-status.ts's identical pattern.
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

  function grantAccess() {
    // The ticket's "deliberate, never incidental" grant path — the only
    // call site anywhere in this app that invokes
    // `requestHealthConnectPermission()`.
    requestHealthConnectPermission().then((granted) => {
      if (granted) {
        saveWriteBackEnabled(true);
        clearDeclineCount();
        setStatus('grantedEnabled');
        return;
      }
      recordDeclinedAttempt().then((newCount) => {
        setStatus(
          newCount >= DECLINE_COUNT_EXHAUSTED_THRESHOLD ? 'permissionExhausted' : 'notGranted',
        );
      });
    });
  }

  function setWriteBackEnabled(enabled: boolean) {
    // Optimistic, fire-and-forget — matches use-device-pairing.ts's
    // precedent of not awaiting a persistence write before updating UI
    // state.
    saveWriteBackEnabled(enabled);
    setStatus(enabled ? 'grantedEnabled' : 'grantedDisabled');
  }

  function openHealthConnectApp() {
    openHealthConnectAppNative();
  }

  function openSecuritySettings() {
    Linking.sendIntent(SECURITY_SETTINGS_INTENT);
  }

  function openPlayStore() {
    Linking.canOpenURL(PLAY_STORE_MARKET_URL).then((supported) => {
      Linking.openURL(supported ? PLAY_STORE_MARKET_URL : PLAY_STORE_HTTPS_URL);
    });
  }

  return {
    status,
    grantAccess,
    setWriteBackEnabled,
    openHealthConnectApp,
    openSecuritySettings,
    openPlayStore,
  };
}
