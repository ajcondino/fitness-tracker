import { PermissionsAndroid, Platform } from 'react-native';
import type {
  Permission,
  PermissionStatus,
} from 'react-native/Libraries/PermissionsAndroid/PermissionsAndroid';

import { requestBlePermissions } from '@/ble/permissions';

// `requestMultiple`'s return type is keyed by every `Permission`, not just the
// ones requested — this repo's tests only care about the two BLE permissions,
// so the rest are backfilled with a status that isn't asserted on.
function multipleResult(overrides: Partial<Record<Permission, PermissionStatus>>) {
  return {
    ...Object.fromEntries(
      Object.values(PermissionsAndroid.PERMISSIONS).map((permission) => [
        permission,
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      ]),
    ),
    ...overrides,
  } as Record<Permission, PermissionStatus>;
}

describe('requestBlePermissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves true without prompting on non-Android platforms', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const requestMultiple = jest.spyOn(PermissionsAndroid, 'requestMultiple');

    await expect(requestBlePermissions()).resolves.toBe(true);
    expect(requestMultiple).not.toHaveBeenCalled();
  });

  it('requests BLUETOOTH_SCAN and BLUETOOTH_CONNECT on Android 12+ (API 31+)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(31);
    const requestMultiple = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
      multipleResult({
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
      }),
    );

    await expect(requestBlePermissions()).resolves.toBe(true);
    expect(requestMultiple).toHaveBeenCalledWith([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
  });

  it('resolves false on Android 12+ when any requested permission is denied', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
      multipleResult({
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.DENIED,
      }),
    );

    await expect(requestBlePermissions()).resolves.toBe(false);
  });

  it('requests ACCESS_FINE_LOCATION on Android below API 31', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(30);
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    await expect(requestBlePermissions()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  });

  it('resolves false below API 31 when location permission is denied', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(28);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    await expect(requestBlePermissions()).resolves.toBe(false);
  });
});
