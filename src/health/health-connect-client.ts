import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
} from 'react-native-health-connect';

/**
 * Thin wrapper around `react-native-health-connect` (plus
 * `expo-local-authentication` for the screen-lock check) — mirrors
 * `src/ble/permissions.ts`'s "no React import, plain async functions" shape.
 */

export type HealthConnectAvailability = 'available' | 'unavailable';

export const REQUIRED_PERMISSIONS: Permission[] = [
  { accessType: 'write', recordType: 'ExerciseSession' },
  { accessType: 'write', recordType: 'HeartRate' },
];
// Write-only, matching this ticket's explicit scope: it establishes
// capability and consent only, and writes nothing. No 'read' permission is
// requested anywhere — this app never reads from Health Connect.

/**
 * Read-only, no dialog. Resolves `'unavailable'` immediately (no native
 * call) on any non-Android platform.
 */
export async function getHealthConnectAvailability(): Promise<HealthConnectAvailability> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }

  const status = await getSdkStatus();
  return status === SdkAvailabilityStatus.SDK_AVAILABLE ? 'available' : 'unavailable';
}

/**
 * Whether the device has a screen lock set (PIN, pattern, password, or a
 * biometric enrollment backed by one of those). Health Connect enforces
 * this requirement entirely inside its own permission UI — it exposes no
 * status for it — so this checks device security independent of Health
 * Connect via `expo-local-authentication`. Resolves `true` immediately on
 * any non-Android platform.
 */
export async function hasScreenLock(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

let initializePromise: Promise<boolean> | null = null;

// Lazily calls the library's own `initialize()` exactly once per process and
// caches the promise — mirrors bleManager's "construct once at module scope"
// singleton discipline, adapted to an async initializer. Confirmed against
// the library's own native source: `getGrantedPermissions()` and
// `requestPermission()` both reject with `ClientNotInitialized` unless
// `initialize()` has resolved first, and calling it more than once is safe
// (it just re-creates the client).
function ensureInitialized(): Promise<boolean> {
  initializePromise ??= initialize();
  return initializePromise;
}

// Loosely typed against `{ accessType, recordType }` rather than the
// library's own `getGrantedPermissions()`/`requestPermission()` return union
// (which also includes special permissions like
// `WriteExerciseRoutePermission`) — this app only ever requests the two
// `REQUIRED_PERMISSIONS` above, so the exact shape of anything else in the
// granted list is irrelevant here.
function hasAllRequiredPermissions(
  granted: readonly { accessType: string; recordType: string }[],
): boolean {
  return REQUIRED_PERMISSIONS.every((required) =>
    granted.some(
      (permission) =>
        permission.accessType === required.accessType &&
        permission.recordType === required.recordType,
    ),
  );
}

/**
 * Read-only, no dialog. Returns `true` iff every entry in
 * `REQUIRED_PERMISSIONS` has a matching granted permission — a partial grant
 * is `false`. Safe to call on mount and on every foreground re-check.
 */
export async function checkHealthConnectPermission(): Promise<boolean> {
  await ensureInitialized();
  const granted = await getGrantedPermissions();
  return hasAllRequiredPermissions(granted);
}

/**
 * May show the OS permission dialog. Callers must always check
 * `hasScreenLock()` first and never call this when it's `false` — Health
 * Connect surfaces its own "set a screen lock" prompt instead of the
 * permission dialog in that case. Returns `true` iff every entry in
 * `REQUIRED_PERMISSIONS` is present in the resolved granted list.
 */
export async function requestHealthConnectPermission(): Promise<boolean> {
  await ensureInitialized();
  const granted = await requestPermission(REQUIRED_PERMISSIONS);
  return hasAllRequiredPermissions(granted);
}

/**
 * Opens the Health Connect app's own permission-management screen directly
 * — what `'permissionExhausted'` copy points at.
 */
export async function openHealthConnectApp(): Promise<void> {
  openHealthConnectSettings();
}
