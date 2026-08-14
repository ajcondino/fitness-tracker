# Feature: Device Scanning, Discovery, and Connection State Machine

## Intent

The pairing screen (`src/app/(tabs)/device.tsx`) scans for real, connectable
BLE peripherals once Bluetooth permission is granted, lists them under
NEARBY DEVICES sorted by signal strength without row jitter, and drives them
through a connect flow — connecting / connected / failed, with retry — via a
Zustand store whose actions are pure state transitions, testable with no BLE
adapter present. The scan-status bar's `granted` slot (a deliberate
placeholder since [ble-pairing-permissions](../ble-pairing-permissions/SPEC.md))
becomes live: adapter power state, scan progress, and connection progress
all render through it. No HR data, persistence, or auto-reconnect is
introduced.

## Context

- **Problem statement:** `src/app/(tabs)/device.tsx` renders NEARBY DEVICES
  only as an always-empty section (`t('pairing.nearbyDevices.empty')`) once
  `useBlePermissionStatus()` reports `'granted'` — no scan is ever started.
  `src/ble/manager.ts` exports a `bleManager` singleton that no code calls
  any method on. `src/components/scan-status-bar.tsx`'s `granted` row is
  explicitly documented (SPEC.md of `ble-pairing-permissions`, footnote on
  its copy table) as a placeholder: `"● BLUETOOTH ACCESS GRANTED"`, forever,
  regardless of what scanning is actually doing. There is no store,
  discovery state, or connection state anywhere in the repo.
- **Current code:**
  - `src/ble/manager.ts` — the untouched singleton from `ble-runtime-setup`;
    `new BleManager()` at module scope, no consumer yet.
  - `src/ble/permissions.ts` / `src/hooks/use-ble-permission-status.ts` — own
    permission state exclusively; this spec adds a sibling, not a
    modification (see Dependencies).
  - `src/components/scan-status-bar.tsx` — a `Record<BlePermissionStatus,
…>`-keyed presentational component for exactly seven permission states.
    Its own prior spec anticipated this ticket verbatim: "The follow-up
    scanning ticket replaces this exact copy once it has something to
    count; that ticket does not need to touch `ScanStatusBar`'s other six
    rows" — this spec holds that promise: the six non-`granted` rows and
    their tests are untouched; only the `granted` slot gains new,
    additively-added optional props.
  - `src/components/device-card.tsx` — the closest existing precedent for a
    tappable, status-dot-bearing row (`Pressable`, `surfaceRaised`/
    `outlineStrong`, 42px tile, status dot, chevron). NEARBY DEVICES needs a
    repeatable list row, not a hero card — `DESIGN.md` has no dedicated
    "device row" token, so this spec defines one from existing primitives
    (colors, spacing, typography) rather than inventing a new `DESIGN.md`
    token, following the same approach `ble-pairing-permissions` used for
    the scan-status bar and its two list sections.
  - `node_modules/react-native-ble-plx@3.5.1`'s actual (Flow-typed) source
    was read directly in `src/BleManager.js`, `src/Device.js`,
    `src/TypeDefinition.js`, and `src/BleError.js` — there is no bundled
    `.d.ts`, and the library predates SDK 57, so the installed source is the
    ground truth per `AGENTS.md`. Confirmed from it: `startDeviceScan(UUIDs,
options, listener)` where `listener: (error: ?BleError, device: ?Device)
=> void` (fires per-advertisement, may fire with a non-null `error` and
    a `null` device); `Device.id`/`.name`/`.localName`/`.rssi`/
    `.isConnectable` are all present; `BleError.errorCode` (not `.code`) is
    the numeric field; `BleErrorCode.BluetoothPoweredOff === 102`,
    `ScanStartFailed === 600`, `LocationServicesDisabled === 601`,
    `DeviceConnectionFailed === 200`, `DeviceNotFound === 204` — the
    `102`/26ms-apart pairing in the spike findings is this exact code.
    `State` (`Unknown`/`Resetting`/`Unsupported`/`Unauthorized`/
    `PoweredOff`/`PoweredOn`) is `BleManager.onStateChange(listener,
emitCurrentState)` — passing `emitCurrentState: true` delivers the
    current state through the same listener on subscribe, so no separate
    `bleManager.state()` call is needed.
  - **SDK 57 fact, confirmed from installed source, not memory:**
    `expo-router@57.0.9` no longer depends on `@react-navigation/native` as
    an npm dependency (checked: absent from its `package.json` and from
    `node_modules` entirely) — it re-exports its own `useIsFocused` and
    `useFocusEffect` (`expo-router/build/exports.js`). This spec imports
    `useIsFocused` from `expo-router`, not `@react-navigation/native`.
- **User impact:** Opening the DEVICE tab with Bluetooth permission granted
  and Bluetooth on now shows a live, real scan: devices appear as they're
  found, sorted nearest-first without jumping around, and tapping one
  connects it — with visible connecting/connected/failed states. Turning
  Bluetooth off, losing the device mid-connect, or leaving the screen all
  behave correctly instead of leaking a scan or an unresolved connect
  attempt.
- **Dependencies:**
  - **New dependency: `zustand`.** Confirmed absent from `package.json` and
    `node_modules` — this ticket is its first consumer anywhere in the
    repo. Install latest (`v5.x`; requires React 18+, and this project is on
    React `19.2.3`, so no compatibility gap) via `pnpm add zustand` as this
    spec's first implementation step. No RN-specific plugin or config is
    needed — it's a plain JS state library.
  - `react-native-ble-plx` (`^3.5.1`, already installed) — `bleManager` from
    `src/ble/manager.ts` is this ticket's only new consumer.
  - `useIsFocused` from `expo-router` (already installed, unused elsewhere)
    — new import, no new package.
  - `AppState` from `react-native` core — same pattern
    `use-ble-permission-status.ts` already established.
  - Builds on `useBlePermissionStatus()`'s `status` value as an input
    (`status === 'granted'`) but does not modify permission handling, per
    this ticket's own constraint and the prior spec's ownership of that
    slot. Permission state stays in its own hook/`useState` — it is not
    folded into the new Zustand store, since nothing about it needs to be
    driven by BLE-manager callbacks the way scan/connection state does.

## Data Model

This spec splits the state-management surface into three pieces with one
rule governing all of them: **BLE side effects stay out of the store.**
`bleManager` is never imported by `src/ble/pairing-store.ts`. The manager's
callbacks (wired up in the hook) call store actions; store actions only ever
call `set()` — never the manager. Every action is callable and assertable
directly, with no BLE adapter, no mock manager, and no React tree mounted.

1. **`src/ble/pairing-types.ts`** — framework-free types, constants, and
   pure derivations. No BLE, no Zustand, no React import (the one exception
   is importing `State` from `react-native-ble-plx` purely as a type/enum
   for `toAdapterPowerState`'s input — a value that exists at compile time
   whether or not a real adapter is present).
2. **`src/ble/scan-aggregator.ts`** — a plain, stateful (but I/O-free) class
   that absorbs the raw scan-callback volume and hands the store only a
   settled, already-deduped, already-smoothed snapshot. This is the answer
   to "that volume should not hit the store": raw advertisement callbacks
   arrive at roughly 4/sec per device, doubled to ~8/sec by the
   advertisement + scan-response pair the spike observed arriving ~5ms
   apart — committing every one of those into a Zustand store would mean
   up to 8 store writes/sec/device, each triggering a re-render of every
   subscribed component. The aggregator instead absorbs all of that into an
   in-memory `Map`, and the hook flushes it into the store on a fixed
   interval (see Interfaces/API) — one store write per interval tick,
   covering every tracked device at once, regardless of device count or
   raw-callback volume.
3. **`src/ble/pairing-store.ts`** — the Zustand store itself: adapter power
   state, scan state, the committed device list, and connection state, plus
   the actions that transition them.

```ts
// src/ble/pairing-types.ts

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

export type ConnectionState =
  | { kind: 'disconnected' }
  | { kind: 'connecting'; deviceId: string; startedAt: number }
  | { kind: 'connected'; deviceId: string }
  | { kind: 'connectionFailed'; deviceId: string; reason: ConnectionFailureReason };

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
```

Constants (exported from `pairing-types.ts`, so the aggregator, the store,
the hook, and every test file share one source of truth instead of
duplicating magic numbers):

| Constant                    | Value    | Rationale                                                                                                                                                                                                                                                                                                            |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RSSI_WINDOW_SIZE`          | `5`      | The aggregator's rolling median window per device. Odd, so the median is always a real sample, never an average of two.                                                                                                                                                                                              |
| `RSSI_SORT_BUCKET_DBM`      | `6`      | Devices are sorted by `floor(medianRssi / 6)`, not raw RSSI. The spike measured ~5 dBm spread at close range — a 6 dBm bucket absorbs that jitter into one bucket so it can't reorder rows; the ~24 dBm distant-range spread still separates real distance tiers.                                                    |
| `DEVICE_COMMIT_INTERVAL_MS` | `500`    | How often the hook flushes the aggregator's settled snapshot into the store. At ~8 raw callbacks/sec/device, this collapses store writes to at most 2/sec **total** (one `setDevices` call covering every tracked device), independent of how many devices are in range. Fast enough that the list still feels live. |
| `SCAN_TIMEOUT_MS`           | `30_000` | Not specified by the ticket brief — a working default a scanning session runs before requiring a manual "SCAN AGAIN". Trivial to retune; flagged in Constraints as a decision made while writing this spec, not a confirmed requirement.                                                                             |
| `CONNECT_TIMEOUT_MS`        | `15_000` | Same status as `SCAN_TIMEOUT_MS` — a working default for how long a single connect attempt is allowed to hang before this spec's own timeout fires (independent of whatever timeout, if any, the native stack applies).                                                                                              |

**Invariants (enforced by the aggregator, not the store — see Interfaces/API):**

- The store's `devices` array is always a full replacement, never a
  per-item merge — deduplication already happened in the aggregator before
  the store ever sees a list. This is what "commit the settled device
  list" means concretely: `setDevices(devices)` is a `set({ devices })`,
  nothing cleverer.
- A device only appears in the aggregator's tracked set — and therefore
  ever reaches the store — if it arrived `isConnectable: true` at least
  once. Once tracked, later updates are applied regardless of that later
  sample's `isConnectable` value — the spike never observed a connectable
  device becoming non-connectable, so this case is deliberately not
  speculated further (see Constraints).
- `lastKnownName` is write-once-per-value: set whenever a sample carries a
  non-null `name`, never reset to `null` by a later null-`name` sample —
  the "maybe, not a no" spike finding.
- The store's `connection.kind === 'connecting'` for at most one `deviceId`
  at a time — a second `connectRequested` while already connecting is not
  a valid transition; the hook is responsible for never issuing one (see
  Interfaces/API).

## Interfaces / API

### `src/ble/pairing-types.ts` (new — types, constants, pure derivations)

```ts
export function toAdapterPowerState(state: BleState): AdapterPowerState; // BleState = State from react-native-ble-plx

export function selectSortedDevices(devices: DiscoveredDevice[]): DiscoveredDevice[];
export function selectDeviceDisplayName(
  device: DiscoveredDevice,
  fallback: string,
): {
  text: string;
  isFallback: boolean; // true if name is currently null (showing a stale or placeholder name)
};

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
  | { kind: 'connected'; deviceId: string; name: string; count: number };

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
): ScanBarState;

export function canScan(
  snapshot: { adapter: AdapterPowerState; connection: ConnectionState },
  context: { permissionGranted: boolean; isFocused: boolean; isAppActive: boolean },
): boolean;
```

`deriveScanBarState` precedence (first match wins): `connection.kind ===
'connected'` → `connected`; `connection.kind === 'connecting'` → `connecting`;
`adapter !== 'poweredOn'` → the matching adapter-\* kind; `scan.kind ===
'scanError'` → `scanError`; `scan.kind === 'scanning'` → `scanning` with
`count = devices.length`; otherwise → `scanIdle` with the same count. A
`connectionFailed` state is deliberately not given its own bar row: `canScan`
becomes true again the instant a connect attempt ends for any reason, so the
bar returns to `scanning`/`scanIdle` almost immediately, and the failure
itself is shown per-row (see `DeviceRow`) — a bar-level echo would just
flash and add a state without adding information.

`canScan`: `permissionGranted && isFocused && isAppActive && snapshot.adapter
=== 'poweredOn' && snapshot.connection.kind !== 'connecting' &&
snapshot.connection.kind !== 'connected'`. Once connected, scanning does not
resume this mount — see Constraints.

### `src/ble/scan-aggregator.ts` (new — stateful, I/O-free)

```ts
export type ScanAggregator = {
  ingest(sample: RawScanSample): void; // cheap, in-memory only — called on every raw scan callback
  getSettledDevices(): DiscoveredDevice[]; // pure read — rolling-median RSSI applied, connectable-gated, dedup'd by id
};

export function createScanAggregator(): ScanAggregator;
```

Internally holds a `Map<string, …>` keyed by device id — the dedupe
mechanism for the "every result arrives twice, ~5ms apart" spike finding: a
second `ingest()` for a known id updates that one entry in place, it never
creates a second. `ingest()`:

- No-ops (drops the sample) if `isConnectable` is `false` **and** the id
  isn't already tracked. This is the "filter on `connectable === true`"
  spike finding, applied once, here — not scattered across the hook or the
  store.
- Otherwise inserts or updates the tracked entry: appends `rssi` to that
  device's rolling window (capping at `RSSI_WINDOW_SIZE`, dropping the
  oldest), updates `lastSeenAt`, sets the current `name`, and updates
  `lastKnownName` only if the new `name` is non-null.

`getSettledDevices()` maps every tracked entry to a `DiscoveredDevice`,
computing `medianRssi` from that entry's current window (a true median, not
a mean — sorted-copy, middle element). It does not sort — sorting is
`selectSortedDevices`'s job, applied downstream by whatever reads the
store's committed list, keeping "smoothing/dedupe" and "display order" as
two separately testable concerns. There is deliberately no `reset()`/clear
method: an aggregator instance lives for the whole hook mount and devices
found earlier in the mount are never dropped from it — matching this spec's
"no stale-device pruning" constraint (see below) — so a fresh aggregator is
only ever created by mounting a new one (see the hook).

Because this module never imports `bleManager` or Zustand, its dedupe/
median/connectable-filter logic is unit-tested with hand-built
`RawScanSample` objects and zero mocking of any kind.

### `src/ble/pairing-store.ts` (new — Zustand, no BLE import)

```ts
import { create } from 'zustand';

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
    if (get().connection.deviceId !== deviceId) return; // stale — see below
    set({ connection: { kind: 'connected', deviceId } });
  },
  connectFailed: (deviceId, reason) => {
    if (get().connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'connectionFailed', deviceId, reason } });
  },
  connectCancelled: (deviceId) => {
    if (get().connection.deviceId !== deviceId) return;
    set({ connection: { kind: 'disconnected' } });
  },

  reset: () =>
    set({
      adapter: 'unknown',
      scan: { kind: 'idle' },
      devices: [],
      connection: { kind: 'disconnected' },
    }),
}));
```

(The three staleness guards above read `get().connection` — comparing
`deviceId`, and implicitly requiring `kind === 'connecting'` since only that
variant has a `deviceId` matching an in-flight attempt — before applying a
`connectSucceeded`/`connectFailed`/`connectCancelled`. This guards against
a delayed native callback arriving after this ticket's own
`CONNECT_TIMEOUT_MS` already resolved the attempt another way — the same
"double-transition on one signal" hazard the spike found for adapter-off,
generalized to every connect outcome.)

**Every one of these ten actions is called directly in
`src/ble/__tests__/pairing-store.test.ts` with no BLE adapter, no aggregator,
and no React tree** — e.g. `usePairingStore.getState().adapterStateChanged
('poweredOff')` then asserting `usePairingStore.getState().scan.kind ===
'idle'`. This is the concrete shape of "every transition must be testable
by calling actions directly with no BLE adapter present." `usePairingStore`
is a module-level singleton (idiomatic Zustand, mirroring `bleManager`'s own
singleton shape) — tests call `reset()` in `beforeEach` for isolation; see
Constraints for why the app itself also calls `reset()` on every hook mount
rather than relying on the singleton's persistence.

### `src/hooks/use-device-pairing.ts` (new — the only I/O layer)

```ts
export function useDevicePairing(permissionGranted: boolean): {
  adapter: AdapterPowerState;
  scanBarState: ScanBarState;
  devices: DiscoveredDevice[]; // selectSortedDevices(devices) — already sorted
  connection: ConnectionState;
  connect: (deviceId: string) => void;
  cancelConnect: () => void;
  retryScan: () => void;
  openBluetoothSettings: () => void;
};
```

Always called unconditionally (rules of hooks) — `permissionGranted` is the
gate, matching how `useBlePermissionStatus`'s consumer already works. Reads
`usePairingStore` via selectors; calls its actions; never lets `bleManager`
anywhere near the store. Concretely:

- **On mount**: calls `usePairingStore.getState().reset()` once, then
  creates one `ScanAggregator` via `useRef(() => createScanAggregator())`.
  Resetting on mount (rather than trusting the singleton's carried-over
  state) is what keeps a genuine remount clean while still letting the
  store persist across a tab blur/refocus, which never unmounts this hook
  in the first place (see Constraints) — the two aren't in tension.
- **Adapter subscription** (mount → unmount, independent of focus/
  background): `bleManager.onStateChange((state) =>
usePairingStore.getState().adapterStateChanged(toAdapterPowerState(state)),
true)`. `emitCurrentState: true` means the first call happens
  synchronously on mount, covering the mount-time `'unknown'` → real-state
  transition. Subscription removed on unmount.
- **Scan start/stop effect**, dependent on `[canScan(...), scanEpoch]` where
  `scanEpoch` is a local `useState<number>` counter bumped only by
  `retryScan()`:
  - On becoming eligible: calls `bleManager.startDeviceScan(null, null,
(error, device) => …)` (null service-UUID filter — the spike's "scan
    with null filters and discriminate after" finding), calls
    `usePairingStore.getState().scanStarted(Date.now())`, arms a
    `setTimeout(() => { bleManager.stopDeviceScan();
usePairingStore.getState().scanTimedOut() }, SCAN_TIMEOUT_MS)`, and
    starts a `setInterval(() => usePairingStore.getState().setDevices
(aggregatorRef.current.getSettledDevices()), DEVICE_COMMIT_INTERVAL_MS)`
    — this interval is the entire answer to "smooth first, then commit the
    settled device list": raw callbacks below never touch the store
    directly.
  - The scan listener (raw callback — **feeds the aggregator, not the
    store**): if `error` is non-null and `error.errorCode ===
BleErrorCode.BluetoothPoweredOff`, does nothing — swallowed per the
    spike finding (`onStateChange` already produces the authoritative
    transition ~26ms earlier). If `error` is non-null with any other code,
    calls `scanErrored` with `'startFailed'` for `ScanStartFailed`,
    `'locationServicesDisabled'` for `LocationServicesDisabled`, else
    `'unknown'` — these are rare, one-shot events, so they go straight to
    the store, same as every other non-scan-result action. If `error` is
    null and `device` is non-null and `device.rssi != null` (real readings
    only — a null reading is dropped, never fabricated, per "real device
    data only"), calls `aggregatorRef.current.ingest({ id: device.id, name:
device.name ?? device.localName ?? null, isConnectable:
device.isConnectable ?? false, rssi: device.rssi, seenAt: Date.now() })`
    — an in-memory update only, no store write.
  - Effect cleanup (fires on `canScan` flipping false, on `retryScan()`
    bumping `scanEpoch`, and on unmount — one mechanism covers all three):
    clears both the timeout and the commit interval, calls
    `bleManager.stopDeviceScan()`, and calls `scanStopped()` (skipped if the
    scan had already ended itself via `scanTimedOut`/`scanErrored`, tracked
    with a ref flag, so a stopped scan doesn't get double-reported). The
    aggregator itself is untouched by this cleanup — it keeps every device
    found so far, ready to resume committing the moment scanning restarts.
  - **This effect is exactly how scanning stops on unmount, on app
    background (`isAppActive` in `canScan`), on the DEVICE tab losing focus
    (`isFocused` in `canScan` — see below for why this is in scope), and
    when the adapter leaves `poweredOn` mid-scan** — one dependency-array
    driven effect, not four separate handlers.
- **Focus tracking**: `const isFocused = useIsFocused()` (imported from
  `expo-router`, confirmed available in Context above). This is **not** in
  the ticket's literal "cleanup on unmount and on app background" list, but
  is included as a deliberate, documented addition: `expo-router`'s
  `<Tabs>` (`src/app/(tabs)/_layout.tsx`) does not unmount inactive tab
  screens by default, so without this, switching from DEVICE to another tab
  would leave a scan (and its radio use) running indefinitely in the
  background — which is exactly the "no background BLE" posture
  `ble-runtime-setup`'s spec established (`isBackgroundEnabled: false`).
  Treating tab-blur as equivalent to backgrounding is the only way this
  hook actually delivers that posture given how `<Tabs>` mounts screens.
- **App-state tracking**: same `AppState.addEventListener('change', …)`
  pattern as `use-ble-permission-status.ts`, tracking `isAppActive =
AppState.currentState === 'active'` at mount and on every change.
- **`connect(deviceId)`**: no-ops if `connection.kind === 'connecting'`
  already (never issues a second concurrent attempt — this is the hook
  enforcing the invariant the store only assumes). Otherwise calls
  `connectRequested(deviceId, Date.now())`, calls
  `bleManager.connectToDevice(deviceId)`, and arms a
  `setTimeout(CONNECT_TIMEOUT_MS)` that — if the promise hasn't settled —
  calls `connectFailed(deviceId, 'timeout')`. On promise resolution, calls
  `connectSucceeded(deviceId)`. On rejection, calls `connectFailed(deviceId,
'deviceUnavailable')` for `DeviceConnectionFailed`/`DeviceNotFound`
  `errorCode`s, else `'unknown'`. Whichever settles first clears the other
  path (timer cleared on promise settlement; a promise settling after the
  timer already fired is a no-op at the store level per the staleness guard
  in `pairing-store.ts`).
- **`cancelConnect()`**: calls `connectCancelled(deviceId)` for the current
  `connection.deviceId` if `connection.kind === 'connecting'`, else no-ops.
- **A single effect keyed on `connection`** (read via the store's selector)
  handles the native-side cleanup common to every way of leaving
  `'connecting'`: tracks the previously-seen `connecting` `deviceId` in a
  ref, and whenever `connection.kind` is no longer `'connecting'` for that
  id, clears the pending connect timeout and calls
  `bleManager.cancelDeviceConnection(deviceId)` best-effort (rejection
  swallowed — cancelling an attempt that already resolved or was never
  fully established natively is an expected no-op, not a bug to surface).
  This one effect is what makes "adapter turned off mid-connect", "connect
  timeout", and "user cancels mid-connect" all correctly abort the native
  attempt, instead of three bespoke call sites.
- **`retryScan()`**: increments `scanEpoch`. Only meaningful when `canScan`
  is already true (post-timeout/post-error retry) — if permission/adapter/
  focus aren't currently satisfied, bumping the epoch is a harmless no-op
  since the scan-effect's own `canScan` check still gates it. Does **not**
  touch the aggregator — devices found earlier in the mount stay listed.
- **`openBluetoothSettings()`**: `Platform.OS === 'android' &&
Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')` — Android-only
  API from `react-native` core (no new dependency), guarded the same
  defensive way `src/ble/permissions.ts` guards every OS-specific branch,
  since this app is Android-only per `CLAUDE.md`.

### `src/components/scan-status-bar.tsx` (modified — additive)

```ts
export type ScanStatusBarProps = {
  status: BlePermissionStatus;
  onRequestAccess: () => void;
  onOpenSettings: () => void;
  scanBarState?: ScanBarState; // new, optional — only read when status === 'granted'
  onRetryScan?: () => void;
  onOpenBluetoothSettings?: () => void;
};
```

The existing `COLOR_BY_STATUS`/`COPY_KEY_BY_STATUS`/`DETAIL_KEY_BY_STATUS`/
`ACTION_BY_STATUS` records and their six non-`granted` entries are untouched
— confirming the prior spec's own prediction. A new branch, taken only when
`status === 'granted' && scanBarState` is present, renders the `granted`
slot's content from `scanBarState` instead of the old fixed placeholder
copy: color and dot-fill per the table below, `t()` copy (with `{{count}}`/
`{{name}}` interpolation where noted), and at most one action
(`onRetryScan` for `scanError`/`scanIdle`, `onOpenBluetoothSettings` for
`adapterOff`, none otherwise). If `status === 'granted'` and no
`scanBarState` is passed (shouldn't happen once `device.tsx` is updated, but
kept safe for any other future caller), falls back to the original fixed
`granted` copy — this is what keeps the six-row test suite passing
unmodified.

### `src/components/device-row.tsx` (new, presentational)

```ts
export type DeviceRowProps = {
  name: string;
  isNameFallback: boolean; // dims the title when true — see copy table
  rssi: number;
  status: 'available' | 'connecting' | 'connected' | 'failed';
  disabled: boolean; // true when a different device is mid-connect
  onPress: () => void; // caller decides the verb: connect / cancel / retry
};
```

Modeled on `device-card.tsx`'s `Pressable` + status-dot shape but using
`DESIGN.md`'s "resting card" tokens (`surface`/`outline`, not `surfaceRaised`/
`outlineStrong`, which `DESIGN.md`'s Colors section reserves for "raised or
emphasized" cards — a repeated list row is neither) and `rounded.md`.
Title uses `titleSm` (`onSurface`, or `onSurfaceMuted` when
`isNameFallback`); the RSSI reading uses `dataMd` — `DESIGN.md`'s own
typography table names `data-md` for exactly this ("durations, bpm, RSSI —
anything numeric inline"). Trailing content is a chevron (`›`,
`onSurfaceGhost`, matching `device-card.tsx`) for `'available'`, or an
`actionSm` label for the other three statuses per the copy table.
`disabled` renders at reduced opacity and makes `onPress` a no-op (BLE
central hardware reasonably supports one in-flight connect attempt at a
time — this app makes that a UI-level rule too, not just an implementation
accident).

### Screen states and copy

New `en.json` keys, namespaced `pairing.scanBar` and `pairing.deviceRow`
(the existing `pairing.scanStatus`/`pairing.nearbyDevices`/
`pairing.previouslyPaired`/`home` keys are unchanged):

| `ScanBarState.kind`   | Dot                 | Color          | Copy                                                                                                                                                                          | Action                                            |
| --------------------- | ------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `checkingAdapter`     | ○                   | faint          | `CHECKING BLUETOOTH…`                                                                                                                                                         | none                                              |
| `adapterOff`          | ●                   | danger         | `BLUETOOTH IS OFF` + detail `Turn on Bluetooth to scan for devices.`                                                                                                          | `TURN ON BLUETOOTH` → `onOpenBluetoothSettings`   |
| `adapterResetting`    | ○                   | faint          | `BLUETOOTH RESTARTING…`                                                                                                                                                       | none (never rendered as an error — spike finding) |
| `adapterUnsupported`  | ●                   | danger         | `BLUETOOTH NOT SUPPORTED` + detail `This device can't scan for Bluetooth peripherals.`                                                                                        | none (unrecoverable)                              |
| `adapterUnauthorized` | ●                   | danger         | `BLUETOOTH ACCESS RESTRICTED` + detail `The system has restricted Bluetooth for this app.`                                                                                    | none                                              |
| `scanning`            | `LiveDot` (pulsing) | primary        | Split: label `SCANNING…` (primary) + count `{{count}} found` (onSurfaceMuted, lowercase)                                                                                      | none                                              |
| `scanIdle` (count 0)  | ●                   | onSurfaceMuted | `BLUETOOTH READY`                                                                                                                                                             | `SCAN AGAIN` → `onRetryScan`                      |
| `scanIdle` (count>0)  | ●                   | onSurfaceMuted | `SCAN COMPLETE / {{count}} FOUND`                                                                                                                                             | `SCAN AGAIN` → `onRetryScan`                      |
| `scanError`           | ●                   | danger         | `startFailed`: `SCAN FAILED TO START`; `locationServicesDisabled`: `LOCATION SERVICES OFF` + detail `Turn on Location Services to scan for devices.`; `unknown`: `SCAN ERROR` | `SCAN AGAIN` → `onRetryScan`                      |
| `connecting`          | ○                   | primary        | `CONNECTING TO {{name}}…`                                                                                                                                                     | none                                              |
| `connected`           | `LiveDot` (pulsing) | success        | Split: label `CONNECTED` (success, name omitted) + count `{{count}} found` (onSurfaceMuted, lowercase)                                                                        | none                                              |

Dot-fill rule (extends the existing `FILLED_DOT_STATUSES` convention):
hollow (`○`) means nothing has settled yet (`checkingAdapter`,
`adapterResetting`, `connecting`); filled (`●`) means a confirmed, currently
true state — including `scanning` itself, since "a scan is definitely
running" is as settled as `granted` was. `primary` for `connecting` is a
direct application of `DESIGN.md`'s stated rule "Yellow means 'now' or
'go'" — connecting is exactly the "now" action in progress on this screen.

`scanning` and `connected` are the two kinds rendered via a dedicated
"live row" instead of the shared text-line layout every other kind above
uses: a `LiveDot` (`src/components/ui/live-dot.tsx`, DESIGN.md >
Components > Live dot) plus a label on the left, and the `{{count}} found`
count in `onSurfaceMuted` on the right, in a single space-between row.

- `scanning` — `LiveDot` and label colored `primary`, label `SCANNING…`,
  plus the animated gradient sweep (DESIGN.md > Motion > Scan-bar sweep)
  behind the text. The recolor from `success` to `primary` extends the
  same "now" rule already applied to `connecting` above — a scan actively
  in progress is as much a "now" action as a connection attempt.
- `connected` — `LiveDot` and label colored `success` (this is in fact the
  literal case `DESIGN.md`'s Colors section already describes `success`
  for: "a live connection"), label `CONNECTED` with the device name
  dropped (the bar no longer needs to name the device once it's the one
  thing on screen), no sweep — a settled connection isn't "in progress".
  The found-count from the scan that led to this connection stays visible
  on the right so it isn't lost the moment a device connects.

`count` on `ScanBarState`'s `connected` variant is `devices.length` at the
moment of connection, exactly like `scanning`/`scanIdle`'s `count`.

Every other kind's copy, color, and layout are unchanged.

`DeviceRow` copy (`pairing.deviceRow`):

| `status`     | Trailing copy   | Color          |
| ------------ | --------------- | -------------- |
| `available`  | `›` (not `t()`) | onSurfaceGhost |
| `connecting` | `CONNECTING…`   | onSurfaceFaint |
| `connected`  | `CONNECTED`     | success        |
| `failed`     | `RETRY`         | primary        |

Plus `pairing.deviceRow.unknownDevice`: `"Unknown device"` — the fallback
`name` text (via `selectDeviceDisplayName`'s caller-supplied fallback
parameter) for a device that has never advertised a name at all, and
`pairing.deviceRow.rssi`: `"{{rssi}} dBm"`.

`en.json` additions:

```json
{
  "pairing": {
    "scanBar": {
      "checkingAdapter": "CHECKING BLUETOOTH…",
      "adapterOff": "BLUETOOTH IS OFF",
      "adapterOffDetail": "Turn on Bluetooth to scan for devices.",
      "adapterOffAction": "TURN ON BLUETOOTH",
      "adapterResetting": "BLUETOOTH RESTARTING…",
      "adapterUnsupported": "BLUETOOTH NOT SUPPORTED",
      "adapterUnsupportedDetail": "This device can't scan for Bluetooth peripherals.",
      "adapterUnauthorized": "BLUETOOTH ACCESS RESTRICTED",
      "adapterUnauthorizedDetail": "The system has restricted Bluetooth for this app.",
      "scanningLabel": "SCANNING…",
      "foundCount": "{{count}} found",
      "scanReady": "BLUETOOTH READY",
      "scanComplete": "SCAN COMPLETE / {{count}} FOUND",
      "scanAgainAction": "SCAN AGAIN",
      "scanErrorStartFailed": "SCAN FAILED TO START",
      "scanErrorLocationServicesDisabled": "LOCATION SERVICES OFF",
      "scanErrorLocationServicesDisabledDetail": "Turn on Location Services to scan for devices.",
      "scanErrorUnknown": "SCAN ERROR",
      "connectingTo": "CONNECTING TO {{name}}…",
      "connectedLabel": "CONNECTED"
    },
    "deviceRow": {
      "unknownDevice": "Unknown device",
      "rssi": "{{rssi}} dBm",
      "connecting": "CONNECTING…",
      "connected": "CONNECTED",
      "retry": "RETRY"
    }
  }
}
```

## Files Created

| File                                             | Purpose                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ble/pairing-types.ts`                       | Types, constants, and pure derivations (`toAdapterPowerState`, `selectSortedDevices`, `selectDeviceDisplayName`, `canScan`, `deriveScanBarState`). Zero BLE-adapter, Zustand, or React dependency. Later revised: `ScanBarState`'s `connected` variant gains a `count` field (`devices.length` at connect time), so the live row can still show the found-count once connected. |
| `src/ble/__tests__/pairing-types.test.ts`        | Unit tests for the pure derivations: `canScan`/`deriveScanBarState` precedence, sort-bucket stability, display-name fallback.                                                                                                                                                                                                                                                   |
| `src/ble/scan-aggregator.ts`                     | Stateful, I/O-free dedupe + rolling-median + connectable-filter layer that sits between raw scan callbacks and the store.                                                                                                                                                                                                                                                       |
| `src/ble/__tests__/scan-aggregator.test.ts`      | Unit tests fed hand-built `RawScanSample` objects: dedupe-by-id, true rolling median (not mean), connectable gating, `lastKnownName` stickiness — no BLE adapter, no store.                                                                                                                                                                                                     |
| `src/ble/pairing-store.ts`                       | The Zustand store: `usePairingStore`, holding `adapter`/`scan`/`devices`/`connection` plus the ten actions in Interfaces/API. Never imports `bleManager`.                                                                                                                                                                                                                       |
| `src/ble/__tests__/pairing-store.test.ts`        | Every action called directly against `usePairingStore.getState()` — no BLE adapter, no aggregator, no React tree — covering every transition and failure edge in Interfaces/API (including the three staleness guards).                                                                                                                                                         |
| `src/hooks/use-device-pairing.ts`                | The I/O layer: wires `bleManager`, `AppState`, and `useIsFocused` to the aggregator and the store; owns every timer/interval.                                                                                                                                                                                                                                                   |
| `src/hooks/__tests__/use-device-pairing.test.ts` | Fake-timer-driven tests: scan start/stop/timeout, the commit-interval batching behavior, cleanup on unmount/background/blur/adapter-off, connect success/timeout/device-unavailable/adapter-off-mid-connect/user-cancel, retry after error/timeout, the 102-swallowing behavior, and the mount-time `reset()` call.                                                             |
| `src/components/device-row.tsx`                  | Presentational NEARBY DEVICES row.                                                                                                                                                                                                                                                                                                                                              |
| `src/components/__tests__/device-row.test.tsx`   | Asserts name/RSSI/trailing-copy/color per `status`, the `isNameFallback` dim, and `disabled` suppressing `onPress`.                                                                                                                                                                                                                                                             |
| `src/components/ui/live-dot.tsx`                 | Shared pulsing-dot primitive (DESIGN.md > Components > Live dot): 7px circle, opacity 1→0.35→1 over 1400ms, native driver, `color`/`size` props.                                                                                                                                                                                                                                |
| `src/components/ui/__tests__/live-dot.test.tsx`  | Asserts default/overridden color and size, and the opacity loop over fake timers.                                                                                                                                                                                                                                                                                               |

## Files Modified

| File                                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `pnpm-lock.yaml`                   | Add `zustand`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/components/scan-status-bar.tsx`                | Add the three new optional props and the `granted`-only `scanBarState` render branch, per Interfaces/API. The six existing status entries and their logic are untouched. Later revised to give `scanning` and `connected` their own "live row" (`LiveDot` + label/count split, `scanning` also with the gradient sweep) instead of the shared text-line layout; every other kind is untouched.                                                                                   |
| `src/components/__tests__/scan-status-bar.test.tsx` | Add cases for every `ScanBarState.kind` from the copy table (copy/color/action). Existing seven-row cases (the `ROWS` array) are untouched. Later revised: `scanning`/`connected` moved out of the shared `SCAN_BAR_ROWS` table into their own dedicated assertions for the new row layout.                                                                                                                                                                                      |
| `DESIGN.md`                                         | Add the "Scan-bar sweep" loop to Motion, and name it as the scoped exception in Do's/Don'ts' animation rule.                                                                                                                                                                                                                                                                                                                                                                     |
| `src/app/(tabs)/device.tsx`                         | Call `useDevicePairing(status === 'granted')`; replace the hardcoded NEARBY DEVICES empty copy with `devices.map(...)` → `DeviceRow`, falling back to the empty copy only when the array is empty; pass `scanBarState`/`onRetryScan`/`onOpenBluetoothSettings` to `ScanStatusBar`.                                                                                                                                                                                               |
| `src/app/(tabs)/__tests__/device.test.tsx`          | Mock `useDevicePairing` the same way the file already mocks `useBlePermissionStatus`; add cases for populated/empty NEARBY DEVICES, row tap → `connect`, and each `ScanBarState`. Later revised: `scanning`/`connected` moved out of the shared it.each table into their own dedicated live-row assertions.                                                                                                                                                                      |
| `src/i18n/locales/en.json`                          | Add the `pairing.scanBar` and `pairing.deviceRow` keys shown above.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `__mocks__/react-native-ble-plx.ts`                 | Add a `BleErrorCode` export with exactly the codes this spec's code reads (`BluetoothPoweredOff: 102`, `ScanStartFailed: 600`, `LocationServicesDisabled: 601`, `DeviceConnectionFailed: 200`, `DeviceNotFound: 204`) — the real module exports far more, but the manual mock only needs what's referenced. `BleManager`/`State` are already sufficient (`startDeviceScan`, `stopDeviceScan`, `connectToDevice`, `cancelDeviceConnection`, `onStateChange` are already stubbed). |

## Implementation Steps

1. `pnpm add zustand`. Confirm the installed major version is `5.x` and
   note it in the PR description — this is the repo's first Zustand
   consumer, so there's no existing usage pattern to match beyond this
   spec's own.
2. Confirm the `react-native-ble-plx@3.5.1` API surface used below against
   the installed source (`node_modules/react-native-ble-plx/src/*.js`) —
   already done for this spec; re-verify at implementation time per
   `AGENTS.md` in case the lockfile has moved.
3. Add `BleErrorCode` to `__mocks__/react-native-ble-plx.ts`.
4. Create `src/ble/pairing-types.ts` and its test — this file has no
   dependency on anything created in later steps, so it can be fully
   completed and tested first.
5. Create `src/ble/scan-aggregator.ts` and its test, covering dedupe,
   rolling median, and connectable gating in isolation.
6. Create `src/ble/pairing-store.ts` and `src/ble/__tests__/pairing-store.test.ts`
   per the Interfaces/API section — every action exercised directly via
   `usePairingStore.getState()`, including the three connect-outcome
   staleness guards and the adapter-off-mid-scan/mid-connect transitions.
7. Create `src/hooks/use-device-pairing.ts` and its test, using
   `jest.useFakeTimers()` (covering both the scan/connect timeouts and the
   `DEVICE_COMMIT_INTERVAL_MS` batching), spying on `bleManager`'s methods
   directly (same pattern `src/ble/__tests__/manager.test.ts` and the
   permission hook's `AppState` mock already establish), and
   `jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }))` for
   focus control. Assert `usePairingStore.getState()` directly rather than
   re-deriving expectations, and call `usePairingStore.getState().reset()`
   in `beforeEach` for test isolation (the store is a singleton — see
   Constraints).
8. Add the `pairing.scanBar` / `pairing.deviceRow` keys to
   `src/i18n/locales/en.json`.
9. Modify `src/components/scan-status-bar.tsx` per Interfaces/API, additive
   only. Extend `src/components/__tests__/scan-status-bar.test.tsx` with the
   new `ScanBarState` cases without touching the existing `ROWS` table.
10. Create `src/components/device-row.tsx` and its test.
11. Modify `src/app/(tabs)/device.tsx` to wire `useDevicePairing`, per Files
    Modified; update `src/app/(tabs)/__tests__/device.test.tsx` accordingly.
12. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **BLE side effects stay out of the store, full stop.**
  `src/ble/pairing-store.ts` never imports `bleManager`, `react-native`, or
  anything from `react-native-ble-plx` except as a type. Every one of its
  ten actions is a synchronous `set()`/`get()` call — no `Promise`, no
  timer, no native module. `src/hooks/use-device-pairing.ts` is the only
  file in this spec that ever calls a `bleManager` method, and it never
  reaches into the store's internals beyond calling its exported actions —
  the same "manager callbacks call store actions; store actions never call
  the manager" shape the ticket asked for.
- **Raw scan volume never reaches the store directly.** `scan-aggregator.ts`
  sits between the manager's per-advertisement callback and the store's
  `setDevices` action specifically because that one channel is
  high-frequency (~8/sec/device); every other action
  (`adapterStateChanged`, `scanStarted`/`Stopped`/`TimedOut`/`Errored`,
  `connectRequested`/`Succeeded`/`Failed`/`Cancelled`) is a rare, one-shot
  event and is called directly from the hook with no intermediate batching
  — the aggregation layer exists to solve the volume problem the ticket
  named, not as a general indirection pattern applied everywhere out of
  caution.
- `usePairingStore` is a module-level singleton, the idiomatic Zustand
  shape, mirroring `bleManager`'s own singleton pattern in
  `src/ble/manager.ts`. This is a deliberate departure from the previous
  draft's per-hook-instance `useReducer` state — see Constraints for what
  that changes (state now survives a tab blur, since `<Tabs>` doesn't
  unmount on blur anyway) and how the hook's mount-time `reset()` call
  keeps a genuine remount clean regardless.
- `src/ble/pairing-types.ts` and `src/ble/scan-aggregator.ts` are both
  framework-free by design — the ticket's "testable... with no BLE adapter
  present" requirement is satisfied at three independent layers (types/
  derivations, aggregator, store), not just the store alone.
- `src/hooks/use-device-pairing.ts` follows `use-ble-permission-status.ts`'s
  established shape: one hook, no context/provider, owns its own `AppState`
  subscription the same way. It adds `useIsFocused` on top, which the
  permission hook doesn't need (permission state isn't meaningfully tied to
  which tab is visible; an active scan is).
- Stopping scanning for the duration of a connect attempt (via `canScan`'s
  `connection.kind !== 'connecting'` term) is a deliberate choice, not an
  oversight: concurrent scan + connect is a known source of Android BLE
  radio contention, and the native `connectToDevice` promise's own
  rejection codes (`DeviceConnectionFailed`/`DeviceNotFound`) already
  surface "device disappeared mid-connect" without needing a concurrent
  scan to observe it disappearing.
- `DeviceRow` and `ScanStatusBar`'s new branch use only existing
  `DESIGN.md` tokens (colors, spacing, typography) — no new token is added
  to `DESIGN.md`, matching `ble-pairing-permissions`' own precedent of
  defining structure/copy in the SPEC when `DESIGN.md` doesn't yet cover a
  surface, rather than inventing a `DESIGN.md` entry unasked.
- `primary` for the `connecting` bar/row state is a direct citation of
  `DESIGN.md`'s Overview rule 1 ("Yellow means 'now' or 'go.'"), not a new
  color decision.
- All new copy renders via `t('pairing.scanBar.…')` / `t('pairing.deviceRow.…')`
  per `CLAUDE.md`'s i18n section.
- New tests colocated under each module's own `__tests__/`, matching every
  existing precedent in this repo.

## Acceptance Criteria

- [ ] `zustand` appears in `package.json`/`pnpm-lock.yaml`.
- [ ] `src/ble/pairing-store.ts` has no import of `bleManager`, `Platform`,
      `AppState`, or any `react-native-ble-plx` value (type-only imports of
      `AdapterPowerState` etc. are fine) — verified by inspection, not just
      by tests passing.
- [ ] Every `usePairingStore` action produces the correct resulting state
      when called directly via `usePairingStore.getState()`, with no BLE
      adapter, no aggregator, and no component mounted — covering every
      transition/edge listed in Interfaces/API (adapter-off mid-scan,
      adapter-off mid-connect, all three connect-outcome staleness guards).
- [ ] `src/ble/scan-aggregator.ts` has no import of `bleManager` or
      `usePairingStore`.
- [ ] A `RawScanSample` for a non-connectable, previously-untracked device
      id is a no-op in the aggregator; the same id later arriving
      `isConnectable: true` is tracked.
- [ ] Two `ingest()` calls for the same `id` (simulating the ~5ms-apart
      duplicate) never produce two entries in `getSettledDevices()`.
- [ ] `getSettledDevices()`'s `medianRssi` is a true rolling median (not a
      mean) over at most `RSSI_WINDOW_SIZE` samples.
- [ ] `selectSortedDevices` does not reorder two devices whose `medianRssi`
      values fall in the same `RSSI_SORT_BUCKET_DBM` bucket across
      successive small RSSI changes.
- [ ] A device that had a non-null `name` and then receives an `ingest()`
      with `name: null` keeps its `lastKnownName` in `getSettledDevices()`
      and is still present — never dropped for losing its name.
- [ ] `usePairingStore.getState().adapterStateChanged('poweredOff')` while
      `connection.kind === 'connecting'` transitions `connection` to
      `connectionFailed` with reason `'adapterOff'` in the same call.
- [ ] `adapterStateChanged` to a non-`'poweredOn'` value while `scan.kind
  === 'scanning'` transitions `scan` to `{ kind: 'idle' }`.
- [ ] The hook's scan effect calls `bleManager.startDeviceScan` only when
      `permissionGranted`, `useIsFocused()`, and `AppState.currentState ===
  'active'` are all true, and `usePairingStore.getState().adapter ===
  'poweredOn'`.
- [ ] While scanning, raw scan-listener callbacks update the aggregator
      only — `usePairingStore.getState().setDevices` (and therefore any
      store subscriber re-render) fires at most once per
      `DEVICE_COMMIT_INTERVAL_MS`, not once per raw callback, verified with
      fake timers and a burst of `ingest`-triggering callbacks between
      ticks.
- [ ] The hook's scan effect calls `bleManager.stopDeviceScan()` on
      unmount, on a focus-to-blur transition, and on an app-active-to-
      background transition — verified as three separate test cases driving
      the same effect, per the ticket's explicit ask to cover cleanup on
      unmount and app background (plus the documented focus addition).
- [ ] A scan callback error with `errorCode ===
  BleErrorCode.BluetoothPoweredOff` never results in a `scanErrored`
      call (verified by asserting `usePairingStore.getState().scan.kind` is
      `'idle'` via the `adapterStateChanged` path, not `'scanError'`).
- [ ] A `connectToDevice` call that neither resolves nor rejects within
      `CONNECT_TIMEOUT_MS` results in `connectFailed(deviceId, 'timeout')`,
      and `bleManager.cancelDeviceConnection` is called for that device id.
- [ ] A `connectToDevice` rejection with `errorCode ===
  BleErrorCode.DeviceNotFound` (or `DeviceConnectionFailed`) results in
      `connectFailed(deviceId, 'deviceUnavailable')`.
- [ ] `cancelConnect()` during `'connecting'` results in `connection.kind
  === 'disconnected'` and a `cancelDeviceConnection` call.
- [ ] The hook calls `usePairingStore.getState().reset()` exactly once, on
      mount.
- [ ] `ScanStatusBar`'s existing seven-row test file passes unmodified.
- [ ] NEARBY DEVICES renders one `DeviceRow` per discovered device, in
      `selectSortedDevices` order, and falls back to the existing empty
      copy only when there are none.
- [ ] Tapping a `DeviceRow` while another device is `'connecting'` does not
      call `connect` (the row is `disabled`).
- [ ] No new string is inline in JSX — all render via `t('pairing.…')`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: scanning, discovery, and the connect/connecting/connected/
  failed state machine only. No `0x2A37` subscription or BPM parsing, no
  persistence of paired devices, no auto-reconnect, no mid-session drop
  recovery once `connection.kind === 'connected'`, no iOS — all per the
  ticket's own out-of-scope list. `bleManager.monitorCharacteristicForDevice`
  and `discoverAllServicesAndCharacteristicsForDevice` are not called
  anywhere by this ticket.
- **`usePairingStore` is a singleton that outlives a single hook mount** —
  a deliberate consequence of using Zustand's idiomatic `create()` rather
  than a per-instance `useReducer`. In practice this means state survives a
  tab blur/refocus (which never unmounts `device.tsx` given `<Tabs>`'s
  default `unmountOnBlur: false` — see Interfaces/API), which is a mild
  behavioral improvement over the previous reducer-based draft, not a
  regression: a found device or an in-progress connect isn't lost just
  because the user glanced at another tab. A genuine remount (Fast Refresh,
  or some future change to how `<Tabs>` mounts screens) still gets a clean
  slate because the hook calls `reset()` on every mount — this is the one
  place this spec pays an explicit cost (a small chance of a one-tick-old
  device list flashing between an old mount's last commit and the new
  mount's `reset()` call, which is effectively instant in practice since
  `reset()` runs synchronously before the scan effect's first commit
  interval).
- **Once connected, this mount stops scanning for good.** `canScan` treats
  `connection.kind === 'connected'` the same as `'connecting'`. There is no
  in-screen path back to scanning after a successful connect other than
  leaving and re-entering the DEVICE tab (a genuine remount, which resets
  the store per above) — switching to a different device or recovering
  from a later drop is explicitly out of scope per "auto-reconnect"/
  "mid-session drop recovery".
- **`Home`'s `DeviceCard` and hero button are unaffected.** They stay fixed
  to their disconnected copy (per `ble-pairing-permissions`' own
  constraint) — propagating this ticket's real connection state to Home
  would need a shared state mechanism that doesn't exist and that
  `CLAUDE.md`'s "don't invent cross-cutting structure" guidance says isn't
  this ticket's call to make. (`usePairingStore` being a module-level
  singleton means it is _technically_ importable from `index.tsx` too —
  this spec deliberately does not do that; wiring Home to it is a call for
  whoever picks up that follow-up, not an automatic consequence of the
  store being global.) The ticket title itself scopes this work to "the
  pairing screen."
- **A connectable device is never speculated to become non-connectable
  later.** Once tracked by the aggregator, later updates apply regardless
  of a changed `isConnectable` value — the spike didn't observe this
  happening, so no behavior is defined for it beyond "don't crash, don't
  drop the row."
- **No stale-device pruning.** A device that stops advertising mid-scan
  (not mid-connect) stays in the aggregator — and therefore in the
  committed list — for the rest of the mount, per the same "maybe, not a
  no" reasoning the spike gave for the name-disappearing case. A staleness
  timeout is a reasonable future addition, not something this ticket's
  brief asked for.
- **`DEVICE_COMMIT_INTERVAL_MS` (500ms), `SCAN_TIMEOUT_MS` (30s), and
  `CONNECT_TIMEOUT_MS` (15s) are this spec's own defaults**, not values
  given by the ticket brief — see Data Model. All three are single exported
  constants, trivially retuned without touching the aggregator's or store's
  logic.
- **`useIsFocused` (tab-blur cleanup) is an addition beyond the ticket's
  literal "cleanup on unmount and on app background" wording** — justified
  in Interfaces/API and Style & Conventions by `expo-router`'s actual
  `<Tabs>` mounting behavior on this SDK version. Flagging it here as a
  scope decision made during spec-writing rather than a literal requirement.
- **No manual "stop scanning" control** while actively `scanning` — only
  automatic stops (timeout, unmount, blur, background, adapter-off) plus
  the implicit stop when a connect attempt starts. Given the app's design
  intentionally omits a shared button component (`ble-pairing-permissions`'
  own constraint), adding a second bespoke inline button for this would
  expand that surface without the ticket asking for it.
