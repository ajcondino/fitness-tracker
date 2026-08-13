import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Platform } from 'react-native';
import type { BleError, Device } from 'react-native-ble-plx';
import { BleErrorCode } from 'react-native-ble-plx';

import { usePairingStore } from '@/ble/pairing-store';
import type {
  AdapterPowerState,
  ConnectionState,
  DiscoveredDevice,
  ScanBarState,
} from '@/ble/pairing-types';
import {
  canScan,
  CONNECT_TIMEOUT_MS,
  DEVICE_COMMIT_INTERVAL_MS,
  deriveScanBarState,
  SCAN_TIMEOUT_MS,
  selectSortedDevices,
  toAdapterPowerState,
} from '@/ble/pairing-types';
import { bleManager } from '@/ble/manager';
import type { ScanAggregator } from '@/ble/scan-aggregator';
import { createScanAggregator } from '@/ble/scan-aggregator';
import type { SavedDevice } from '@/ble/saved-device';
import { clearSavedDevice, loadSavedDevice, saveDevice } from '@/ble/saved-device';

/**
 * The only I/O layer this ticket introduces: wires `bleManager`, `AppState`,
 * and `useIsFocused` to the aggregator and `usePairingStore`. Never lets
 * `bleManager` anywhere near the store directly — the manager's callbacks
 * call store actions; store actions never call the manager.
 */
export function useDevicePairing(permissionGranted: boolean): {
  adapter: AdapterPowerState;
  scanBarState: ScanBarState;
  devices: DiscoveredDevice[];
  connection: ConnectionState;
  connect: (deviceId: string) => void;
  cancelConnect: () => void;
  retryScan: () => void;
  openBluetoothSettings: () => void;
  savedDevice: SavedDevice | null;
  forgetDevice: () => void;
} {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [scanEpoch, setScanEpoch] = useState(0);
  const [savedDevice, setSavedDevice] = useState<SavedDevice | null | undefined>(undefined);
  // undefined = not yet loaded from storage; null = loaded, nothing saved;
  // SavedDevice = loaded, and this is the remembered device.
  const [autoReconnectPending, setAutoReconnectPending] = useState(true);
  const autoReconnectDeviceIdRef = useRef<string | null>(null);

  const adapter = usePairingStore((state) => state.adapter);
  const scan = usePairingStore((state) => state.scan);
  const devices = usePairingStore((state) => state.devices);
  const connection = usePairingStore((state) => state.connection);

  // One aggregator instance for the whole hook mount — lazily created so it
  // isn't reconstructed on every render.
  const aggregatorRef = useRef<ScanAggregator | null>(null);
  if (aggregatorRef.current === null) {
    aggregatorRef.current = createScanAggregator();
  }

  // Reset the store on every mount — keeps a genuine remount clean while
  // still letting the store persist across a tab blur/refocus, which never
  // unmounts this hook in the first place (see SPEC.md's Constraints).
  useEffect(() => {
    usePairingStore.getState().reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the saved device once per mount. Declared after the reset() effect
  // above so reset() always applies first within the initial commit —
  // though the async read guarantees this ordering regardless of
  // declaration position.
  useEffect(() => {
    let cancelled = false;
    loadSavedDevice().then((device) => {
      if (!cancelled) setSavedDevice(device);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fire the single auto-reconnect attempt once every gating condition is
  // met: the saved-device read has resolved, there is one to try, no
  // attempt has been made yet this mount, the user has granted BLE
  // permission, and the adapter has reached 'poweredOn' (never against an
  // unknown/off adapter).
  useEffect(() => {
    if (savedDevice === undefined) return; // still loading
    if (savedDevice === null) {
      setAutoReconnectPending(false); // nothing to try — unblock scanning
      return;
    }
    if (autoReconnectDeviceIdRef.current != null) return; // already attempted
    if (!permissionGranted || adapter !== 'poweredOn') return; // wait for both
    autoReconnectDeviceIdRef.current = savedDevice.id;
    connect(savedDevice.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDevice, permissionGranted, adapter]);

  // Once the attempt fired above has left 'connecting' (succeeded or
  // failed — connect()'s own CONNECT_TIMEOUT_MS and error handling apply
  // unchanged, so this is a single attempt with the same timeout ceiling
  // any manual connect already has, not a new timeout), unblock scanning.
  useEffect(() => {
    if (autoReconnectDeviceIdRef.current == null) return;
    if (
      connection.kind === 'connecting' &&
      connection.deviceId === autoReconnectDeviceIdRef.current
    ) {
      return; // still in flight
    }
    setAutoReconnectPending(false);
  }, [connection]);

  // Adapter subscription: mount → unmount, independent of focus/background.
  useEffect(() => {
    const subscription = bleManager.onStateChange((state) => {
      usePairingStore.getState().adapterStateChanged(toAdapterPowerState(state));
    }, true);

    return () => subscription.remove();
  }, []);

  // App-state tracking, same pattern as use-ble-permission-status.ts.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setIsAppActive(nextAppState === 'active');
    });

    return () => subscription.remove();
  }, []);

  const eligible = canScan(
    { adapter, connection },
    { permissionGranted, isFocused, isAppActive, autoReconnectPending },
  );

  // Scan start/stop effect. One dependency-array-driven effect covers
  // stopping on unmount, on focus loss, on app background, and on the
  // adapter leaving `poweredOn` mid-scan — `eligible` folds all of those in.
  useEffect(() => {
    if (!eligible) {
      return;
    }

    // Tracks whether the scan already self-reported its own end (timeout or
    // error) so the cleanup below doesn't double-report a `scanStopped`.
    let hasSelfEnded = false;

    const listener = (error: BleError | null, device: Device | null) => {
      if (error != null) {
        if (error.errorCode === BleErrorCode.BluetoothPoweredOff) {
          // Swallowed — `onStateChange` already produces the authoritative
          // transition (observed ~26ms earlier in the spike).
          return;
        }
        hasSelfEnded = true;
        if (error.errorCode === BleErrorCode.ScanStartFailed) {
          usePairingStore.getState().scanErrored('startFailed');
        } else if (error.errorCode === BleErrorCode.LocationServicesDisabled) {
          usePairingStore.getState().scanErrored('locationServicesDisabled');
        } else {
          usePairingStore.getState().scanErrored('unknown');
        }
        return;
      }

      if (device != null && device.rssi != null) {
        aggregatorRef.current!.ingest({
          id: device.id,
          name: device.name ?? device.localName ?? null,
          isConnectable: device.isConnectable ?? false,
          rssi: device.rssi,
          seenAt: Date.now(),
        });
      }
    };

    bleManager.startDeviceScan(null, null, listener);
    usePairingStore.getState().scanStarted(Date.now());

    const timeoutId = setTimeout(() => {
      hasSelfEnded = true;
      bleManager.stopDeviceScan();
      usePairingStore.getState().scanTimedOut();
    }, SCAN_TIMEOUT_MS);

    const intervalId = setInterval(() => {
      usePairingStore.getState().setDevices(aggregatorRef.current!.getSettledDevices());
    }, DEVICE_COMMIT_INTERVAL_MS);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      bleManager.stopDeviceScan();
      if (!hasSelfEnded) {
        usePairingStore.getState().scanStopped();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, scanEpoch]);

  // Pending connect-timeout handle, shared between `connect()` and the
  // connection-cleanup effect below so either side can clear it.
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function connect(deviceId: string) {
    if (usePairingStore.getState().connection.kind === 'connecting') {
      // Never issue a second concurrent attempt.
      return;
    }

    usePairingStore.getState().connectRequested(deviceId, Date.now());

    connectTimeoutRef.current = setTimeout(() => {
      usePairingStore.getState().connectFailed(deviceId, 'timeout');
    }, CONNECT_TIMEOUT_MS);

    bleManager.connectToDevice(deviceId).then(
      (device) => {
        if (connectTimeoutRef.current != null) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        usePairingStore.getState().connectSucceeded(deviceId);
        const saved: SavedDevice = { id: deviceId, name: device.name ?? device.localName ?? null };
        setSavedDevice(saved);
        void saveDevice(saved);
      },
      (error: BleError) => {
        if (connectTimeoutRef.current != null) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        const reason =
          error?.errorCode === BleErrorCode.DeviceConnectionFailed ||
          error?.errorCode === BleErrorCode.DeviceNotFound
            ? 'deviceUnavailable'
            : 'unknown';
        usePairingStore.getState().connectFailed(deviceId, reason);
      },
    );
  }

  function cancelConnect() {
    const currentConnection = usePairingStore.getState().connection;
    if (currentConnection.kind === 'connecting') {
      usePairingStore.getState().connectCancelled(currentConnection.deviceId);
    }
  }

  // Tracks the previously-seen `connecting` deviceId so that whenever
  // `connection.kind` is no longer `'connecting'` for that id, the pending
  // connect timeout is cleared and the native attempt is cancelled
  // best-effort — covering adapter-off-mid-connect, connect timeout, and
  // user-cancel with one mechanism instead of three bespoke call sites.
  const previousConnectingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (connection.kind === 'connecting') {
      previousConnectingIdRef.current = connection.deviceId;
      return;
    }

    const previousId = previousConnectingIdRef.current;
    if (previousId == null) {
      return;
    }
    previousConnectingIdRef.current = null;

    if (connectTimeoutRef.current != null) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    // Only cancel the native attempt when it did NOT land on `connected` —
    // `cancelDeviceConnection` disconnects an already-connected device, so
    // calling it after a successful connect would tear the pairing right
    // back down.
    if (connection.kind !== 'connected') {
      bleManager.cancelDeviceConnection(previousId).catch(() => {
        // Cancelling an attempt that already resolved or was never fully
        // established natively is an expected no-op, not a bug to surface.
      });
    }
  }, [connection]);

  // Device-disconnect subscription: active only while connected, to catch a
  // genuine mid-session drop (device out of range/dead/powered off). Adapter
  // loss while connected is instead caught by the onStateChange subscription
  // above, via adapterStateChanged's own cascade — both may fire for the same
  // physical cause (Bluetooth off while connected); whichever store action
  // lands first wins, the second is a no-op via connectionLost's staleness
  // guard, the same race tolerance already documented for the scan-listener/
  // onStateChange overlap.
  useEffect(() => {
    if (connection.kind !== 'connected') {
      return;
    }
    const deviceId = connection.deviceId;
    const subscription = bleManager.onDeviceDisconnected(deviceId, () => {
      usePairingStore.getState().connectionLost(deviceId, 'deviceDisconnected');
    });
    return () => subscription.remove();
  }, [connection]);

  function retryScan() {
    // Only meaningful when `canScan` is already true — otherwise this is a
    // harmless no-op since the scan effect's own `eligible` check still
    // gates it. Does not touch the aggregator: devices found earlier in the
    // mount stay listed.
    setScanEpoch((epoch) => epoch + 1);
  }

  function openBluetoothSettings() {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    }
  }

  // Scoped exactly to clearing this app's own reference — it does not call
  // bleManager, does not touch connection, and cannot attempt any OS-level
  // unpairing (see SPEC.md's Android-bonding note). A live connection to the
  // forgotten device, if any, is left running untouched.
  function forgetDevice() {
    setSavedDevice(null);
    void clearSavedDevice();
  }

  const scanBarState = deriveScanBarState(
    { adapter, scan, devices, connection },
    t('pairing.deviceRow.unknownDevice'),
  );

  return {
    adapter,
    scanBarState,
    devices: selectSortedDevices(devices),
    connection,
    connect,
    cancelConnect,
    retryScan,
    openBluetoothSettings,
    savedDevice: savedDevice ?? null, // collapses 'still loading' to 'none' for callers
    forgetDevice,
  };
}
