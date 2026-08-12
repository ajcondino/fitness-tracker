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
} {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [scanEpoch, setScanEpoch] = useState(0);

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

  const eligible = canScan({ adapter, connection }, { permissionGranted, isFocused, isAppActive });

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
      () => {
        if (connectTimeoutRef.current != null) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        usePairingStore.getState().connectSucceeded(deviceId);
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
    bleManager.cancelDeviceConnection(previousId).catch(() => {
      // Cancelling an attempt that already resolved or was never fully
      // established natively is an expected no-op, not a bug to surface.
    });
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
  };
}
