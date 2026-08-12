import { act, cleanup, renderHook } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { AppState } from 'react-native';
import type { BleError, Device } from 'react-native-ble-plx';
import { BleErrorCode, State } from 'react-native-ble-plx';

import { bleManager } from '@/ble/manager';
import { usePairingStore } from '@/ble/pairing-store';
import {
  CONNECT_TIMEOUT_MS,
  DEVICE_COMMIT_INTERVAL_MS,
  SCAN_TIMEOUT_MS,
} from '@/ble/pairing-types';
import { useDevicePairing } from '@/hooks/use-device-pairing';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }));

const mockedUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;
const mockedOnStateChange = jest.mocked(bleManager.onStateChange);
const mockedStartDeviceScan = jest.mocked(bleManager.startDeviceScan);
const mockedStopDeviceScan = jest.mocked(bleManager.stopDeviceScan);
const mockedConnectToDevice = jest.mocked(bleManager.connectToDevice);
const mockedCancelDeviceConnection = jest.mocked(bleManager.cancelDeviceConnection);

let capturedStateListener: (state: State) => void = () => {};
let capturedScanListener: (error: BleError | null, device: Device | null) => void = () => {};

function mockAppState() {
  let listener: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    listener = callback as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  return { triggerAppState: (state: string) => listener(state) };
}

describe('useDevicePairing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    usePairingStore.getState().reset();
    mockedUseIsFocused.mockReturnValue(true);
    AppState.currentState = 'active';

    capturedStateListener = () => {};
    capturedScanListener = () => {};

    mockedOnStateChange.mockReset().mockImplementation((listener, emitCurrentState) => {
      capturedStateListener = listener;
      if (emitCurrentState) {
        listener(State.PoweredOn);
      }
      return { remove: jest.fn() };
    });
    mockedStartDeviceScan.mockReset().mockImplementation((_uuids, _options, listener) => {
      capturedScanListener = listener;
      return Promise.resolve();
    });
    mockedStopDeviceScan.mockReset().mockResolvedValue(undefined);
    mockedConnectToDevice.mockReset();
    mockedCancelDeviceConnection.mockReset().mockResolvedValue({} as unknown as Device);
  });

  afterEach(async () => {
    // Unmount any still-mounted hook from this test *before* switching back
    // to real timers — a pending fake-timer-scheduled interval/timeout
    // cleared after the switch would be clearing an id the real timer
    // implementation never assigned, leaking timers into later tests.
    await cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls usePairingStore.getState().reset() exactly once, on mount', async () => {
    let resetCalls = 0;
    const originalReset = usePairingStore.getState().reset;
    usePairingStore.setState({
      reset: () => {
        resetCalls += 1;
        originalReset();
      },
    });

    await renderHook(() => useDevicePairing(true));

    expect(resetCalls).toBe(1);
  });

  describe('scan gating', () => {
    it('starts scanning once permission, focus, app-active, and adapter poweredOn are all satisfied', async () => {
      await renderHook(() => useDevicePairing(true));

      expect(mockedStartDeviceScan).toHaveBeenCalledTimes(1);
      expect(mockedStartDeviceScan).toHaveBeenCalledWith(null, null, expect.any(Function));
    });

    it('does not start scanning when permission is not granted', async () => {
      await renderHook(() => useDevicePairing(false));

      expect(mockedStartDeviceScan).not.toHaveBeenCalled();
    });

    it('does not start scanning when the tab is not focused', async () => {
      mockedUseIsFocused.mockReturnValue(false);

      await renderHook(() => useDevicePairing(true));

      expect(mockedStartDeviceScan).not.toHaveBeenCalled();
    });

    it('does not start scanning when the app is not active', async () => {
      AppState.currentState = 'background';

      await renderHook(() => useDevicePairing(true));

      expect(mockedStartDeviceScan).not.toHaveBeenCalled();
    });

    it('does not start scanning when the adapter is not poweredOn', async () => {
      mockedOnStateChange.mockReset().mockImplementation((listener, emitCurrentState) => {
        capturedStateListener = listener;
        if (emitCurrentState) {
          listener(State.PoweredOff);
        }
        return { remove: jest.fn() };
      });

      await renderHook(() => useDevicePairing(true));

      expect(mockedStartDeviceScan).not.toHaveBeenCalled();
    });
  });

  describe('scan lifecycle and commit batching', () => {
    it('commits the aggregator snapshot into the store at most once per DEVICE_COMMIT_INTERVAL_MS, not once per raw callback', async () => {
      const { result } = await renderHook(() => useDevicePairing(true));

      await act(async () => {
        // A burst of raw callbacks between commit ticks — should only ever
        // update the in-memory aggregator, never the store directly.
        capturedScanListener(null, {
          id: 'device-1',
          name: 'HRM',
          localName: null,
          rssi: -50,
          isConnectable: true,
        } as unknown as Device);
        capturedScanListener(null, {
          id: 'device-1',
          name: 'HRM',
          localName: null,
          rssi: -52,
          isConnectable: true,
        } as unknown as Device);
      });

      expect(result.current.devices).toEqual([]);

      await act(async () => {
        jest.advanceTimersByTime(DEVICE_COMMIT_INTERVAL_MS);
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0].id).toBe('device-1');
    });

    it('drops a device reading with a null rssi rather than fabricating one', async () => {
      await renderHook(() => useDevicePairing(true));

      await act(async () => {
        capturedScanListener(null, {
          id: 'device-1',
          name: 'HRM',
          localName: null,
          rssi: null,
          isConnectable: true,
        } as unknown as Device);
        jest.advanceTimersByTime(DEVICE_COMMIT_INTERVAL_MS);
      });

      expect(usePairingStore.getState().devices).toEqual([]);
    });

    it('stops scanning and times out after SCAN_TIMEOUT_MS with no manual stop', async () => {
      await renderHook(() => useDevicePairing(true));

      await act(async () => {
        jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
      });

      expect(mockedStopDeviceScan).toHaveBeenCalled();
      expect(usePairingStore.getState().scan).toEqual({ kind: 'idle' });
    });

    it('stops scanning on unmount', async () => {
      const { unmount } = await renderHook(() => useDevicePairing(true));

      await unmount();

      expect(mockedStopDeviceScan).toHaveBeenCalledTimes(1);
    });

    it('stops scanning on a focus-to-blur transition', async () => {
      const { rerender } = await renderHook(() => useDevicePairing(true));

      expect(mockedStartDeviceScan).toHaveBeenCalledTimes(1);

      mockedUseIsFocused.mockReturnValue(false);
      await act(async () => {
        await rerender(undefined);
      });

      expect(mockedStopDeviceScan).toHaveBeenCalledTimes(1);
    });

    it('stops scanning on an app-active-to-background transition', async () => {
      const { triggerAppState } = mockAppState();
      await renderHook(() => useDevicePairing(true));

      expect(mockedStartDeviceScan).toHaveBeenCalledTimes(1);

      await act(async () => {
        triggerAppState('background');
      });

      expect(mockedStopDeviceScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('scan errors', () => {
    it('reports scanErrored(startFailed) for a ScanStartFailed error', async () => {
      await renderHook(() => useDevicePairing(true));

      await act(async () => {
        capturedScanListener(
          { errorCode: BleErrorCode.ScanStartFailed } as unknown as BleError,
          null,
        );
      });

      expect(usePairingStore.getState().scan).toEqual({ kind: 'scanError', reason: 'startFailed' });
    });

    it('reports scanErrored(locationServicesDisabled) for a LocationServicesDisabled error', async () => {
      await renderHook(() => useDevicePairing(true));

      await act(async () => {
        capturedScanListener(
          { errorCode: BleErrorCode.LocationServicesDisabled } as unknown as BleError,
          null,
        );
      });

      expect(usePairingStore.getState().scan).toEqual({
        kind: 'scanError',
        reason: 'locationServicesDisabled',
      });
    });

    it('never reports scanErrored for a BluetoothPoweredOff error, deferring to the adapter subscription', async () => {
      await renderHook(() => useDevicePairing(true));

      await act(async () => {
        // The authoritative transition — arrives first per the spike finding.
        capturedStateListener(State.PoweredOff);
      });
      expect(usePairingStore.getState().scan.kind).toBe('idle');

      await act(async () => {
        capturedScanListener(
          { errorCode: BleErrorCode.BluetoothPoweredOff } as unknown as BleError,
          null,
        );
      });

      expect(usePairingStore.getState().scan.kind).toBe('idle');
    });
  });

  describe('connect', () => {
    it('never issues a second concurrent connect attempt', async () => {
      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
        result.current.connect('device-2');
      });

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(1);
      expect(usePairingStore.getState().connection).toMatchObject({ deviceId: 'device-1' });
    });

    it('reports connectFailed(timeout) and cancels the native attempt when CONNECT_TIMEOUT_MS elapses unresolved', async () => {
      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      await act(async () => {
        jest.advanceTimersByTime(CONNECT_TIMEOUT_MS);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'device-1',
        reason: 'timeout',
      });
      expect(mockedCancelDeviceConnection).toHaveBeenCalledWith('device-1');
    });

    it('reports connectFailed(deviceUnavailable) for a DeviceNotFound rejection', async () => {
      mockedConnectToDevice.mockRejectedValue({
        errorCode: BleErrorCode.DeviceNotFound,
      } as unknown as BleError);
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'device-1',
        reason: 'deviceUnavailable',
      });
    });

    it('reports connectFailed(deviceUnavailable) for a DeviceConnectionFailed rejection', async () => {
      mockedConnectToDevice.mockRejectedValue({
        errorCode: BleErrorCode.DeviceConnectionFailed,
      } as unknown as BleError);
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'device-1',
        reason: 'deviceUnavailable',
      });
    });

    it('reports connectSucceeded on resolution', async () => {
      mockedConnectToDevice.mockResolvedValue({} as unknown as Device);
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });

    it('cancelConnect() during connecting sets disconnected and cancels the native attempt', async () => {
      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });
      await act(async () => {
        result.current.cancelConnect();
      });

      expect(usePairingStore.getState().connection).toEqual({ kind: 'disconnected' });
      expect(mockedCancelDeviceConnection).toHaveBeenCalledWith('device-1');
    });

    it('cancelConnect() is a no-op when not currently connecting', async () => {
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.cancelConnect();
      });

      expect(usePairingStore.getState().connection).toEqual({ kind: 'disconnected' });
      expect(mockedCancelDeviceConnection).not.toHaveBeenCalled();
    });
  });
});
