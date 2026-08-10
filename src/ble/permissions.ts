import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Requests the Android runtime permissions needed for BLE central-mode
 * scanning. The `react-native-ble-plx` config plugin's `neverForLocation`
 * option lets Android 12+ (API 31+) skip `ACCESS_FINE_LOCATION`, but devices
 * on older Android still require it for BLE scanning regardless.
 *
 * Always resolves `true` on non-Android platforms — this app doesn't build
 * or update iOS, but the guard keeps the function safely callable from web
 * or Jest without throwing.
 */
export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}
