import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
} from 'react-native-health-connect';

import {
  checkHealthConnectPermission,
  getHealthConnectAvailability,
  hasScreenLock,
  openHealthConnectApp,
  requestHealthConnectPermission,
} from '@/health/health-connect-client';

const mockedGetSdkStatus = getSdkStatus as jest.MockedFunction<typeof getSdkStatus>;
const mockedInitialize = initialize as jest.MockedFunction<typeof initialize>;
const mockedGetGrantedPermissions = getGrantedPermissions as jest.MockedFunction<
  typeof getGrantedPermissions
>;
const mockedRequestPermission = requestPermission as jest.MockedFunction<typeof requestPermission>;
const mockedOpenHealthConnectSettings = openHealthConnectSettings as jest.MockedFunction<
  typeof openHealthConnectSettings
>;
const mockedGetEnrolledLevelAsync =
  LocalAuthentication.getEnrolledLevelAsync as jest.MockedFunction<
    typeof LocalAuthentication.getEnrolledLevelAsync
  >;

describe('health-connect-client', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    mockedGetSdkStatus.mockReset();
    mockedInitialize.mockReset().mockResolvedValue(true);
    mockedGetGrantedPermissions.mockReset();
    mockedRequestPermission.mockReset();
    mockedOpenHealthConnectSettings.mockReset();
    mockedGetEnrolledLevelAsync.mockReset();
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
  });

  describe('getHealthConnectAvailability', () => {
    it('resolves unavailable immediately, with no native call, on a non-Android platform', async () => {
      Platform.OS = 'ios';

      await expect(getHealthConnectAvailability()).resolves.toBe('unavailable');
      expect(mockedGetSdkStatus).not.toHaveBeenCalled();
    });

    it('resolves available for SDK_AVAILABLE', async () => {
      Platform.OS = 'android';
      mockedGetSdkStatus.mockResolvedValue(3); // SdkAvailabilityStatus.SDK_AVAILABLE

      await expect(getHealthConnectAvailability()).resolves.toBe('available');
    });

    it('resolves unavailable for SDK_UNAVAILABLE', async () => {
      Platform.OS = 'android';
      mockedGetSdkStatus.mockResolvedValue(1); // SdkAvailabilityStatus.SDK_UNAVAILABLE

      await expect(getHealthConnectAvailability()).resolves.toBe('unavailable');
    });

    it('resolves unavailable for SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED', async () => {
      Platform.OS = 'android';
      mockedGetSdkStatus.mockResolvedValue(2); // SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED

      await expect(getHealthConnectAvailability()).resolves.toBe('unavailable');
    });
  });

  describe('hasScreenLock', () => {
    it('resolves true immediately, with no native call, on a non-Android platform', async () => {
      Platform.OS = 'ios';

      await expect(hasScreenLock()).resolves.toBe(true);
      expect(mockedGetEnrolledLevelAsync).not.toHaveBeenCalled();
    });

    it('resolves false for SecurityLevel.NONE', async () => {
      Platform.OS = 'android';
      mockedGetEnrolledLevelAsync.mockResolvedValue(0); // SecurityLevel.NONE

      await expect(hasScreenLock()).resolves.toBe(false);
    });

    it('resolves true for SecurityLevel.SECRET', async () => {
      Platform.OS = 'android';
      mockedGetEnrolledLevelAsync.mockResolvedValue(1); // SecurityLevel.SECRET

      await expect(hasScreenLock()).resolves.toBe(true);
    });

    it('resolves true for a biometric security level', async () => {
      Platform.OS = 'android';
      mockedGetEnrolledLevelAsync.mockResolvedValue(3); // SecurityLevel.BIOMETRIC_STRONG

      await expect(hasScreenLock()).resolves.toBe(true);
    });
  });

  describe('checkHealthConnectPermission / requestHealthConnectPermission', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('checkHealthConnectPermission returns true only when both required permissions are granted', async () => {
      mockedGetGrantedPermissions.mockResolvedValue([
        { accessType: 'write', recordType: 'ExerciseSession' },
        { accessType: 'write', recordType: 'HeartRate' },
      ]);

      await expect(checkHealthConnectPermission()).resolves.toBe(true);
    });

    it('checkHealthConnectPermission returns false for a partial grant (one of two)', async () => {
      mockedGetGrantedPermissions.mockResolvedValue([
        { accessType: 'write', recordType: 'ExerciseSession' },
      ]);

      await expect(checkHealthConnectPermission()).resolves.toBe(false);
    });

    it('checkHealthConnectPermission returns false when nothing is granted', async () => {
      mockedGetGrantedPermissions.mockResolvedValue([]);

      await expect(checkHealthConnectPermission()).resolves.toBe(false);
    });

    it('requestHealthConnectPermission returns true only when both required permissions are granted', async () => {
      mockedRequestPermission.mockResolvedValue([
        { accessType: 'write', recordType: 'ExerciseSession' },
        { accessType: 'write', recordType: 'HeartRate' },
      ]);

      await expect(requestHealthConnectPermission()).resolves.toBe(true);
    });

    it('requestHealthConnectPermission returns false for a partial grant', async () => {
      mockedRequestPermission.mockResolvedValue([{ accessType: 'write', recordType: 'HeartRate' }]);

      await expect(requestHealthConnectPermission()).resolves.toBe(false);
    });
  });

  describe('openHealthConnectApp', () => {
    it('opens the Health Connect app settings screen', async () => {
      await openHealthConnectApp();

      expect(mockedOpenHealthConnectSettings).toHaveBeenCalledTimes(1);
    });
  });
});
