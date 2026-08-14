import { create } from 'zustand';

import type {
  AdapterPowerState,
  ConnectionFailureReason,
  ConnectionLossReason,
  ConnectionState,
  DiscoveredDevice,
  ScanState,
} from '@/ble/pairing-types';

/**
 * The Zustand store: adapter power state, scan state, the committed device
 * list, and connection state, plus the actions that transition them.
 *
 * BLE side effects stay out of this file, full stop — it never imports
 * `bleManager`, `react-native`, or anything from `react-native-ble-plx`
 * except as a type. Every action below is a synchronous `set()`/`get()`
 * call — no `Promise`, no timer, no native module.
 */
export type PairingStore = {
  adapter: AdapterPowerState;
  scan: ScanState;
  devices: DiscoveredDevice[];
  connection: ConnectionState;

  adapterStateChanged: (adapter: AdapterPowerState) => void;
  scanStarted: (startedAt: number) => void;
  scanStopped: () => void;
  scanTimedOut: () => void;
  scanErrored: (reason: 'startFailed' | 'locationServicesDisabled' | 'unknown') => void;
  setDevices: (devices: DiscoveredDevice[]) => void; // the aggregator's settled snapshot, committed wholesale
  connectRequested: (deviceId: string, startedAt: number) => void;
  connectSucceeded: (deviceId: string) => void;
  connectFailed: (deviceId: string, reason: ConnectionFailureReason) => void;
  connectCancelled: (deviceId: string) => void;
  connectionLost: (deviceId: string, reason: ConnectionLossReason) => void;
  reconnectAttemptStarted: (deviceId: string, attempt: number) => void;
  reconnectSucceeded: (deviceId: string) => void;
  reconnectFailed: (deviceId: string) => void;
  reset: () => void;
};

export const usePairingStore = create<PairingStore>()((set, get) => ({
  adapter: 'unknown',
  scan: { kind: 'idle' },
  devices: [],
  connection: { kind: 'disconnected' },

  adapterStateChanged: (adapter) =>
    set((state) => {
      if (adapter === 'poweredOn') {
        return { adapter };
      }
      if (state.connection.kind === 'connecting') {
        // "adapter turned off mid-connect"
        return {
          adapter,
          connection: {
            kind: 'connectionFailed',
            deviceId: state.connection.deviceId,
            reason: 'adapterOff',
          },
        };
      }
      if (state.connection.kind === 'connected') {
        // "adapter turned off while connected"
        return {
          adapter,
          connection: {
            kind: 'connectionLost',
            deviceId: state.connection.deviceId,
            reason: 'adapterOff',
          },
        };
      }
      if (state.connection.kind === 'reconnecting') {
        // Bluetooth itself went off mid-retry — stop pretending a retry is
        // still meaningful; land on the same resting state a plain "adapter
        // off while connected" drop would produce, so the user's next move
        // (turn Bluetooth back on, reconnect manually) is identical either
        // way.
        return {
          adapter,
          connection: {
            kind: 'connectionLost',
            deviceId: state.connection.deviceId,
            reason: 'adapterOff',
          },
        };
      }
      if (state.scan.kind === 'scanning') {
        // "adapter turned off mid-scan"
        return { adapter, scan: { kind: 'idle' } };
      }
      return { adapter };
    }),

  scanStarted: (startedAt) => set({ scan: { kind: 'scanning', startedAt } }),
  scanStopped: () => set({ scan: { kind: 'idle' } }),
  scanTimedOut: () => set({ scan: { kind: 'idle' } }),
  scanErrored: (reason) => set({ scan: { kind: 'scanError', reason } }),
  setDevices: (devices) => set({ devices }),

  connectRequested: (deviceId, startedAt) =>
    set({ connection: { kind: 'connecting', deviceId, startedAt } }),
  connectSucceeded: (deviceId) => {
    const connection = get().connection;
    // Stale — a delayed native callback arriving after this ticket's own
    // CONNECT_TIMEOUT_MS (or a later attempt) already resolved another way.
    // `kind === 'connecting'` (not just a matching `deviceId`, which
    // `connected`/`connectionFailed` also carry) is what "this attempt is
    // still actually in flight" means.
    if (connection.kind !== 'connecting' || connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'connected', deviceId } });
  },
  connectFailed: (deviceId, reason) => {
    const connection = get().connection;
    if (connection.kind !== 'connecting' || connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'connectionFailed', deviceId, reason } });
  },
  connectCancelled: (deviceId) => {
    const connection = get().connection;
    if (connection.kind !== 'connecting' || connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'disconnected' } });
  },
  connectionLost: (deviceId, reason) => {
    const connection = get().connection;
    // Same staleness-guard shape as connectSucceeded/Failed/Cancelled, gated
    // on 'connected' instead of 'connecting': a no-op if this device isn't
    // the one currently connected, or if connection has already moved on
    // (e.g. the adapter-off cascade already won the race).
    if (connection.kind !== 'connected' || connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'connectionLost', deviceId, reason } });
  },
  reconnectAttemptStarted: (deviceId, attempt) => {
    const connection = get().connection;
    const eligible =
      (connection.kind === 'connectionLost' &&
        connection.deviceId === deviceId &&
        connection.reason === 'deviceDisconnected') ||
      (connection.kind === 'reconnecting' && connection.deviceId === deviceId);
    if (!eligible) return;
    set({ connection: { kind: 'reconnecting', deviceId, attempt } });
  },
  reconnectSucceeded: (deviceId) => {
    const connection = get().connection;
    if (connection.kind !== 'reconnecting' || connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'connected', deviceId } });
  },
  reconnectFailed: (deviceId) => {
    const connection = get().connection;
    if (connection.kind !== 'reconnecting' || connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'reconnectFailed', deviceId } });
  },

  reset: () =>
    set({
      adapter: 'unknown',
      scan: { kind: 'idle' },
      devices: [],
      connection: { kind: 'disconnected' },
    }),
}));
