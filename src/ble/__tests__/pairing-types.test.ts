import { State } from 'react-native-ble-plx';

import type { ConnectionState, DiscoveredDevice, ScanState } from '@/ble/pairing-types';
import {
  canScan,
  deriveScanBarState,
  RSSI_SORT_BUCKET_DBM,
  selectDeviceDisplayName,
  selectSortedDevices,
  toAdapterPowerState,
} from '@/ble/pairing-types';

const DISCONNECTED: ConnectionState = { kind: 'disconnected' };
const IDLE: ScanState = { kind: 'idle' };

function makeDevice(overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    id: 'device-1',
    name: 'My Device',
    lastKnownName: 'My Device',
    isConnectable: true,
    medianRssi: -60,
    firstSeenAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

describe('toAdapterPowerState', () => {
  it.each([
    [State.Unknown, 'unknown'],
    [State.PoweredOn, 'poweredOn'],
    [State.PoweredOff, 'poweredOff'],
    [State.Resetting, 'resetting'],
    [State.Unsupported, 'unsupported'],
    [State.Unauthorized, 'unauthorized'],
  ] as const)('maps %s to %s', (state, expected) => {
    expect(toAdapterPowerState(state)).toBe(expected);
  });
});

describe('selectSortedDevices', () => {
  it('sorts nearest (highest medianRssi) first', () => {
    const far = makeDevice({ id: 'far', medianRssi: -90, firstSeenAt: 1 });
    const near = makeDevice({ id: 'near', medianRssi: -40, firstSeenAt: 2 });

    expect(selectSortedDevices([far, near]).map((d) => d.id)).toEqual(['near', 'far']);
  });

  it('does not reorder two devices whose medianRssi falls in the same bucket across small changes', () => {
    // Both values floor to the same bucket (RSSI_SORT_BUCKET_DBM = 6): -61 and
    // -63 both floor(-61/6) = -11, floor(-63/6) = -11.
    const a = makeDevice({ id: 'a', medianRssi: -61, firstSeenAt: 1 });
    const b = makeDevice({ id: 'b', medianRssi: -63, firstSeenAt: 2 });
    expect(Math.floor(a.medianRssi / RSSI_SORT_BUCKET_DBM)).toBe(
      Math.floor(b.medianRssi / RSSI_SORT_BUCKET_DBM),
    );

    const firstOrder = selectSortedDevices([a, b]).map((d) => d.id);

    // Simulate small jitter within the same bucket on a later tick.
    const aJittered = { ...a, medianRssi: -62 };
    const bJittered = { ...b, medianRssi: -62 };
    const secondOrder = selectSortedDevices([aJittered, bJittered]).map((d) => d.id);

    expect(secondOrder).toEqual(firstOrder);
  });

  it('does not mutate the input array', () => {
    const devices = [
      makeDevice({ id: 'a', medianRssi: -90 }),
      makeDevice({ id: 'b', medianRssi: -40 }),
    ];
    const original = [...devices];

    selectSortedDevices(devices);

    expect(devices).toEqual(original);
  });
});

describe('selectDeviceDisplayName', () => {
  it('uses the current name when present', () => {
    const device = makeDevice({ name: 'Live Name', lastKnownName: 'Live Name' });
    expect(selectDeviceDisplayName(device, 'Unknown device')).toEqual({
      text: 'Live Name',
      isFallback: false,
    });
  });

  it('falls back to lastKnownName when name is null', () => {
    const device = makeDevice({ name: null, lastKnownName: 'Sticky Name' });
    expect(selectDeviceDisplayName(device, 'Unknown device')).toEqual({
      text: 'Sticky Name',
      isFallback: false,
    });
  });

  it('falls back to the caller-supplied fallback when neither name has ever been set', () => {
    const device = makeDevice({ name: null, lastKnownName: null });
    expect(selectDeviceDisplayName(device, 'Unknown device')).toEqual({
      text: 'Unknown device',
      isFallback: true,
    });
  });
});

describe('canScan', () => {
  const context = { permissionGranted: true, isFocused: true, isAppActive: true };

  it('is true when permission, focus, app-active, and adapter are all satisfied and not connecting/connected', () => {
    expect(canScan({ adapter: 'poweredOn', connection: DISCONNECTED }, context)).toBe(true);
  });

  it.each([
    ['permission not granted', { ...context, permissionGranted: false }],
    ['not focused', { ...context, isFocused: false }],
    ['app not active', { ...context, isAppActive: false }],
  ] as const)('is false when %s', (_label, ctx) => {
    expect(canScan({ adapter: 'poweredOn', connection: DISCONNECTED }, ctx)).toBe(false);
  });

  it('is false when the adapter is not poweredOn', () => {
    expect(canScan({ adapter: 'poweredOff', connection: DISCONNECTED }, context)).toBe(false);
  });

  it('is false while connecting', () => {
    const connecting: ConnectionState = { kind: 'connecting', deviceId: 'd1', startedAt: 0 };
    expect(canScan({ adapter: 'poweredOn', connection: connecting }, context)).toBe(false);
  });

  it('is false once connected', () => {
    const connected: ConnectionState = { kind: 'connected', deviceId: 'd1' };
    expect(canScan({ adapter: 'poweredOn', connection: connected }, context)).toBe(false);
  });

  it('is false when the connection was lost', () => {
    const connectionLost: ConnectionState = {
      kind: 'connectionLost',
      deviceId: 'd1',
      reason: 'deviceDisconnected',
    };
    expect(canScan({ adapter: 'poweredOn', connection: connectionLost }, context)).toBe(false);
  });
});

describe('deriveScanBarState', () => {
  const FALLBACK = 'Unknown device';

  it('prioritizes connected over everything else', () => {
    const device = makeDevice({ id: 'd1', name: 'HRM' });
    const snapshot = {
      adapter: 'poweredOff' as const,
      scan: IDLE,
      devices: [device],
      connection: { kind: 'connected', deviceId: 'd1' } as ConnectionState,
    };
    expect(deriveScanBarState(snapshot, FALLBACK)).toEqual({
      kind: 'connected',
      deviceId: 'd1',
      name: 'HRM',
    });
  });

  it('prioritizes connecting over adapter/scan state', () => {
    const device = makeDevice({ id: 'd1', name: 'HRM' });
    const snapshot = {
      adapter: 'poweredOff' as const,
      scan: IDLE,
      devices: [device],
      connection: { kind: 'connecting', deviceId: 'd1', startedAt: 0 } as ConnectionState,
    };
    expect(deriveScanBarState(snapshot, FALLBACK)).toEqual({
      kind: 'connecting',
      deviceId: 'd1',
      name: 'HRM',
    });
  });

  it('falls back to the unknown-device label when the connecting device is not in the list', () => {
    const snapshot = {
      adapter: 'poweredOn' as const,
      scan: IDLE,
      devices: [],
      connection: { kind: 'connecting', deviceId: 'ghost', startedAt: 0 } as ConnectionState,
    };
    expect(deriveScanBarState(snapshot, FALLBACK)).toEqual({
      kind: 'connecting',
      deviceId: 'ghost',
      name: FALLBACK,
    });
  });

  it.each([
    ['unknown', 'checkingAdapter'],
    ['poweredOff', 'adapterOff'],
    ['resetting', 'adapterResetting'],
    ['unsupported', 'adapterUnsupported'],
    ['unauthorized', 'adapterUnauthorized'],
  ] as const)('maps adapter %s to %s when not connecting/connected', (adapter, kind) => {
    const snapshot = { adapter, scan: IDLE, devices: [], connection: DISCONNECTED };
    expect(deriveScanBarState(snapshot, FALLBACK)).toEqual({ kind });
  });

  it('falls through to the adapter/scan-derived row for a connectionLost connection, exactly like disconnected/connectionFailed', () => {
    const connectionLost: ConnectionState = {
      kind: 'connectionLost',
      deviceId: 'd1',
      reason: 'deviceDisconnected',
    };
    const lostSnapshot = {
      adapter: 'poweredOn' as const,
      scan: IDLE,
      devices: [],
      connection: connectionLost,
    };
    const disconnectedSnapshot = {
      adapter: 'poweredOn' as const,
      scan: IDLE,
      devices: [],
      connection: DISCONNECTED,
    };
    expect(deriveScanBarState(lostSnapshot, FALLBACK)).toEqual(
      deriveScanBarState(disconnectedSnapshot, FALLBACK),
    );
  });

  it('reports scanError when adapter is poweredOn and scan errored', () => {
    const snapshot = {
      adapter: 'poweredOn' as const,
      scan: { kind: 'scanError', reason: 'locationServicesDisabled' } as ScanState,
      devices: [],
      connection: DISCONNECTED,
    };
    expect(deriveScanBarState(snapshot, FALLBACK)).toEqual({
      kind: 'scanError',
      reason: 'locationServicesDisabled',
    });
  });

  it('reports scanning with the current device count', () => {
    const snapshot = {
      adapter: 'poweredOn' as const,
      scan: { kind: 'scanning', startedAt: 0 } as ScanState,
      devices: [makeDevice(), makeDevice({ id: 'd2' })],
      connection: DISCONNECTED,
    };
    expect(deriveScanBarState(snapshot, FALLBACK)).toEqual({ kind: 'scanning', count: 2 });
  });

  it('reports scanIdle with the current device count otherwise', () => {
    const snapshot = {
      adapter: 'poweredOn' as const,
      scan: IDLE,
      devices: [makeDevice()],
      connection: DISCONNECTED,
    };
    expect(deriveScanBarState(snapshot, FALLBACK)).toEqual({ kind: 'scanIdle', count: 1 });
  });
});
