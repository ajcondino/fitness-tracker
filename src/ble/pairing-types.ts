import type { State as BleState } from 'react-native-ble-plx';

/**
 * Framework-free types, constants, and pure derivations for device
 * scanning/discovery/connection. No BLE, Zustand, or React import — the one
 * exception is `BleState`, used purely as a compile-time type for
 * `toAdapterPowerState`'s input.
 */

export type AdapterPowerState =
  | 'unknown' // State.Unknown — adapter status not yet known
  | 'poweredOn'
  | 'poweredOff'
  | 'resetting' // real, non-error transient state (~285ms observed) — never rendered as a failure
  | 'unsupported'
  | 'unauthorized';

export type ScanState =
  | { kind: 'idle' } // never started this mount, or stopped (timeout/manual/gated-off)
  | { kind: 'scanning'; startedAt: number }
  | { kind: 'scanError'; reason: 'startFailed' | 'locationServicesDisabled' | 'unknown' };

export type ConnectionFailureReason =
  | 'timeout' // CONNECT_TIMEOUT_MS elapsed with no native resolution
  | 'deviceUnavailable' // native connect rejected with DeviceConnectionFailed/DeviceNotFound
  | 'adapterOff' // adapter left `poweredOn` while this device was connecting
  | 'unknown';

export type ConnectionLossReason =
  | 'adapterOff' // phone Bluetooth turned off while this device was connected
  | 'deviceDisconnected'; // the device itself dropped: out of range, dead battery, powered off

export type ConnectionState =
  | { kind: 'disconnected' }
  | { kind: 'connecting'; deviceId: string; startedAt: number }
  | { kind: 'connected'; deviceId: string }
  | { kind: 'connectionFailed'; deviceId: string; reason: ConnectionFailureReason }
  | { kind: 'connectionLost'; deviceId: string; reason: ConnectionLossReason };

export type DiscoveredDevice = {
  id: string;
  name: string | null; // the aggregator's most recent non-stale reading, or null
  lastKnownName: string | null; // sticky once set — never cleared by a later null `name`
  isConnectable: boolean;
  medianRssi: number; // already smoothed by the aggregator before this ever reaches the store
  firstSeenAt: number; // stable sort tiebreaker — never changes after first insert
  lastSeenAt: number;
};

export type RawScanSample = {
  id: string;
  name: string | null;
  isConnectable: boolean;
  rssi: number;
  seenAt: number;
};

/** The aggregator's rolling median window per device — odd, so the median is
 * always a real sample, never an average of two. */
export const RSSI_WINDOW_SIZE = 5;

/** Devices are sorted by `floor(medianRssi / RSSI_SORT_BUCKET_DBM)`, not raw
 * RSSI, so close-range jitter can't reorder rows. */
export const RSSI_SORT_BUCKET_DBM = 6;

/** How often the hook flushes the aggregator's settled snapshot into the
 * store. */
export const DEVICE_COMMIT_INTERVAL_MS = 500;

/** How long a scanning session runs before requiring a manual "SCAN AGAIN". */
export const SCAN_TIMEOUT_MS = 30_000;

/** How long a single connect attempt is allowed to hang before this spec's
 * own timeout fires. */
export const CONNECT_TIMEOUT_MS = 15_000;

export function toAdapterPowerState(state: BleState): AdapterPowerState {
  switch (state) {
    case 'PoweredOn':
      return 'poweredOn';
    case 'PoweredOff':
      return 'poweredOff';
    case 'Resetting':
      return 'resetting';
    case 'Unsupported':
      return 'unsupported';
    case 'Unauthorized':
      return 'unauthorized';
    case 'Unknown':
    default:
      return 'unknown';
  }
}

export function selectSortedDevices(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  return [...devices].sort((a, b) => {
    const bucketA = Math.floor(a.medianRssi / RSSI_SORT_BUCKET_DBM);
    const bucketB = Math.floor(b.medianRssi / RSSI_SORT_BUCKET_DBM);
    if (bucketA !== bucketB) {
      // Higher (less negative) RSSI bucket first — nearest first.
      return bucketB - bucketA;
    }
    // Stable tiebreaker within the same bucket: first seen, first listed.
    return a.firstSeenAt - b.firstSeenAt;
  });
}

export function selectDeviceDisplayName(
  device: DiscoveredDevice,
  fallback: string,
): { text: string; isFallback: boolean } {
  if (device.name != null) {
    return { text: device.name, isFallback: false };
  }
  if (device.lastKnownName != null) {
    return { text: device.lastKnownName, isFallback: false };
  }
  return { text: fallback, isFallback: true };
}

export type ScanBarState =
  | { kind: 'checkingAdapter' } // adapter === 'unknown'
  | { kind: 'adapterOff' }
  | { kind: 'adapterResetting' }
  | { kind: 'adapterUnsupported' }
  | { kind: 'adapterUnauthorized' }
  | { kind: 'scanning'; count: number }
  | { kind: 'scanIdle'; count: number } // stopped: pre-first-scan (count 0) or post-timeout
  | { kind: 'scanError'; reason: 'startFailed' | 'locationServicesDisabled' | 'unknown' }
  | { kind: 'connecting'; deviceId: string; name: string }
  | { kind: 'connected'; deviceId: string; name: string };

// Takes a plain snapshot shape (structurally what the store holds) so this
// stays testable with a hand-built object literal — no store import needed.
export function deriveScanBarState(
  snapshot: {
    adapter: AdapterPowerState;
    scan: ScanState;
    devices: DiscoveredDevice[];
    connection: ConnectionState;
  },
  unknownDeviceLabel: string,
): ScanBarState {
  const { adapter, scan, devices, connection } = snapshot;

  if (connection.kind === 'connected' || connection.kind === 'connecting') {
    const device = devices.find((candidate) => candidate.id === connection.deviceId);
    const name = device
      ? selectDeviceDisplayName(device, unknownDeviceLabel).text
      : unknownDeviceLabel;
    return connection.kind === 'connected'
      ? { kind: 'connected', deviceId: connection.deviceId, name }
      : { kind: 'connecting', deviceId: connection.deviceId, name };
  }

  if (adapter !== 'poweredOn') {
    switch (adapter) {
      case 'unknown':
        return { kind: 'checkingAdapter' };
      case 'poweredOff':
        return { kind: 'adapterOff' };
      case 'resetting':
        return { kind: 'adapterResetting' };
      case 'unsupported':
        return { kind: 'adapterUnsupported' };
      case 'unauthorized':
        return { kind: 'adapterUnauthorized' };
    }
  }

  if (scan.kind === 'scanError') {
    return { kind: 'scanError', reason: scan.reason };
  }

  if (scan.kind === 'scanning') {
    return { kind: 'scanning', count: devices.length };
  }

  return { kind: 'scanIdle', count: devices.length };
}

export function canScan(
  snapshot: { adapter: AdapterPowerState; connection: ConnectionState },
  context: {
    permissionGranted: boolean;
    isFocused: boolean;
    isAppActive: boolean;
    autoReconnectPending: boolean;
  },
): boolean {
  return (
    context.permissionGranted &&
    context.isFocused &&
    context.isAppActive &&
    !context.autoReconnectPending &&
    snapshot.adapter === 'poweredOn' &&
    snapshot.connection.kind !== 'connecting' &&
    snapshot.connection.kind !== 'connected' &&
    snapshot.connection.kind !== 'connectionLost'
  );
}
