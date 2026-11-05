import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { LocationPermissionResult } from '@/location/location-types';

/**
 * Read-only check of the current foreground-location permission — never
 * shows the OS dialog. Always resolves `'granted'` on non-Android platforms
 * (the app is Android-only).
 *
 * Deliberately `expo-location` rather than `PermissionsAndroid` (as
 * `ble/permissions.ts` uses): `PermissionsAndroid.check` can't report
 * `canAskAgain`, and the permanently-denied state needs it.
 */
export async function checkLocationPermission(): Promise<'granted' | 'denied'> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }
  const { granted } = await Location.getForegroundPermissionsAsync();
  return granted ? 'granted' : 'denied';
}

/**
 * Requests foreground location — may show the OS dialog. Resolves `'blocked'`
 * when the user refused and Android will no longer show the dialog
 * (`canAskAgain === false`). Always resolves `'granted'` on non-Android.
 */
export async function requestLocationPermission(): Promise<LocationPermissionResult> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }
  const { granted, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (granted) {
    return 'granted';
  }
  return canAskAgain ? 'denied' : 'blocked';
}
