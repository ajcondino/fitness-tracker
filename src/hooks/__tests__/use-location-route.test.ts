import * as Location from 'expo-location';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';

import { useLocationRoute } from '@/hooks/use-location-route';
import type { SessionPhase } from '@/hooks/use-workout-session';
import { LOCATION_SAMPLE_INTERVAL_MS } from '@/location/location-config';
import { checkLocationPermission, requestLocationPermission } from '@/location/permissions';

jest.mock('expo-location', () => ({
  LocationAccuracy: { Balanced: 3 },
  hasServicesEnabledAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));
jest.mock('@/location/permissions');

const mockedCheck = checkLocationPermission as jest.MockedFunction<typeof checkLocationPermission>;
const mockedRequest = requestLocationPermission as jest.MockedFunction<
  typeof requestLocationPermission
>;
const mockedServicesEnabled = Location.hasServicesEnabledAsync as jest.MockedFunction<
  typeof Location.hasServicesEnabledAsync
>;
const mockedWatch = Location.watchPositionAsync as jest.MockedFunction<
  typeof Location.watchPositionAsync
>;

type FixCallback = (location: Location.LocationObject) => void;

let deliverFix: FixCallback;
let deliverError: (reason: string) => void;
let remove: jest.Mock;

function fix(latitude: number, longitude: number) {
  return { coords: { latitude, longitude } } as Location.LocationObject;
}

function mockAppState() {
  let listener: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    listener = callback as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  return { triggerAppState: (state: string) => listener(state) };
}

async function renderRunning(initialPhase: SessionPhase = 'running') {
  const hook = await renderHook(({ phase }: { phase: SessionPhase }) => useLocationRoute(phase), {
    initialProps: { phase: initialPhase },
  });
  return hook;
}

describe('useLocationRoute', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 10_000 });
    mockedCheck.mockReset().mockResolvedValue('granted');
    mockedRequest.mockReset();
    mockedServicesEnabled.mockReset().mockResolvedValue(true);
    remove = jest.fn();
    mockedWatch.mockReset().mockImplementation(async (_options, callback, errorHandler) => {
      deliverFix = callback;
      deliverError = errorHandler as (reason: string) => void;
      return { remove };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('samples at LOCATION_SAMPLE_INTERVAL_MS and records timestamped points while running', async () => {
    const { result } = await renderRunning();
    await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));

    expect(mockedWatch.mock.calls[0][0]).toMatchObject({
      timeInterval: LOCATION_SAMPLE_INTERVAL_MS,
    });
    expect(result.current.status).toBe('acquiring-fix');

    await act(async () => {
      deliverFix(fix(14.5, 121));
    });

    expect(result.current.route).toEqual([{ latitude: 14.5, longitude: 121, timestamp: 10_000 }]);
    expect(result.current.status).toBe('sampling');
  });

  it('does not subscribe while idle', async () => {
    await renderRunning('idle');
    await act(async () => {});

    expect(mockedWatch).not.toHaveBeenCalled();
  });

  it('tears the subscription down on pause and records nothing while paused', async () => {
    const { result, rerender } = await renderRunning();
    await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));
    await act(async () => {
      deliverFix(fix(1, 1));
    });

    await rerender({ phase: 'paused' });

    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => {
      deliverFix(fix(2, 2));
    });
    expect(result.current.route).toHaveLength(1);
    expect(result.current.status).toBe('idle');
  });

  it('drops a fix delivered right after pause, before teardown settles', async () => {
    const { result, rerender } = await renderRunning();
    await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));
    const lateFix = deliverFix;

    await rerender({ phase: 'paused' });
    await act(async () => {
      lateFix(fix(9, 9));
    });

    expect(result.current.route).toEqual([]);
  });

  it('resumes recording on resume and returns to acquiring-fix until the next fix', async () => {
    const { result, rerender } = await renderRunning();
    await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));
    await act(async () => {
      deliverFix(fix(1, 1));
    });
    await rerender({ phase: 'paused' });

    await rerender({ phase: 'running' });
    await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('acquiring-fix');

    await act(async () => {
      deliverFix(fix(3, 3));
    });

    expect(result.current.route.map((p) => p.latitude)).toEqual([1, 3]);
    expect(result.current.status).toBe('sampling');
  });

  it('removes the subscription on unmount', async () => {
    const { unmount } = await renderRunning();
    await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));

    await unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  describe('permission', () => {
    it('stays idle and never samples when permission is only undetermined', async () => {
      mockedCheck.mockResolvedValue('denied');

      const { result } = await renderRunning();
      await act(async () => {});

      expect(result.current.status).toBe('idle');
      expect(mockedRequest).not.toHaveBeenCalled();
      expect(mockedWatch).not.toHaveBeenCalled();
    });

    it('requestAccess to a denial leaves route [] and shows permission-denied', async () => {
      mockedCheck.mockResolvedValue('denied');
      mockedRequest.mockResolvedValue('denied');
      const { result } = await renderRunning();

      await act(async () => {
        result.current.requestAccess();
      });

      expect(result.current.status).toBe('permission-denied');
      expect(result.current.route).toEqual([]);
      expect(mockedWatch).not.toHaveBeenCalled();
    });

    it('requestAccess to a block shows permission-denied-permanently and then no-ops', async () => {
      mockedCheck.mockResolvedValue('denied');
      mockedRequest.mockResolvedValue('blocked');
      const { result } = await renderRunning();
      await act(async () => {
        result.current.requestAccess();
      });

      expect(result.current.status).toBe('permission-denied-permanently');

      await act(async () => {
        result.current.requestAccess();
      });
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it('starts sampling once a requested permission is granted', async () => {
      mockedCheck.mockResolvedValue('denied');
      mockedRequest.mockResolvedValue('granted');
      const { result } = await renderRunning();

      await act(async () => {
        result.current.requestAccess();
      });

      await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));
      expect(result.current.status).toBe('acquiring-fix');
    });

    it('does not re-request once already granted', async () => {
      const { result } = await renderRunning('idle');
      await act(async () => {});

      await act(async () => {
        result.current.requestAccess();
      });

      expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('clears permission-denied-permanently when the app returns to foreground granted', async () => {
      const { triggerAppState } = mockAppState();
      mockedCheck.mockResolvedValue('denied');
      mockedRequest.mockResolvedValue('blocked');
      const { result } = await renderRunning();
      await act(async () => {
        result.current.requestAccess();
      });
      expect(result.current.status).toBe('permission-denied-permanently');

      mockedCheck.mockResolvedValue('granted');
      await act(async () => {
        triggerAppState('active');
      });

      await waitFor(() => expect(result.current.status).toBe('acquiring-fix'));
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it('keeps a blocked status through a foreground re-check that is still denied', async () => {
      const { triggerAppState } = mockAppState();
      mockedCheck.mockResolvedValue('denied');
      mockedRequest.mockResolvedValue('blocked');
      const { result } = await renderRunning();
      await act(async () => {
        result.current.requestAccess();
      });

      await act(async () => {
        triggerAppState('active');
      });

      expect(result.current.status).toBe('permission-denied-permanently');
    });

    it('openSettings opens system settings', async () => {
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
      const { result } = await renderRunning('idle');

      result.current.openSettings();

      expect(openSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('GPS unavailable', () => {
    it('shows gps-unavailable when location services are off, and recovers once they are back', async () => {
      mockedServicesEnabled.mockResolvedValue(false);
      const { result } = await renderRunning();
      await waitFor(() => expect(result.current.status).toBe('gps-unavailable'));
      expect(mockedWatch).not.toHaveBeenCalled();

      mockedServicesEnabled.mockResolvedValue(true);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(LOCATION_SAMPLE_INTERVAL_MS);
      });
      await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));
      expect(result.current.status).toBe('acquiring-fix');

      await act(async () => {
        deliverFix(fix(5, 5));
      });
      expect(result.current.status).toBe('sampling');
      expect(result.current.route).toHaveLength(1);
    });

    it('shows gps-unavailable on a provider error, and flips back to sampling on the next fix', async () => {
      const { result } = await renderRunning();
      await waitFor(() => expect(mockedWatch).toHaveBeenCalledTimes(1));
      await act(async () => {
        deliverFix(fix(1, 1));
      });

      await act(async () => {
        deliverError('provider disabled');
      });
      expect(result.current.status).toBe('gps-unavailable');

      await act(async () => {
        deliverFix(fix(2, 2));
      });
      expect(result.current.status).toBe('sampling');
      expect(result.current.route).toHaveLength(2);
    });

    it('treats a rejected watchPositionAsync as gps-unavailable without throwing', async () => {
      mockedWatch.mockRejectedValueOnce(new Error('boom'));

      const { result } = await renderRunning();

      await waitFor(() => expect(result.current.status).toBe('gps-unavailable'));
    });
  });
});
