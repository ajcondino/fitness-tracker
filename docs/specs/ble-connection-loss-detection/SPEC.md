# Feature: BLE Connection Loss Detection

## Intent

Once `usePairingStore`'s `connection.kind` is `'connected'`, the store
correctly leaves that state the moment the link is genuinely gone — the
phone's Bluetooth turning off or the device itself dropping (out of range,
battery dead, powered off) — instead of staying `'connected'` forever until a
manual cancel or a brand-new connect attempt happens to overwrite it.

## Context

- **Problem statement:** `src/ble/pairing-store.ts`'s only actions that ever
  mutate `connection` away from `'connected'` are none at all —
  `connectSucceeded`/`connectFailed`/`connectCancelled` all guard on
  `connection.kind === 'connecting'` (`src/ble/pairing-store.ts:83`, `:88`,
  `:93`), so once `connection.kind === 'connected'`, nothing in the store can
  move it anywhere else short of a fresh `connectRequested` call. The prior
  spec (`ble-device-scanning`) named this explicitly as a deferred item —
  "no mid-session drop recovery once `connection.kind === 'connected'`" — and
  the `live-workout-screen` spec confirmed it's still true at that point too
  ("no store transition exists for 'a connected device disconnected'").
  `adapterStateChanged` (`src/ble/pairing-store.ts:45-66`) already has a
  cascade for "adapter left `poweredOn`" but only checks
  `connection.kind === 'connecting'` (→ `connectionFailed('adapterOff')`) and
  `scan.kind === 'scanning'` (→ idle) — a `'connected'` connection falls
  through both checks untouched, so "phone Bluetooth turned off while
  connected" is exactly as undetected as "device physically dropped."
- **Current code:**
  - `src/ble/pairing-types.ts:29-33` — `ConnectionState` is `disconnected |
connecting | connected | connectionFailed`. `canScan`
    (`src/ble/pairing-types.ts:177-189`) excludes `'connecting'` and
    `'connected'` only. `deriveScanBarState`
    (`src/ble/pairing-types.ts:130-175`) matches only `'connected'`/
    `'connecting'` for its own two bar rows; every other `ConnectionState`
    kind (currently just `'disconnected'`/`'connectionFailed'`) falls through
    to the adapter/scan-derived rows below it.
  - `src/ble/pairing-store.ts:39-104` — `usePairingStore`. Every
    connect-outcome action (`connectSucceeded`/`connectFailed`/
    `connectCancelled`) follows the same shape: read `get().connection`,
    bail if `kind` isn't the expected in-flight kind or `deviceId` doesn't
    match, otherwise `set()`. This is the "staleness-guard pattern" the
    ticket asks the new action to reuse, gated on `'connected'` instead of
    `'connecting'`.
  - `src/hooks/use-device-pairing.ts` — the only file that ever calls a
    `bleManager` method. It already subscribes to `bleManager.onStateChange`
    for the life of the mount (`:70-76`) and has one existing
    connection-keyed effect (`:207-233`, the `previousConnectingIdRef`
    effect) that reacts to `connection` changes to best-effort cancel a
    native attempt. `bleManager.onDeviceDisconnected` is not called anywhere
    in the repo today.
  - `node_modules/react-native-ble-plx@3.5.1/src/BleManager.js:515` (read
    directly per `AGENTS.md` — no bundled `.d.ts`) —
    `onDeviceDisconnected(deviceIdentifier: DeviceId, listener: (error:
?BleError, device: Device) => void): Subscription`. Its own docstring:
    "Monitors if Device was disconnected due to any errors or connection
    problems... If an error is null, that means the connection was
    terminated by `bleManager.cancelDeviceConnection()` call." `cancelConnect()`
    in `use-device-pairing.ts:193-198` only acts during `'connecting'`, so it
    never fires this path while connected — but `live-workout.tsx:166`'s
    `__DEV__`-only "Simulate Dropout" trigger **does** call
    `bleManager.cancelDeviceConnection(deviceId)` directly while connected,
    by design (per `live-workout-screen`'s own spec, written before this
    subscription existed to catch it). This ticket's new subscription does
    not distinguish the two causes (see Interfaces/API), so the dev trigger
    will now also — correctly and usefully — drive `connection` to
    `connectionLost('deviceDisconnected')`, exercising the same detection
    path a real drop takes instead of being invisible to the store as it is
    today. This is a deliberate, welcome side effect, not a bug: see
    Constraints for why no cause-distinguishing logic is added regardless.
  - `src/app/(tabs)/device.tsx:15-29` — `selectRowStatus` maps a device's row
    status from `connection`: explicit checks for `'connected'`,
    `'connecting'`, `'connectionFailed'` (each gated on matching
    `deviceId`), falling through to `'available'` for anything else
    (currently just `'disconnected'` or a `connectionFailed`/`connected` for
    a different device). `'connectionLost'` will fall through the same way,
    with no code change required — the row for the now-lost device reverts to
    `'available'` (tappable, calls `connect(device.id)` again), exactly the
    way a `connectionFailed` row already behaves today. This is a confirmed,
    accepted side effect of the type extension, not new functionality added
    by this ticket: `device.tsx` is not otherwise touched.
  - `src/app/live-workout.tsx:35-41` reads `connection` live from the store
    on every render and derives `deviceId` from it fresh each time
    (`connection.kind === 'connected' ? connection.deviceId : null`).
    `useLiveHeartRate` (`src/hooks/use-live-heart-rate.ts`) does not import
    `usePairingStore` at all — its own spec is explicit that staleness is
    derived purely from elapsed time since the last HR notification,
    independent of `connection.kind`, specifically because (at the time it
    was written) nothing transitioned `connection` away from `'connected'`
    on a real drop, so this code path was unreachable. **This ticket makes
    it reachable**: once `connection.kind` flips to `'connectionLost'`,
    `live-workout.tsx`'s live re-derivation recomputes `deviceId` as `null`
    on its next render (Zustand re-renders any subscribed component on a
    field change), which flips `useLiveHeartRate`'s `deviceId` argument from
    a string to `null` (its effect's dependency array is exactly
    `[deviceId]`), tearing down the monitor subscription and collapsing the
    screen to its guard branch ("No monitor connected") — replacing the BPM
    readout and staleness indicator entirely, mid-session, the moment a real
    drop is detected. This directly conflicts with the ticket's own "must
    not change behaviour... staleness indicator stays exactly as-is"
    constraint, purely as an emergent consequence of an existing live
    selector reacting to a store transition this ticket newly makes
    possible — not from any change to `live-workout.tsx`'s code. Resolved
    per explicit confirmation (see Interfaces/API and Files Modified): this
    spec **does** make one small, additive change to `live-workout.tsx` —
    freezing `deviceId` at mount instead of re-deriving it live — specifically
    so the screen's current behavior is actually preserved, rather than
    technically "untouched" but observably different.
- **User impact:** On the Device screen, once a monitor drops or Bluetooth is
  turned off, the previously-"CONNECTED" scan bar and device row revert to
  the normal not-connected/available presentation instead of continuing to
  claim "CONNECTED" indefinitely — the same presentation a `connectionFailed`
  row already has today. On the Live Workout screen, nothing changes: it
  still shows a frozen BPM behind its own elapsed-time "signal lost"
  indicator exactly as before, now made possible by the one small,
  behavior-preserving change described below instead of by accident.
- **Dependencies:** No new package. Builds on `usePairingStore`/
  `pairing-types.ts` (`ble-device-scanning`) and `bleManager`
  (`ble-runtime-setup`). `react-native-ble-plx@3.5.1` (already installed) —
  `onDeviceDisconnected` is this ticket's only new API surface consumed.

## Data Model

```ts
// src/ble/pairing-types.ts

export type ConnectionLossReason =
  | 'adapterOff' // phone Bluetooth turned off while this device was connected
  | 'deviceDisconnected'; // the device itself dropped: out of range, dead battery, powered off

export type ConnectionState =
  | { kind: 'disconnected' }
  | { kind: 'connecting'; deviceId: string; startedAt: number }
  | { kind: 'connected'; deviceId: string }
  | { kind: 'connectionFailed'; deviceId: string; reason: ConnectionFailureReason }
  | { kind: 'connectionLost'; deviceId: string; reason: ConnectionLossReason };
```

`ConnectionFailureReason` (unchanged) means "an attempt never succeeded";
`ConnectionLossReason` means "it succeeded, then stopped being true" — a
deliberately separate type, not a widened `ConnectionFailureReason`, since
`'timeout'`/`'deviceUnavailable'`/`'unknown'` describe failure modes of an
in-flight attempt that have no meaning once a connection already succeeded.

**Invariant (extends the existing one in `ble-device-scanning`'s spec):**
`connection.kind === 'connectionLost'` is reachable only from
`connection.kind === 'connected'` for the same `deviceId` — enforced by the
new store action's staleness guard (see Interfaces/API), the same mechanism
that already enforces "`connecting` → `connectionFailed`/`connected`/
`disconnected` only for a matching in-flight `deviceId`."

## Interfaces / API

### `src/ble/pairing-types.ts` (modified)

- `canScan` (`src/ble/pairing-types.ts:177-189`): add
  `snapshot.connection.kind !== 'connectionLost'` alongside the existing
  `!== 'connecting'` / `!== 'connected'` terms. Without this, a lost
  connection makes `canScan` true again and silently restarts scanning,
  undoing "once connected, this mount stops scanning for good."
- `deriveScanBarState`: **no code change.** Its existing `connection.kind ===
'connected' || connection.kind === 'connecting'` check
  (`src/ble/pairing-types.ts:141`) already only matches those two kinds by
  construction — `'connectionLost'` falls through to the adapter/scan-derived
  rows below exactly like `'connectionFailed'` already does today. `ScanBarState`
  itself is untouched — no new `kind` is added to it.

### `src/ble/pairing-store.ts` (modified)

```ts
export type PairingStore = {
  // ...unchanged fields...
  connectionLost: (deviceId: string, reason: ConnectionLossReason) => void; // new
  // ...unchanged actions...
};
```

```ts
connectionLost: (deviceId, reason) => {
  const connection = get().connection;
  // Same staleness-guard shape as connectSucceeded/Failed/Cancelled, gated
  // on 'connected' instead of 'connecting': a no-op if this device isn't
  // the one currently connected, or if connection has already moved on
  // (e.g. the adapter-off cascade already won the race — see below).
  if (connection.kind !== 'connected' || connection.deviceId !== deviceId) return;
  set({ connection: { kind: 'connectionLost', deviceId, reason } });
},
```

`adapterStateChanged` (`src/ble/pairing-store.ts:45-66`) gains one new branch
in its existing cascade, in priority position **before** the scan check
(matching where the existing `'connecting'` check sits):

```ts
adapterStateChanged: (adapter) =>
  set((state) => {
    if (adapter === 'poweredOn') {
      return { adapter };
    }
    if (state.connection.kind === 'connecting') {
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
      // new — "adapter turned off while connected"
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
      return { adapter, scan: { kind: 'idle' } };
    }
    return { adapter };
  }),
```

Ordering note: `'connecting'` and `'connected'` are mutually exclusive
`connection.kind` values, so this is an addition to the cascade, not a
reordering of the existing `'connecting'` branch — both can coexist as
sibling `if`s without one shadowing the other.

### `src/hooks/use-device-pairing.ts` (modified — additive)

A new effect, keyed on `connection`, added alongside the existing
`previousConnectingIdRef` effect (`:207-233`):

```ts
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
```

The listener ignores its `error`/`device` callback arguments — this ticket
does not distinguish disconnect causes beyond `'deviceDisconnected'` (the
native error/no-error split documented in Context — "an error means a real
problem, no error means `cancelDeviceConnection` was called" — has no
`cancelDeviceConnection`-while-connected call site in this repo yet, so
there is nothing to distinguish today; see Constraints). Effect cleanup
(`connection.kind` leaving `'connected'`, for any reason, or unmount) removes
the subscription — one subscription ever active per connected session,
mirroring `use-live-heart-rate.ts`'s own "subscribe while a condition holds,
tear down the moment it stops holding" shape.

`connect()`, `cancelConnect()`, `retryScan()`, and every other exported
member of `useDevicePairing`'s return value are unchanged.

### `src/app/live-workout.tsx` (modified — additive, preserves current behavior)

```ts
// Before:
const connection = usePairingStore((state) => state.connection);
const devices = usePairingStore((state) => state.devices);
const deviceId = connection.kind === 'connected' ? connection.deviceId : null;

// After:
const devices = usePairingStore((state) => state.devices);
const [deviceId] = useState(() => {
  const connection = usePairingStore.getState().connection;
  return connection.kind === 'connected' ? connection.deviceId : null;
});
```

`deviceId` is captured once, from the store's snapshot at mount, via
`useState`'s lazy initializer — not read reactively via a `usePairingStore`
selector. This is the one deliberate exception to "screens don't change" in
this ticket: without it, `connection.kind` flipping to `'connectionLost'`
mid-session would recompute `deviceId` as `null` on the next render (see
Context) and collapse the screen to its guard branch, which is exactly the
behavior change the ticket says must not happen. Freezing `deviceId` at
mount means the rest of the screen — `useLiveHeartRate(deviceId)`, the BPM
readout, the `status`-driven line, the `__DEV__` trigger — keeps running
against the same device id for the life of the screen, identical to today,
regardless of what `connection` does afterward. The screen never reads
`connection` for any other purpose (confirmed: `src/app/live-workout.tsx`'s
only use of the `connection` selector is this one derivation), so dropping
the live selector entirely has no other effect. `devices` stays a live
selector — it never actually changes while `deviceId` is non-null anyway,
since `canScan` excludes both `'connected'` and `'connectionLost'`, so no
scan (and therefore no `setDevices` commit) runs during this screen's
lifetime.

### `__mocks__/react-native-ble-plx.ts` (modified)

```ts
export class BleManager {
  // ...existing stubs...
  onDeviceDisconnected = jest.fn(); // new
}
```

## Files Created

| File | Purpose                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| N/A  | This ticket extends existing modules only; no new file is warranted for one new type, one new store action, and one new hook effect. |

## Files Modified

| File                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ble/pairing-types.ts`                       | Add `ConnectionLossReason` and the `connectionLost` `ConnectionState` variant. Add the `!== 'connectionLost'` term to `canScan`. No change to `deriveScanBarState` or `ScanBarState`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/ble/__tests__/pairing-types.test.ts`        | Add a `canScan` case asserting `false` for `connectionLost`. Add a `deriveScanBarState` case asserting a `connectionLost` connection falls through to the matching adapter/scan-derived row (mirroring the existing `connectionFailed`-adjacent coverage implied by the "not connected/connecting" fallthrough cases already in the file).                                                                                                                                                                                                                                                                                                         |
| `src/ble/pairing-store.ts`                       | Add the `connectionLost` action. Add the `connection.kind === 'connected'` branch to `adapterStateChanged`'s cascade, in priority position before the scan check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/ble/__tests__/pairing-store.test.ts`        | Add a `connectionLost` describe block (transitions connected → connectionLost for a matching deviceId, both reasons; no-op for a mismatched deviceId; no-op when not currently connected — disconnected/connecting/connectionFailed/already-connectionLost). Extend the `adapterStateChanged` describe block with: connected → connectionLost(adapterOff) transition; a case confirming a connection already in `connectionLost`/`connectionFailed` is left untouched by a further `adapterStateChanged` call (no double-transition).                                                                                                              |
| `src/hooks/use-device-pairing.ts`                | Add the new `bleManager.onDeviceDisconnected`-subscribing effect described in Interfaces/API. No other exported behavior changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/hooks/__tests__/use-device-pairing.test.ts` | Add a `connection loss` describe block: subscribes via `onDeviceDisconnected(deviceId, ...)` once `connection` becomes `connected`; a captured disconnect callback firing transitions the store to `connectionLost('deviceDisconnected')`; the subscription's `remove()` is called when connection leaves `connected` (including via the adapter-off path) and on unmount; the race case both orderings — adapter-off arriving first makes a subsequent disconnect-event no-op, and a disconnect event arriving first makes a subsequent adapter-off no-op (asserted via `usePairingStore.getState().connection` staying at whichever reason won). |
| `__mocks__/react-native-ble-plx.ts`              | Add `onDeviceDisconnected = jest.fn()` to the `BleManager` mock class.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/app/(tabs)/__tests__/device.test.tsx`       | Add one regression case: with `connection.kind === 'connectionLost'` for a listed device, that device's row renders with `status="available"` (same as today's `connectionFailed`/`disconnected` fallthrough) and remains tappable to `connect()` again. No change to `src/app/(tabs)/device.tsx` itself — `selectRowStatus`'s existing fallthrough already produces this.                                                                                                                                                                                                                                                                         |
| `src/app/live-workout.tsx`                       | Freeze `deviceId` at mount (`useState` lazy initializer reading `usePairingStore.getState()` once) instead of deriving it from a live `connection` selector, per Interfaces/API — the one change needed so this screen's current behavior survives `connection` becoming able to leave `'connected'`.                                                                                                                                                                                                                                                                                                                                              |
| `src/app/__tests__/live-workout.test.tsx`        | Add a regression case: with a connected device at mount, transitioning `usePairingStore`'s `connection` to `connectionLost` (e.g. via `act(() => usePairingStore.getState().connectionLost(deviceId, 'deviceDisconnected'))`) does **not** flip the screen to its guard branch — the BPM readout, device chip, and status line stay rendered exactly as before the transition. Existing cases (guard branch at mount, live/stale status flip, Discard, Save, dev-trigger) pass unmodified.                                                                                                                                                         |

## Implementation Steps

1. Re-confirm `bleManager.onDeviceDisconnected`'s signature against
   `node_modules/react-native-ble-plx/src/BleManager.js` per `AGENTS.md`
   (already done for this spec — re-verify at implementation time in case
   the lockfile has moved).
2. Add `ConnectionLossReason` and the `connectionLost` variant to
   `ConnectionState` in `src/ble/pairing-types.ts`; add the `canScan`
   exclusion. Update `src/ble/__tests__/pairing-types.test.ts`.
3. Add the `connectionLost` action and the `adapterStateChanged` cascade
   branch to `src/ble/pairing-store.ts`. Update
   `src/ble/__tests__/pairing-store.test.ts` per Files Modified — this
   layer is fully testable with no BLE adapter, matching every existing
   action in this store.
4. Add `onDeviceDisconnected = jest.fn()` to
   `__mocks__/react-native-ble-plx.ts`.
5. Add the new effect to `src/hooks/use-device-pairing.ts`. Update
   `src/hooks/__tests__/use-device-pairing.test.ts` with fake-timer-driven
   coverage per Files Modified, following the file's existing
   `capturedScanListener`/`capturedStateListener` pattern for a new
   `capturedDisconnectListener`.
6. Add the one regression case to
   `src/app/(tabs)/__tests__/device.test.tsx` confirming
   `src/app/(tabs)/device.tsx` needs no code change.
7. Freeze `deviceId` in `src/app/live-workout.tsx` per Interfaces/API. Add
   the regression case to `src/app/__tests__/live-workout.test.tsx`
   confirming a `connectionLost` transition mid-session does not affect the
   rendered screen.
8. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **BLE side effects stay out of the store**, per `ble-device-scanning`'s own
  established rule: `connectionLost` is a synchronous `set()`/`get()` action
  like every other one in `pairing-store.ts`; `bleManager.onDeviceDisconnected`
  is called only from `use-device-pairing.ts`, which calls the store action —
  never the reverse.
- The new store action reuses the exact staleness-guard shape already used
  by `connectSucceeded`/`connectFailed`/`connectCancelled` — read
  `get().connection`, check `kind` and `deviceId` together, `set()` or
  return — rather than introducing a different guard style for this one
  action.
- The new hook effect mirrors `use-live-heart-rate.ts`'s "subscribe while a
  condition holds, one subscription per activation, tear down the instant
  the condition stops holding" shape, applied here to `connection.kind ===
'connected'` instead of a non-null `deviceId`.
- No new `en.json` copy, no new component, no new `DESIGN.md` token — this
  ticket is a pure state-machine extension; every screen-visible consequence
  (a device row reverting to `available`, the scan bar falling back to its
  adapter/scan-derived row) already exists in code for `connectionFailed`
  and needs no new rendering path.
- New tests are added to each module's own existing `__tests__/` file,
  matching every existing precedent — no new test file is created since no
  new source file is created.

## Acceptance Criteria

- [ ] `usePairingStore.getState().connectionLost(deviceId, 'deviceDisconnected')`
      (and `'adapterOff'`) transitions `connection` from `{ kind: 'connected',
deviceId }` to `{ kind: 'connectionLost', deviceId, reason }` for a
      matching `deviceId`.
- [ ] `connectionLost` is a no-op (connection unchanged) when
      `connection.kind` is `'disconnected'`, `'connecting'`,
      `'connectionFailed'`, or already `'connectionLost'`.
- [ ] `connectionLost` is a no-op when `connection.kind === 'connected'` but
      the given `deviceId` does not match `connection.deviceId`.
- [ ] `usePairingStore.getState().adapterStateChanged('poweredOff')` while
      `connection.kind === 'connected'` transitions `connection` to `{
kind: 'connectionLost', deviceId, reason: 'adapterOff' }`, and does not
      alter `scan`.
- [ ] `adapterStateChanged` called again while `connection.kind` is already
      `'connectionLost'` or `'connectionFailed'` leaves `connection`
      unchanged (no double-transition).
- [ ] `canScan(...)` returns `false` when `connection.kind ===
  'connectionLost'`, with every other context/adapter condition
      satisfied.
- [ ] `deriveScanBarState(...)` for a `connectionLost` connection returns the
      same kind it would for a `disconnected`/`connectionFailed` connection
      given the same `adapter`/`scan`/`devices` snapshot (i.e. it is governed
      entirely by the adapter/scan fallthrough, never by `connectionLost`
      itself).
- [ ] The hook calls `bleManager.onDeviceDisconnected(deviceId, expect.any(Function))`
      exactly once per connected session, only once `connection.kind ===
  'connected'` for that `deviceId` — not while `'connecting'`.
- [ ] Invoking the captured `onDeviceDisconnected` listener while connected
      results in `usePairingStore.getState().connection` equal to `{ kind:
  'connectionLost', deviceId, reason: 'deviceDisconnected' }`.
- [ ] The subscription's `remove()` is called when `connection` leaves
      `'connected'` for any reason (including via the adapter-off cascade)
      and on unmount.
- [ ] Race case A: triggering `adapterStateChanged('poweredOff')` first,
      then invoking the (not-yet-removed-at-call-time, or already-removed —
      either is acceptable) captured disconnect listener for the same
      device, leaves `connection.reason` as `'adapterOff'` — the second
      signal is a no-op.
- [ ] Race case B: invoking the captured disconnect listener first, then
      triggering `adapterStateChanged('poweredOff')`, leaves
      `connection.reason` as `'deviceDisconnected'` — the second signal is a
      no-op.
- [ ] `src/app/(tabs)/device.tsx`'s existing test suite passes unmodified,
      plus the new `connectionLost` → row-`available` regression case.
- [ ] `src/hooks/use-live-heart-rate.ts` is untouched by this ticket, and its
      existing test suite passes unmodified.
- [ ] `src/app/live-workout.tsx`'s existing test suite passes unmodified,
      plus the new regression case: transitioning `connection` to
      `connectionLost` after mount does not change what the screen renders
      (no flip to the guard branch, BPM/status/device-chip keep rendering
      from the frozen `deviceId`).
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Out of scope: any reconnect behaviour.** This ticket only detects and
  reflects the loss in `connection`. No auto-reconnect is added anywhere. A
  device row falling back to `'available'` (per the existing
  `connectionFailed`-shaped fallthrough) and becoming tappable again is a
  pre-existing, unmodified code path — a user-initiated retry via the
  already-shipped `connect()` flow, not new reconnect logic this ticket
  adds.
- **The Live Workout screen must not change behaviour as a result of this
  ticket — confirmed during spec-writing, resolved with one small, additive
  change rather than left as a side effect.** Before this ticket,
  `connection.kind` could never leave `'connected'` while the screen was
  mounted, so `live-workout.tsx`'s live `deviceId` derivation never actually
  saw it change; after this ticket, it can, and left as originally written
  the screen would collapse to its "No monitor connected" guard branch the
  moment a real drop is detected — a real, observable behavior change the
  ticket explicitly rules out. This was surfaced and confirmed rather than
  decided unilaterally (`CLAUDE.md`: "don't invent cross-cutting structure"
  cuts against silently reinterpreting a screen's behavior either way). The
  resolution: freeze `deviceId` at mount (Interfaces/API,
  `src/app/live-workout.tsx`) instead of leaving the screen's existing code
  untouched. This is a deliberate, narrow exception to "this ticket only
  fixes the state machine, not what any screen does about it" — the
  alternative (leave the screen alone) would have satisfied that sentence
  literally while violating the very next one ("staleness indicator stays
  exactly as-is"). `useLiveHeartRate` itself needed no change and stays
  untouched — freezing its caller's `deviceId` argument was sufficient.
- **The `__DEV__`-only "Simulate Dropout" trigger on Live Workout now
  exercises this ticket's real detection path.** It already calls
  `bleManager.cancelDeviceConnection(deviceId)` directly (from
  `live-workout-screen`, written before any subscription existed to react to
  it). With this ticket's new `onDeviceDisconnected` subscription active,
  that call now also drives `usePairingStore`'s `connection` to
  `connectionLost('deviceDisconnected')` — previously a pure no-op at the
  store level. This is a welcome side effect, not a regression: the dev
  trigger becomes a more honest simulation of a real drop. No change to the
  trigger itself is needed or made.
- **No distinction is made between the two `onDeviceDisconnected` causes
  (`error` present vs. `null`).** The only existing call to
  `cancelDeviceConnection` while `connection.kind === 'connected'` is Live
  Workout's own `__DEV__`-only dev trigger (see above), which exists
  specifically to simulate a drop — treating it identically to a real
  disconnect is correct, not a gap. Should a future ticket add a genuine
  user-facing "disconnect" action from the connected state, that action
  would need to suppress or precede this listener's `connectionLost` call
  (e.g. by removing the subscription first, or by checking the listener's
  `error` argument) — not handled here, since no such action exists yet.
- **`ConnectionLossReason` is a new, separate type from
  `ConnectionFailureReason`**, not a widened union of it — `'timeout'`/
  `'deviceUnavailable'`/`'unknown'` do not apply to an already-succeeded
  connection, and reusing the type would let a `connectionLost` state
  carry a reason that can never actually occur for it.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
- No `en.json` changes, no new component, no new `DESIGN.md` token — this
  spec is a state-machine-only change (see Style & Conventions).
