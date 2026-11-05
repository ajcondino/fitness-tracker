import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { checkLocationPermission, requestLocationPermission } from '@/location/permissions';

jest.mock('expo-location');

const mockedGet = Location.getForegroundPermissionsAsync as jest.MockedFunction<
  typeof Location.getForegroundPermissionsAsync
>;
const mockedRequest = Location.requestForegroundPermissionsAsync as jest.MockedFunction<
  typeof Location.requestForegroundPermissionsAsync
>;

function response(granted: boolean, canAskAgain: boolean) {
  return { granted, canAskAgain } as Awaited<
    ReturnType<typeof Location.requestForegroundPermissionsAsync>
  >;
}

describe('location permissions', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedRequest.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('on non-Android platforms', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'ios');
    });

    it('resolves granted without touching expo-location', async () => {
      await expect(checkLocationPermission()).resolves.toBe('granted');
      await expect(requestLocationPermission()).resolves.toBe('granted');
      expect(mockedGet).not.toHaveBeenCalled();
      expect(mockedRequest).not.toHaveBeenCalled();
    });
  });

  describe('on Android', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
    });

    it('check resolves granted / denied from a read-only call, never requesting', async () => {
      mockedGet.mockResolvedValueOnce(response(true, true));
      await expect(checkLocationPermission()).resolves.toBe('granted');

      mockedGet.mockResolvedValueOnce(response(false, true));
      await expect(checkLocationPermission()).resolves.toBe('denied');

      expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('request resolves granted when the user allows', async () => {
      mockedRequest.mockResolvedValue(response(true, true));

      await expect(requestLocationPermission()).resolves.toBe('granted');
    });

    it('request resolves denied when refused but can ask again', async () => {
      mockedRequest.mockResolvedValue(response(false, true));

      await expect(requestLocationPermission()).resolves.toBe('denied');
    });

    it('request resolves blocked when refused with canAskAgain false', async () => {
      mockedRequest.mockResolvedValue(response(false, false));

      await expect(requestLocationPermission()).resolves.toBe('blocked');
    });
  });
});
