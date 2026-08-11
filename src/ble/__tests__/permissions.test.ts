import * as Device from 'expo-device';
import { PermissionsAndroid, Platform } from 'react-native';
import type {
  Permission,
  PermissionStatus,
} from 'react-native/Libraries/PermissionsAndroid/PermissionsAndroid';

import { checkBlePermissions, requestBlePermissions } from '@/ble/permissions';

function mockApiLevel(level: number | null) {
  jest.spyOn(Device, 'platformApiLevel', 'get').mockReturnValue(level);
}

// `requestMultiple`'s return type is keyed by every `Permission`, not just
// the ones requested — this repo's tests only care about the two BLE
// permissions, so the rest are backfilled with a status that isn't asserted
// on.
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

describe('checkBlePermissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves granted without checking on non-Android platforms', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const check = jest.spyOn(PermissionsAndroid, 'check');

    await expect(checkBlePermissions()).resolves.toBe('granted');
    expect(check).not.toHaveBeenCalled();
  });

  describe('on Android 12+ (API 31+)', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockApiLevel(31);
    });

    it('resolves granted when both permissions are granted', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

      await expect(checkBlePermissions()).resolves.toBe('granted');
    });

    it('resolves partial-scan-only when only BLUETOOTH_SCAN is granted', async () => {
      jest
        .spyOn(PermissionsAndroid, 'check')
        .mockImplementation(
          async (permission) => permission === PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        );

      await expect(checkBlePermissions()).resolves.toBe('partial-scan-only');
    });

    it('resolves partial-connect-only when only BLUETOOTH_CONNECT is granted', async () => {
      jest
        .spyOn(PermissionsAndroid, 'check')
        .mockImplementation(
          async (permission) => permission === PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );

      await expect(checkBlePermissions()).resolves.toBe('partial-connect-only');
    });

    it('resolves denied when neither permission is granted', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

      await expect(checkBlePermissions()).resolves.toBe('denied');
    });
  });

  describe('below API 31', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockApiLevel(30);
    });

    it('resolves granted when ACCESS_FINE_LOCATION is granted', async () => {
      const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

      await expect(checkBlePermissions()).resolves.toBe('granted');
      expect(check).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    });

    it('resolves denied when ACCESS_FINE_LOCATION is not granted', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

      await expect(checkBlePermissions()).resolves.toBe('denied');
    });
  });

  it('falls back to the pre-31 branch when platformApiLevel is unexpectedly null', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockApiLevel(null);
    const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

    await expect(checkBlePermissions()).resolves.toBe('granted');
    expect(check).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  });
});

describe('requestBlePermissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves granted without prompting on non-Android platforms', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const requestMultiple = jest.spyOn(PermissionsAndroid, 'requestMultiple');

    await expect(requestBlePermissions()).resolves.toBe('granted');
    expect(requestMultiple).not.toHaveBeenCalled();
  });

  describe('on Android 12+ (API 31+)', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockApiLevel(31);
    });

    it('requests BLUETOOTH_SCAN and BLUETOOTH_CONNECT and resolves granted', async () => {
      const requestMultiple = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
        multipleResult({
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
        }),
      );

      await expect(requestBlePermissions()).resolves.toBe('granted');
      expect(requestMultiple).toHaveBeenCalledWith([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
    });

    it('resolves partial-scan-only when only BLUETOOTH_SCAN is granted', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
        multipleResult({
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.DENIED,
        }),
      );

      await expect(requestBlePermissions()).resolves.toBe('partial-scan-only');
    });

    it('resolves partial-connect-only when only BLUETOOTH_CONNECT is granted', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
        multipleResult({
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.DENIED,
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
        }),
      );

      await expect(requestBlePermissions()).resolves.toBe('partial-connect-only');
    });

    it('resolves denied when neither permission is granted', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
        multipleResult({
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.DENIED,
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.DENIED,
        }),
      );

      await expect(requestBlePermissions()).resolves.toBe('denied');
    });

    it('resolves blocked when any permission is NEVER_ASK_AGAIN', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
        multipleResult({
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
            PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.DENIED,
        }),
      );

      await expect(requestBlePermissions()).resolves.toBe('blocked');
    });

    it('resolves blocked, not partial, when one permission is granted and the other is NEVER_ASK_AGAIN', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
        multipleResult({
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]:
            PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        }),
      );

      await expect(requestBlePermissions()).resolves.toBe('blocked');
    });
  });

  describe('below API 31', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockApiLevel(30);
    });

    it('requests ACCESS_FINE_LOCATION and resolves granted', async () => {
      const request = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

      await expect(requestBlePermissions()).resolves.toBe('granted');
      expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    });

    it('resolves denied when location permission is denied', async () => {
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

      await expect(requestBlePermissions()).resolves.toBe('denied');
    });

    it('resolves blocked when location permission is NEVER_ASK_AGAIN', async () => {
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

      await expect(requestBlePermissions()).resolves.toBe('blocked');
    });
  });
});
