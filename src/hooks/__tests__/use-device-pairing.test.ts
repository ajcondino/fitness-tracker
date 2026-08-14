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
  RECONNECT_ATTEMPT_TIMEOUT_MS,
  RECONNECT_BACKOFF_MS,
  RECONNECT_MAX_ATTEMPTS,
  SCAN_TIMEOUT_MS,
} from '@/ble/pairing-types';
import { clearSavedDevice, loadSavedDevice, saveDevice } from '@/ble/saved-device';
import { useDevicePairing } from '@/hooks/use-device-pairing';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }));
jest.mock('@/ble/saved-device');

const mockedUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;
const mockedOnStateChange = jest.mocked(bleManager.onStateChange);
const mockedStartDeviceScan = jest.mocked(bleManager.startDeviceScan);
const mockedStopDeviceScan = jest.mocked(bleManager.stopDeviceScan);
const mockedConnectToDevice = jest.mocked(bleManager.connectToDevice);
const mockedCancelDeviceConnection = jest.mocked(bleManager.cancelDeviceConnection);
const mockedOnDeviceDisconnected = jest.mocked(bleManager.onDeviceDisconnected);
const mockedLoadSavedDevice = jest.mocked(loadSavedDevice);
const mockedSaveDevice = jest.mocked(saveDevice);
const mockedClearSavedDevice = jest.mocked(clearSavedDevice);

let capturedStateListener: (state: State) => void = () => {};
let capturedScanListener: (error: BleError | null, device: Device | null) => void = () => {};
let capturedDisconnectListener: (error: BleError | null, device: Device) => void = () => {};

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
    capturedDisconnectListener = () => {};

    mockedOnDeviceDisconnected.mockReset().mockImplementation((_deviceId, listener) => {
      capturedDisconnectListener = listener;
      return { remove: jest.fn() };
    });
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

    // Default: no saved device, so every pre-existing test in this file
    // (written before this ticket) keeps its byte-for-byte-unchanged mount
    // behavior — auto-reconnect resolves to "nothing to try" immediately.
    mockedLoadSavedDevice.mockReset().mockResolvedValue(null);
    mockedSaveDevice.mockReset().mockResolvedValue(undefined);
    mockedClearSavedDevice.mockReset().mockResolvedValue(undefined);
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

    it('reports connectSucceeded on resolution and does NOT cancel the newly-established connection', async () => {
      mockedConnectToDevice.mockResolvedValue({} as unknown as Device);
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
      // Regression: the connection-cleanup effect fires on any transition
      // away from 'connecting', including into 'connected' — it must not
      // call cancelDeviceConnection for that case, or every successful
      // pairing would be torn down immediately after it succeeds.
      expect(mockedCancelDeviceConnection).not.toHaveBeenCalled();
    });

    it('persists the resolved device name via saveDevice on a successful manual connect', async () => {
      mockedConnectToDevice.mockResolvedValue({
        name: 'Pulse HRM',
        localName: null,
      } as unknown as Device);
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      expect(mockedSaveDevice).toHaveBeenCalledWith({ id: 'device-1', name: 'Pulse HRM' });
      expect(result.current.savedDevice).toEqual({ id: 'device-1', name: 'Pulse HRM' });
    });

    it('falls back to localName, then null, for a successful connect whose Device has no name', async () => {
      mockedConnectToDevice.mockResolvedValue({
        name: null,
        localName: 'Local HRM',
      } as unknown as Device);
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      expect(mockedSaveDevice).toHaveBeenCalledWith({ id: 'device-1', name: 'Local HRM' });
      expect(result.current.savedDevice).toEqual({ id: 'device-1', name: 'Local HRM' });
    });

    it('a native promise that resolves successfully after the attempt already timed out does not flip connectionFailed back to connected', async () => {
      let resolveConnect!: (device: Device) => void;
      mockedConnectToDevice.mockReturnValue(
        new Promise<Device>((resolve) => {
          resolveConnect = resolve;
        }),
      );
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

      // The original native promise resolves late, after the timeout already
      // gave up on this attempt.
      await act(async () => {
        resolveConnect({} as unknown as Device);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'device-1',
        reason: 'timeout',
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

  describe('connection loss', () => {
    async function connectDevice1() {
      mockedConnectToDevice.mockResolvedValue({} as unknown as Device);
      const rendered = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        rendered.result.current.connect('device-1');
      });

      return rendered;
    }

    it('subscribes via onDeviceDisconnected(deviceId, ...) only once connection becomes connected, not while connecting', async () => {
      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      expect(mockedOnDeviceDisconnected).not.toHaveBeenCalled();
    });

    it('subscribes exactly once per connected session, once connected', async () => {
      await connectDevice1();

      expect(mockedOnDeviceDisconnected).toHaveBeenCalledTimes(1);
      expect(mockedOnDeviceDisconnected).toHaveBeenCalledWith('device-1', expect.any(Function));
    });

    it('invoking the captured disconnect listener while connected transitions to connectionLost(deviceDisconnected), which the auto-reconnect driver effect immediately advances to reconnecting', async () => {
      await connectDevice1();

      await act(async () => {
        capturedDisconnectListener(null, {} as Device);
      });

      // Since auto-reconnect-after-drop, a 'deviceDisconnected' loss is
      // followed with no further input by the driver effect scheduling
      // attempt 1 — visible immediately per SPEC.md's own Data Model note.
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'reconnecting',
        deviceId: 'device-1',
        attempt: 1,
      });
    });

    it('calls the subscription remove() when connection leaves connected on unmount', async () => {
      const remove = jest.fn();
      mockedOnDeviceDisconnected.mockReset().mockImplementation((_deviceId, listener) => {
        capturedDisconnectListener = listener;
        return { remove };
      });
      const { unmount } = await connectDevice1();

      await unmount();

      expect(remove).toHaveBeenCalled();
    });

    it('calls the subscription remove() when connection leaves connected via the adapter-off cascade', async () => {
      const remove = jest.fn();
      mockedOnDeviceDisconnected.mockReset().mockImplementation((_deviceId, listener) => {
        capturedDisconnectListener = listener;
        return { remove };
      });
      await connectDevice1();

      await act(async () => {
        capturedStateListener(State.PoweredOff);
      });

      expect(remove).toHaveBeenCalled();
    });

    it('race A: adapter-off arriving first makes a subsequent disconnect-event a no-op', async () => {
      await connectDevice1();

      await act(async () => {
        capturedStateListener(State.PoweredOff);
      });
      await act(async () => {
        capturedDisconnectListener(null, {} as Device);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionLost',
        deviceId: 'device-1',
        reason: 'adapterOff',
      });
    });

    it('race B: a disconnect event arriving first starts a reconnect, and a subsequent adapter-off ends it at connectionLost(adapterOff)', async () => {
      await connectDevice1();

      await act(async () => {
        capturedDisconnectListener(null, {} as Device);
      });
      // Since auto-reconnect-after-drop, the disconnect event's own
      // connectionLost('deviceDisconnected') is immediately superseded by
      // the driver effect's 'reconnecting' — no longer a resting state this
      // adapter-off can find as a no-op target.
      expect(usePairingStore.getState().connection.kind).toBe('reconnecting');

      await act(async () => {
        capturedStateListener(State.PoweredOff);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionLost',
        deviceId: 'device-1',
        reason: 'adapterOff',
      });
    });
  });

  describe('auto-reconnect after a mid-session drop', () => {
    async function connectAndDrop() {
      mockedConnectToDevice.mockResolvedValueOnce({} as unknown as Device);
      const rendered = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        rendered.result.current.connect('device-1');
      });

      await act(async () => {
        capturedDisconnectListener(null, {} as Device);
      });

      return rendered;
    }

    it('shows reconnecting attempt 1 immediately on the drop, then retries only after RECONNECT_BACKOFF_MS[0]', async () => {
      await connectAndDrop();

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'reconnecting',
        deviceId: 'device-1',
        attempt: 1,
      });
      expect(mockedConnectToDevice).toHaveBeenCalledTimes(1); // just the initial manual connect

      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[0]);
      });

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(2);
      expect(mockedConnectToDevice).toHaveBeenLastCalledWith('device-1');
    });

    it('a rejected attempt before the last schedules the next attempt after the correct backoff, incrementing connection.attempt', async () => {
      await connectAndDrop();

      let rejectAttempt1!: (error: BleError) => void;
      mockedConnectToDevice.mockReturnValue(
        new Promise<Device>((_resolve, reject) => {
          rejectAttempt1 = reject;
        }),
      );
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[0]);
      });
      await act(async () => {
        rejectAttempt1({ errorCode: BleErrorCode.DeviceNotFound } as unknown as BleError);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'reconnecting',
        deviceId: 'device-1',
        attempt: 2,
      });

      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[1]);
      });

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(3); // initial + attempt 1 + attempt 2
    });

    it('a successful resolution during a later attempt transitions to connected, persists the device, and stops further attempts', async () => {
      await connectAndDrop();

      let rejectAttempt1!: (error: BleError) => void;
      mockedConnectToDevice.mockReturnValue(
        new Promise<Device>((_resolve, reject) => {
          rejectAttempt1 = reject;
        }),
      );
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[0]);
      });
      await act(async () => {
        rejectAttempt1({ errorCode: BleErrorCode.DeviceNotFound } as unknown as BleError);
      });

      mockedConnectToDevice.mockResolvedValue({
        name: 'Pulse HRM',
        localName: null,
      } as unknown as Device);
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[1]);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
      expect(mockedSaveDevice).toHaveBeenCalledWith({ id: 'device-1', name: 'Pulse HRM' });

      const callsBefore = mockedConnectToDevice.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[2] + RECONNECT_ATTEMPT_TIMEOUT_MS + 60_000);
      });

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(callsBefore);
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });

    it('all RECONNECT_MAX_ATTEMPTS attempts failing lands on reconnectFailed and schedules no further attempt', async () => {
      await connectAndDrop();

      for (let attempt = 0; attempt < RECONNECT_MAX_ATTEMPTS; attempt++) {
        let rejectAttempt!: (error: BleError) => void;
        mockedConnectToDevice.mockReturnValue(
          new Promise<Device>((_resolve, reject) => {
            rejectAttempt = reject;
          }),
        );
        await act(async () => {
          jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[attempt]);
        });
        await act(async () => {
          rejectAttempt({ errorCode: BleErrorCode.DeviceNotFound } as unknown as BleError);
        });
      }

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'reconnectFailed',
        deviceId: 'device-1',
      });

      const callsBefore = mockedConnectToDevice.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(callsBefore);
    });

    it('a connectionLost with reason adapterOff never starts a reconnect attempt', async () => {
      mockedConnectToDevice.mockResolvedValueOnce({} as unknown as Device);
      const { result } = await renderHook(() => useDevicePairing(false));

      await act(async () => {
        result.current.connect('device-1');
      });

      await act(async () => {
        // Bluetooth itself turned off while connected.
        capturedStateListener(State.PoweredOff);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionLost',
        deviceId: 'device-1',
        reason: 'adapterOff',
      });

      const callsBefore = mockedConnectToDevice.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(callsBefore);
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionLost',
        deviceId: 'device-1',
        reason: 'adapterOff',
      });
    });

    it('connect() while reconnecting is a no-op: no connectRequested call, connection unchanged', async () => {
      const { result } = await connectAndDrop();

      const before = usePairingStore.getState().connection;
      const callsBefore = mockedConnectToDevice.mock.calls.length;

      await act(async () => {
        result.current.connect('device-2');
      });

      expect(usePairingStore.getState().connection).toEqual(before);
      expect(mockedConnectToDevice).toHaveBeenCalledTimes(callsBefore);
    });

    it('a late resolution from a superseded attempt (its own timeout already fired, next attempt started) calls cancelDeviceConnection and does not mutate connection or call reconnectSucceeded', async () => {
      await connectAndDrop();

      let resolveAttempt1!: (device: Device) => void;
      mockedConnectToDevice.mockReturnValue(
        new Promise<Device>((resolve) => {
          resolveAttempt1 = resolve;
        }),
      );
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_BACKOFF_MS[0]);
      });

      // Attempt 1's own RECONNECT_ATTEMPT_TIMEOUT_MS elapses unresolved,
      // superseding it with attempt 2.
      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));
      await act(async () => {
        jest.advanceTimersByTime(RECONNECT_ATTEMPT_TIMEOUT_MS);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'reconnecting',
        deviceId: 'device-1',
        attempt: 2,
      });

      // Attempt 1's native promise now resolves late.
      await act(async () => {
        resolveAttempt1({} as unknown as Device);
      });

      expect(mockedCancelDeviceConnection).toHaveBeenCalledWith('device-1');
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'reconnecting',
        deviceId: 'device-1',
        attempt: 2,
      });
    });
  });

  describe('saved device / auto-reconnect', () => {
    it('with no saved device, scanning starts exactly as today and connectToDevice is never called before a manual connect()', async () => {
      mockedLoadSavedDevice.mockResolvedValue(null);

      await renderHook(() => useDevicePairing(true));

      expect(mockedStartDeviceScan).toHaveBeenCalledTimes(1);
      expect(mockedConnectToDevice).not.toHaveBeenCalled();
    });

    it('attempts connectToDevice with the saved id when adapter is poweredOn and permission is granted, and never starts a scan once it succeeds', async () => {
      mockedLoadSavedDevice.mockResolvedValue({ id: 'saved-1', name: 'Saved HRM' });
      mockedConnectToDevice.mockResolvedValue({
        name: 'Saved HRM',
        localName: null,
      } as unknown as Device);

      await renderHook(() => useDevicePairing(true));

      expect(mockedConnectToDevice).toHaveBeenCalledWith('saved-1');
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'saved-1',
      });
      expect(mockedSaveDevice).toHaveBeenCalledWith({ id: 'saved-1', name: 'Saved HRM' });
      // canScan's existing 'connected' exclusion means no scan is ever
      // started for the remainder of this mount.
      expect(mockedStartDeviceScan).not.toHaveBeenCalled();
    });

    it('starts scanning only after a failed auto-reconnect attempt settles, never before', async () => {
      mockedLoadSavedDevice.mockResolvedValue({ id: 'saved-1', name: 'Saved HRM' });
      let rejectConnect!: (error: BleError) => void;
      mockedConnectToDevice.mockReturnValue(
        new Promise<Device>((_resolve, reject) => {
          rejectConnect = reject;
        }),
      );

      await renderHook(() => useDevicePairing(true));

      expect(mockedConnectToDevice).toHaveBeenCalledWith('saved-1');
      expect(mockedStartDeviceScan).not.toHaveBeenCalled();

      await act(async () => {
        rejectConnect({ errorCode: BleErrorCode.DeviceNotFound } as unknown as BleError);
      });

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'saved-1',
        reason: 'deviceUnavailable',
      });
      expect(mockedStartDeviceScan).toHaveBeenCalledTimes(1);
    });

    it('waits for the adapter to reach poweredOn before attempting the saved device', async () => {
      mockedLoadSavedDevice.mockResolvedValue({ id: 'saved-1', name: 'Saved HRM' });
      mockedOnStateChange.mockReset().mockImplementation((listener, emitCurrentState) => {
        capturedStateListener = listener;
        if (emitCurrentState) {
          listener(State.PoweredOff);
        }
        return { remove: jest.fn() };
      });
      mockedConnectToDevice.mockResolvedValue({} as unknown as Device);

      await renderHook(() => useDevicePairing(true));

      expect(mockedConnectToDevice).not.toHaveBeenCalled();

      await act(async () => {
        capturedStateListener(State.PoweredOn);
      });

      expect(mockedConnectToDevice).toHaveBeenCalledWith('saved-1');
    });

    it('waits for permission to be granted before attempting the saved device', async () => {
      mockedLoadSavedDevice.mockResolvedValue({ id: 'saved-1', name: 'Saved HRM' });
      mockedConnectToDevice.mockResolvedValue({} as unknown as Device);

      const { rerender } = await renderHook(
        ({ granted }: { granted: boolean }) => useDevicePairing(granted),
        { initialProps: { granted: false } },
      );

      expect(mockedConnectToDevice).not.toHaveBeenCalled();

      await act(async () => {
        await rerender({ granted: true });
      });

      expect(mockedConnectToDevice).toHaveBeenCalledWith('saved-1');
    });

    it('only ever attempts connectToDevice once for the saved device, regardless of later adapter/permission changes', async () => {
      mockedLoadSavedDevice.mockResolvedValue({ id: 'saved-1', name: 'Saved HRM' });
      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));

      await renderHook(() => useDevicePairing(true));

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(1);

      await act(async () => {
        capturedStateListener(State.PoweredOff);
      });
      await act(async () => {
        capturedStateListener(State.PoweredOn);
      });

      expect(mockedConnectToDevice).toHaveBeenCalledTimes(1);
    });

    it('forgetDevice() calls clearSavedDevice() and flips the returned savedDevice to null, without touching bleManager or connection', async () => {
      mockedLoadSavedDevice.mockResolvedValue({ id: 'saved-1', name: 'Saved HRM' });
      mockedConnectToDevice.mockReturnValue(new Promise<Device>(() => {}));

      const { result } = await renderHook(() => useDevicePairing(true));

      expect(result.current.savedDevice).toEqual({ id: 'saved-1', name: 'Saved HRM' });

      await act(async () => {
        result.current.forgetDevice();
      });

      expect(mockedClearSavedDevice).toHaveBeenCalledTimes(1);
      expect(result.current.savedDevice).toBeNull();
      expect(mockedCancelDeviceConnection).not.toHaveBeenCalled();
      expect(usePairingStore.getState().connection.kind).toBe('connecting');
    });
  });
});
