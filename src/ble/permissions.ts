import * as Device from 'expo-device';
import { PermissionsAndroid, Platform } from 'react-native';

/**
 * The settled outcome of an OS-level Android Bluetooth-permission read or
 * request. Below API 31 there is one permission (`ACCESS_FINE_LOCATION`), so
 * only `'granted' | 'denied' | 'blocked'` are reachable there — the two
 * `partial-*` variants are structurally impossible pre-31, since they only
 * exist to distinguish which of the two API-31+ permissions was granted.
 */
export type BlePermissionResult =
  | 'granted'
  | 'partial-scan-only' // BLUETOOTH_SCAN granted, BLUETOOTH_CONNECT denied (API 31+ only)
  | 'partial-connect-only' // BLUETOOTH_CONNECT granted, BLUETOOTH_SCAN denied (API 31+ only)
  | 'denied'
  | 'blocked'; // any requested permission is NEVER_ASK_AGAIN

// `react-native-ble-plx`'s config plugin's `neverForLocation` option lets
// Android 12+ (API 31+) skip `ACCESS_FINE_LOCATION`, but devices on older
// Android still require it for BLE scanning regardless.
function isApi31OrAbove(): boolean {
  // `Device.platformApiLevel` is `number | null` — it shouldn't be null on a
  // real Android device, but if it ever is, fall back to the pre-31
  // (`ACCESS_FINE_LOCATION`) branch defensively rather than assume API 31+.
  return (Device.platformApiLevel ?? 0) >= 31;
}

function mapGrants(
  scanGranted: boolean,
  connectGranted: boolean,
): Exclude<BlePermissionResult, 'blocked'> {
  if (scanGranted && connectGranted) {
    return 'granted';
  }
  if (scanGranted) {
    return 'partial-scan-only';
  }
  if (connectGranted) {
    return 'partial-connect-only';
  }
  return 'denied';
}

/**
 * Read-only check of the current Android Bluetooth-permission state — never
 * shows the OS dialog. Always resolves `'granted'` on non-Android platforms.
 */
export async function checkBlePermissions(): Promise<Exclude<BlePermissionResult, 'blocked'>> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }

  if (isApi31OrAbove()) {
    // `PermissionsAndroid` has no `checkMultiple` — each permission is
    // checked individually.
    const [scanGranted, connectGranted] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
    ]);

    return mapGrants(scanGranted, connectGranted);
  }

  const locationGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  return locationGranted ? 'granted' : 'denied';
}

/**
 * Requests the Android runtime permissions needed for BLE central-mode
 * scanning — may show the OS dialog. Always resolves `'granted'` on
 * non-Android platforms.
 */
export async function requestBlePermissions(): Promise<BlePermissionResult> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }

  if (isApi31OrAbove()) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    const scanResult = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
    const connectResult = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];

    // Checked first: a mixed NEVER_ASK_AGAIN + GRANTED result is `'blocked'`,
    // not `'partial-*'`, because retrying can't recover it.
    if (
      scanResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
      connectResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    ) {
      return 'blocked';
    }

    return mapGrants(
      scanResult === PermissionsAndroid.RESULTS.GRANTED,
      connectResult === PermissionsAndroid.RESULTS.GRANTED,
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'blocked';
  }
  return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}
