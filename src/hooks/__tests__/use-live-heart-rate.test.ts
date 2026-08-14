import { act, cleanup, renderHook } from '@testing-library/react-native';
import type { BleError, Characteristic } from 'react-native-ble-plx';

import { bleManager } from '@/ble/manager';
import { HR_STALE_CHECK_INTERVAL_MS, HR_STALE_THRESHOLD_MS } from '@/ble/heart-rate';
import { useLiveHeartRate } from '@/hooks/use-live-heart-rate';

// The staleness check only runs on the interval's own tick, so crossing the
// threshold requires advancing to (at least) the first tick past it, not
// just past the threshold itself.
const PAST_STALE_THRESHOLD_MS = HR_STALE_THRESHOLD_MS + HR_STALE_CHECK_INTERVAL_MS;

const mockedDiscover = jest.mocked(bleManager.discoverAllServicesAndCharacteristicsForDevice);
const mockedMonitor = jest.mocked(bleManager.monitorCharacteristicForDevice);

type MonitorListener = (error: BleError | null, characteristic: Characteristic | null) => void;

// flags=0x00 (UInt8 format), bpm=75/80 — see heart-rate.test.ts for the same
// hand-built fixture convention.
const UINT8_BPM_75 = 'AEs=';
const UINT8_BPM_80 = 'AFA=';

describe('useLiveHeartRate', () => {
  let capturedListener: MonitorListener = () => {};
  const removeSubscription = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    capturedListener = () => {};
    removeSubscription.mockReset();

    mockedDiscover.mockReset().mockResolvedValue({} as never);
    mockedMonitor.mockReset().mockImplementation((_deviceId, _service, _char, listener) => {
      capturedListener = listener as MonitorListener;
      return { remove: removeSubscription };
    });
  });

  afterEach(async () => {
    // See use-device-pairing.test.ts: unmount before switching back to real
    // timers so no fake-timer-scheduled interval leaks into later tests.
    await cleanup();
    jest.useRealTimers();
  });

  it('is a no-op for a null deviceId', async () => {
    const { result } = await renderHook(() => useLiveHeartRate(null, true));

    expect(mockedDiscover).not.toHaveBeenCalled();
    expect(result.current).toEqual({ bpm: null, status: 'awaitingFirstReading' });
  });

  it('discovers then monitors the HR characteristic for a non-null deviceId', async () => {
    await renderHook(() => useLiveHeartRate('device-1', true));

    expect(mockedDiscover).toHaveBeenCalledWith('device-1');

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedMonitor).toHaveBeenCalledWith('device-1', '180D', '2A37', expect.any(Function));
  });

  it('moves to live with the parsed bpm on a valid notification', async () => {
    const { result } = await renderHook(() => useLiveHeartRate('device-1', true));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedListener(null, { value: UINT8_BPM_75 } as Characteristic);
    });

    expect(result.current).toEqual({ bpm: 75, status: 'live' });
  });

  it('goes stale once the threshold elapses with no further reading, keeping the last bpm', async () => {
    const { result } = await renderHook(() => useLiveHeartRate('device-1', true));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedListener(null, { value: UINT8_BPM_75 } as Characteristic);
    });

    await act(async () => {
      jest.advanceTimersByTime(PAST_STALE_THRESHOLD_MS);
    });

    expect(result.current).toEqual({ bpm: 75, status: 'stale' });
  });

  it('returns to live on a later valid reading after going stale', async () => {
    const { result } = await renderHook(() => useLiveHeartRate('device-1', true));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedListener(null, { value: UINT8_BPM_75 } as Characteristic);
    });
    await act(async () => {
      jest.advanceTimersByTime(PAST_STALE_THRESHOLD_MS);
    });
    expect(result.current.status).toBe('stale');

    await act(async () => {
      capturedListener(null, { value: UINT8_BPM_80 } as Characteristic);
    });

    expect(result.current).toEqual({ bpm: 80, status: 'live' });
  });

  it('ignores a monitor callback carrying an error', async () => {
    const { result } = await renderHook(() => useLiveHeartRate('device-1', true));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedListener({} as BleError, null);
    });

    expect(result.current).toEqual({ bpm: null, status: 'awaitingFirstReading' });
  });

  it('swallows a discovery rejection and stays awaitingFirstReading', async () => {
    mockedDiscover.mockReset().mockRejectedValue(new Error('device dropped'));

    const { result } = await renderHook(() => useLiveHeartRate('device-1', true));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedMonitor).not.toHaveBeenCalled();
    expect(result.current).toEqual({ bpm: null, status: 'awaitingFirstReading' });
  });

  it('removes the subscription on unmount', async () => {
    const { unmount } = await renderHook(() => useLiveHeartRate('device-1', true));
    await act(async () => {
      await Promise.resolve();
    });

    await unmount();

    expect(removeSubscription).toHaveBeenCalledTimes(1);
  });

  it('removes the previous subscription when deviceId changes', async () => {
    let deviceId: string | null = 'device-1';
    const { rerender } = await renderHook(() => useLiveHeartRate(deviceId, true));
    await act(async () => {
      await Promise.resolve();
    });

    deviceId = 'device-2';
    await act(async () => {
      await rerender(undefined);
      await Promise.resolve();
    });

    expect(removeSubscription).toHaveBeenCalledTimes(1);
    expect(mockedDiscover).toHaveBeenLastCalledWith('device-2');
  });

  describe('isConnected transitions', () => {
    it('never calls discoverAllServicesAndCharacteristicsForDevice while isConnected is false', async () => {
      await renderHook(() => useLiveHeartRate('device-1', false));
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockedDiscover).not.toHaveBeenCalled();
    });

    it('a false -> true transition re-runs discovery + monitor with the same deviceId', async () => {
      let isConnected = false;
      const { rerender } = await renderHook(() => useLiveHeartRate('device-1', isConnected));
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockedDiscover).not.toHaveBeenCalled();

      isConnected = true;
      await act(async () => {
        await rerender(undefined);
        await Promise.resolve();
      });

      expect(mockedDiscover).toHaveBeenCalledTimes(1);
      expect(mockedDiscover).toHaveBeenCalledWith('device-1');
      expect(mockedMonitor).toHaveBeenCalledTimes(1);
    });

    it('a true -> false transition tears down the old subscription without a new discovery call', async () => {
      let isConnected = true;
      const { rerender } = await renderHook(() => useLiveHeartRate('device-1', isConnected));
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockedDiscover).toHaveBeenCalledTimes(1);

      isConnected = false;
      await act(async () => {
        await rerender(undefined);
        await Promise.resolve();
      });

      expect(removeSubscription).toHaveBeenCalledTimes(1);
      expect(mockedDiscover).toHaveBeenCalledTimes(1);
    });

    it('a true -> false -> true transition results in exactly two discovery calls total, with the first subscription removed before the second begins', async () => {
      let isConnected = true;
      const { rerender } = await renderHook(() => useLiveHeartRate('device-1', isConnected));
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockedDiscover).toHaveBeenCalledTimes(1);

      isConnected = false;
      await act(async () => {
        await rerender(undefined);
        await Promise.resolve();
      });
      expect(removeSubscription).toHaveBeenCalledTimes(1);

      isConnected = true;
      await act(async () => {
        await rerender(undefined);
        await Promise.resolve();
      });

      expect(mockedDiscover).toHaveBeenCalledTimes(2);
      expect(mockedMonitor).toHaveBeenCalledTimes(2);
    });
  });
});
