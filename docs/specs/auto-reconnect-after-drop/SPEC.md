# Feature: Auto-Reconnect After a Mid-Session Drop

## Intent

When a connected heart-rate monitor drops mid-session because the device
itself disconnected (out of range, battery, power-cycle), the app retries a
direct connection to that same device id up to 3 times with exponential
backoff, shows a "Reconnecting…" state while it does, and resumes the Live
Workout screen's BPM feed without a remount on success — so a brief range
dip or interference blip no longer forces a manual scan-and-tap. A deliberate
Bluetooth-off (`'adapterOff'`) never triggers this; the user is left to
re-enable it and reconnect manually.

## Context

- **Problem statement:** `usePairingStore`'s `connectionLost` action
  (`src/ble/pairing-store.ts:109-117`) already detects both ways a connected
  device stops being connected — `'deviceDisconnected'` (via
  `bleManager.onDeviceDisconnected`, wired in
  `src/hooks/use-device-pairing.ts:305-314`) and `'adapterOff'` (via the
  `adapterStateChanged` cascade, `src/ble/pairing-store.ts:63-72`) — but
  nothing reacts to either transition beyond letting the device row and scan
  bar fall back to their normal not-connected presentation
  (`ble-connection-loss-detection`'s own Constraints: "Out of scope: any
  reconnect behaviour... A device row falling back to `'available'`... is a
  pre-existing, unmodified code path — a user-initiated retry via the
  already-shipped `connect()` flow, not new reconnect logic"). This ticket
  adds that reconnect logic, scoped to the `'deviceDisconnected'` reason
  only.
- **Current code:**
  - `src/ble/pairing-types.ts:33-38` — `ConnectionState`'s five kinds
    (`disconnected | connecting | connected | connectionFailed |
connectionLost`). No kind exists today for "an automatic retry is
    in flight." `canScan` (`:182-201`) excludes `'connecting'`,
    `'connected'`, and `'connectionLost'`.
  - `src/ble/pairing-store.ts:41-126` — `usePairingStore`. Every
    connect-outcome action follows the same staleness-guard shape: read
    `get().connection`, bail unless `kind` (and `deviceId`) match what the
    action expects, otherwise `set()`. `adapterStateChanged`'s cascade
    (`:47-79`) has one `if` branch per `connection.kind` it reacts to
    (`'connecting'` → `connectionFailed('adapterOff')`, `'connected'` →
    `connectionLost('adapterOff')`, `'scanning'` → idle) and falls through
    untouched for every other kind — this ticket's new `'reconnecting'` kind
    needs its own branch here, or a mid-retry Bluetooth-off would leave
    `connection` stuck at `'reconnecting'` forever once every attempt starts
    silently failing against a powered-off adapter.
  - `src/hooks/use-device-pairing.ts` — the only file that calls a
    `bleManager` method. Three existing pieces interact directly with this
    ticket:
    - `connect(deviceId)` (`:217-253`): guards against a second concurrent
      attempt only via `connection.kind === 'connecting'`
      (`:218-221`), calls `bleManager.connectToDevice`, and on success
      inlines the exact three lines that persist the connected device
      (`:236-238`) — the "connect helper" the ticket says this ticket's new
      retry loop must share rather than duplicate.
    - The `previousConnectingIdRef` effect (`:267-295`): fires only on
      `connection.kind === 'connecting'` transitions, and best-effort
      cancels the native attempt via `bleManager.cancelDeviceConnection` when
      `connection` leaves `'connecting'` for anything other than
      `'connected'`. **Confirmed unaffected by this ticket**: the new retry
      loop's states are `'reconnecting'`/`'connected'`/`'reconnectFailed'` —
      never `'connecting'` — so this effect's own condition never matches a
      retry attempt, and it needs no change. The new loop gets its own,
      parallel cancellation-of-superseded-attempts mechanism (see
      Interfaces/API) rather than reusing or widening this one, since it
      tracks a single `deviceId`, not a `(deviceId, attempt)` pair.
    - The `onDeviceDisconnected` subscription effect (`:305-314`): keyed on
      `[connection]`, active only while `connection.kind === 'connected'`.
      **Confirmed self-healing across a successful reconnect with no code
      change**: the moment `connection` returns to `{ kind: 'connected',
deviceId }` (this ticket's own success path), the effect's dependency
      changes, its guard re-passes, and it re-subscribes for the new
      connected session — one subscription per connected session, exactly as
      today.
  - `src/hooks/use-live-heart-rate.ts` — `useLiveHeartRate(deviceId)`'s only
    effect dependency is `[deviceId]` (`:35`). A real mid-session drop and
    reconnect keeps `deviceId` unchanged throughout (per
    `ble-connection-loss-detection`, Live Workout freezes `deviceId` at
    mount — see below), so this effect never re-runs on a real drop+reconnect
    today: the old `monitorCharacteristicForDevice` subscription is silently
    dead the moment the native GATT connection drops (a fresh
    `connectToDevice` after a real disconnect is a new native connection;
    the prior discovery/monitor call does not survive it), and nothing
    currently re-establishes it. Without a change here, "resume the heart
    rate subscription... without needing a remount" is not achievable.
  - `src/app/live-workout.tsx` — per `ble-connection-loss-detection`,
    `deviceId` is captured once at mount via a `useState` lazy initializer
    reading `usePairingStore.getState().connection` (`:43-46`), specifically
    so a live `connection` selector wouldn't collapse this screen to its
    guard branch when `connection` leaves `'connected'`. The screen reads no
    other field from `connection` today. This ticket needs the screen to
    know, live, whether the frozen `deviceId` is currently mid-retry (to show
    "Reconnecting…") and whether it just came back (to re-arm
    `useLiveHeartRate`) — both without disturbing the frozen-`deviceId`
    guard-branch behavior that ticket established.
  - `node_modules/react-native-ble-plx@3.5.1/src/BleManager.js:487-504` (read
    directly per `AGENTS.md`) — `connectToDevice`: on Android, if the device
    is already marked connected natively, it calls
    `cancelDeviceConnection` first, then awaits the native connect call with
    no library-level timeout of its own — a device that isn't advertising
    yet can leave this promise pending for a long, OS-dependent duration
    rather than rejecting quickly. This is exactly why `connect()` already
    races it against its own `CONNECT_TIMEOUT_MS` (`:225-227`) rather than
    trusting the native promise to settle promptly, and why this ticket's
    retry loop needs the same treatment per attempt (see Constraints for the
    chosen value and the required real-device calibration).
    `cancelDeviceConnection` (`:501-504`): "cancels pending connection" per
    its own docstring — used here to make a superseded attempt's eventual
    settlement harmless rather than merely ignored (see Interfaces/API).
- **User impact:** A monitor that drops mid-session because it went out of
  range, died, or was powered off is retried automatically; Live Workout
  shows a "Reconnecting…" line alongside its existing (unchanged) frozen
  BPM/"SIGNAL LOST" presentation while that happens, and BPM resumes live the
  moment a retry lands — no navigation, no remount. If Bluetooth itself was
  turned off instead, nothing automatic happens — the user turns it back on
  and reconnects by hand, exactly as today. If all 3 retries fail, Live
  Workout quietly reverts to exactly what it already shows for an
  unrecovered drop (frozen BPM + "SIGNAL LOST", no further indicator), and
  the Device tab's existing "PREVIOUSLY PAIRED" row remains the way back in —
  both unchanged from today's behavior.
- **Dependencies:** No new package. Builds on `usePairingStore`/
  `pairing-types.ts` (`ble-device-scanning`, `ble-connection-loss-detection`),
  `bleManager` (`ble-runtime-setup`), the saved-device persistence helper
  (`persist-last-connected-device`), and `useLiveHeartRate`
  (`live-workout-screen`).

## Data Model

```ts
// src/ble/pairing-types.ts

export type ConnectionState =
  | { kind: 'disconnected' }
  | { kind: 'connecting'; deviceId: string; startedAt: number }
  | { kind: 'connected'; deviceId: string }
  | { kind: 'connectionFailed'; deviceId: string; reason: ConnectionFailureReason }
  | { kind: 'connectionLost'; deviceId: string; reason: ConnectionLossReason }
  | { kind: 'reconnecting'; deviceId: string; attempt: number } // new — 1..RECONNECT_MAX_ATTEMPTS
  | { kind: 'reconnectFailed'; deviceId: string }; // new — every attempt exhausted, resting

/** Up to this many direct-connect attempts per drop, per the ticket. */
export const RECONNECT_MAX_ATTEMPTS = 3;

/** Delay before attempt N (1-indexed) — index 0 is the wait before attempt 1,
 * so "Reconnecting…" is visible from the moment the drop is detected, not
 * only once the first native call is actually in flight. Educated-guess
 * defaults per the ticket brief (~2s/4s/8s) — MUST be re-verified against a
 * real device before this ships; see Constraints. */
export const RECONNECT_BACKOFF_MS = [2_000, 4_000, 8_000];

/** Per-attempt ceiling, independent of CONNECT_TIMEOUT_MS. A reconnect is a
 * direct connect to an already-bonded, recently-seen address — no scan, no
 * fresh discovery — so it should resolve faster than a first-time connect;
 * a full CONNECT_TIMEOUT_MS (15s) per attempt would let one drop's full
 * retry cycle run past a minute. This spec's own default — see
 * Constraints. */
export const RECONNECT_ATTEMPT_TIMEOUT_MS = 5_000;
```

`ConnectionLossReason`/`ConnectionFailureReason` are unchanged — `attempt`
lives only on `'reconnecting'`, since it has no meaning for any other kind.

**Invariants (extend the existing ones):**

- `'reconnecting'` is reachable only from `{ kind: 'connectionLost', reason:
'deviceDisconnected' }` (attempt 1) or from `'reconnecting'` itself for the
  same `deviceId` (attempt N+1) — enforced by `reconnectAttemptStarted`'s
  guard.
- `'reconnectFailed'` is reachable only from `'reconnecting'` for the same
  `deviceId`, and only after `attempt === RECONNECT_MAX_ATTEMPTS` has itself
  failed — enforced by the hook (the store action itself only guards
  `deviceId`/kind, matching every other action's staleness-guard shape; the
  attempt-count gate is call-site logic in the hook, not the store, per
  "store actions stay synchronous" — see Interfaces/API).
- `'reconnecting'` never transitions to `'connectionFailed'` — a failed
  attempt either schedules the next one or (on the last) becomes
  `'reconnectFailed'`. `ConnectionFailureReason` still means only "an
  attempt that never once succeeded"; it is not reused here.

## Interfaces / API

### `src/ble/pairing-types.ts` (modified)

`canScan` gains exactly one new exclusion term:

```ts
snapshot.connection.kind !== 'reconnecting';
```

`'reconnectFailed'` is **deliberately not excluded** — same treatment as
`'connectionFailed'`/`'disconnected'` today, so scanning (and therefore the
Device tab's normal scan-and-tap flow) is the manual path forward once the
automatic retries are exhausted, with no new UI needed for it.

`deriveScanBarState`/`ScanBarState`: **no change.** Both new kinds fall
through to the existing adapter/scan-derived rows, the same fallthrough
`'connectionLost'` already gets. This ticket does not surface "Reconnecting…"
on the Device tab's scan bar — only on Live Workout (see Constraints for why
that's the deliberate scope, not an oversight).

### `src/ble/pairing-store.ts` (modified)

Three new actions, each the same staleness-guard shape as every existing one:

```ts
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
```

`adapterStateChanged`'s cascade gains one new branch, in priority position
alongside the existing `'connecting'`/`'connected'` branches (before the scan
check):

```ts
if (state.connection.kind === 'reconnecting') {
  // Bluetooth itself went off mid-retry — stop pretending a retry is still
  // meaningful; land on the same resting state a plain "adapter off while
  // connected" drop would produce, so the user's next move (turn Bluetooth
  // back on, reconnect manually) is identical either way.
  return {
    adapter,
    connection: {
      kind: 'connectionLost',
      deviceId: state.connection.deviceId,
      reason: 'adapterOff',
    },
  };
}
```

Without this branch, an adapter-off event mid-retry would leave `connection`
stuck at `'reconnecting'` indefinitely: the in-flight/queued attempt would
keep failing against a powered-off adapter, but `reconnectAttemptStarted`'s
own guard (above) already prevents scheduling past this point once
`connection.reason` is `'adapterOff'` — the attempts silently stop, but
without this branch nothing ever moves `connection` off `'reconnecting'` to
reflect that. This mirrors the existing `'connecting'` → `connectionFailed`
and `'connected'` → `connectionLost` branches exactly, applied to the new
kind.

### `src/hooks/use-device-pairing.ts` (modified — additive plus one small,

justified refactor)

**Refactor (behavior-preserving):** the three lines in `connect()`'s success
branch that build a `SavedDevice` and persist it (`:236-238`) are extracted
into a private helper, so the retry loop below can call the same logic
instead of re-deriving it:

```ts
function persistConnectedDevice(device: Device) {
  const saved: SavedDevice = { id: device.id, name: device.name ?? device.localName ?? null };
  setSavedDevice(saved);
  void saveDevice(saved);
}
```

`connect()`'s own body is otherwise unchanged, with one additive guard
extension: it must not fire concurrently with an in-flight retry, the same
reasoning that already stops a second concurrent `'connecting'` attempt:

```ts
// Before: if (usePairingStore.getState().connection.kind === 'connecting') return;
const currentKind = usePairingStore.getState().connection.kind;
if (currentKind === 'connecting' || currentKind === 'reconnecting') return;
```

This closes a narrow but real race: `selectRowStatus`
(`src/app/(tabs)/device.tsx:16-30`) falls through `'reconnecting'` to
`'available'` the same way it already does for `'connectionLost'` (no code
change there — see Files Modified), so a stale row from an earlier scan could
still be tappable while an automatic retry is running for the same device.
Without this guard, that tap would call `connectRequested`, clobbering the
retry loop's own state out from under it.

**New retry-loop state** (module-external types, hook-local refs):

```ts
const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// Identity-compared "current attempt" token — see runReconnectAttempt.
const currentReconnectRef = useRef<{ deviceId: string; attempt: number } | null>(null);
```

**The driver effect** — fires exactly once per qualifying drop:

```ts
useEffect(() => {
  if (connection.kind !== 'connectionLost' || connection.reason !== 'deviceDisconnected') {
    return;
  }
  scheduleReconnectAttempt(connection.deviceId, 1, RECONNECT_BACKOFF_MS[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [connection]);
```

Guarded on the literal reason, per the ticket's explicit, non-negotiable
scope: `'adapterOff'` never reaches this branch. Re-fires are naturally
inert: once `scheduleReconnectAttempt` runs,
`connection.kind` becomes `'reconnecting'` on the next render, so this
effect's own guard fails on every subsequent invocation for the same drop —
no ref-based "already started" guard is needed, unlike the cold-launch
auto-reconnect effect (which needs one because its trigger condition,
`savedDevice`, does not itself change as a side effect of firing).

**Scheduling and running an attempt:**

```ts
function scheduleReconnectAttempt(deviceId: string, attempt: number, delayMs: number) {
  const token = { deviceId, attempt };
  currentReconnectRef.current = token;
  usePairingStore.getState().reconnectAttemptStarted(deviceId, attempt);
  reconnectTimeoutRef.current = setTimeout(
    () => runReconnectAttempt(deviceId, attempt, token),
    delayMs,
  );
}

function runReconnectAttempt(
  deviceId: string,
  attempt: number,
  token: { deviceId: string; attempt: number },
) {
  const isCurrent = () => currentReconnectRef.current === token;

  const fail = () => {
    if (!isCurrent()) return; // superseded by a timeout/rejection race — see below
    if (attempt >= RECONNECT_MAX_ATTEMPTS) {
      usePairingStore.getState().reconnectFailed(deviceId);
      return;
    }
    scheduleReconnectAttempt(deviceId, attempt + 1, RECONNECT_BACKOFF_MS[attempt]);
  };

  reconnectTimeoutRef.current = setTimeout(fail, RECONNECT_ATTEMPT_TIMEOUT_MS);

  bleManager.connectToDevice(deviceId).then(
    (device) => {
      if (reconnectTimeoutRef.current != null) clearTimeout(reconnectTimeoutRef.current);
      if (!isCurrent()) {
        // This attempt's own RECONNECT_ATTEMPT_TIMEOUT_MS already fired and
        // a later attempt has superseded it — accepting this late success
        // would leave two native connections contending. Tear this one back
        // down instead of adopting it.
        bleManager.cancelDeviceConnection(deviceId).catch(() => {});
        return;
      }
      usePairingStore.getState().reconnectSucceeded(deviceId);
      persistConnectedDevice(device);
    },
    () => {
      if (reconnectTimeoutRef.current != null) clearTimeout(reconnectTimeoutRef.current);
      fail();
    },
  );
}
```

`token` is a fresh object per attempt; `isCurrent()`'s identity comparison is
what makes a superseded attempt's async handlers no-ops (beyond the
belt-and-suspenders `clearTimeout` calls) — the same "cancel stale async
work" shape as `previousConnectingIdRef`, adapted for a sequence of attempts
under one continuous cycle instead of a single in-flight one. This is a new
mechanism for this file, not a reuse of `previousConnectingIdRef`, because
that ref tracks a single `deviceId`, not a `(deviceId, attempt)` pair — see
Context for why widening it was rejected in favor of a parallel mechanism.

**Cleanup on unmount** (defensive; per existing specs this hook effectively
never unmounts mid-session, but a pending timer must not outlive the hook):

```ts
useEffect(() => {
  return () => {
    if (reconnectTimeoutRef.current != null) clearTimeout(reconnectTimeoutRef.current);
  };
}, []);
```

Every other exported member of `useDevicePairing`'s return value is
unchanged — no new field is returned; Live Workout derives what it needs
from `usePairingStore` directly (see below), matching how it already reads
`connection`/`devices` without going through this hook (only `device.tsx`
calls `useDevicePairing`).

### `src/hooks/use-live-heart-rate.ts` (modified — additive)

```ts
export function useLiveHeartRate(
  deviceId: string | null,
  isConnected: boolean, // new
): { bpm: number | null; status: LiveHeartRateStatus };
```

The effect's guard and dependency array both grow to include `isConnected`:

```ts
useEffect(() => {
  if (deviceId == null || !isConnected) return;
  // ...unchanged body: discover, monitor, stale-check interval, cleanup...
}, [deviceId, isConnected]);
```

Effect semantics, spelled out:

- **Initial mount while connected** (`isConnected` starts `true`): identical
  to today — discovery + monitor run once, exactly as before this ticket.
- **`isConnected` flips to `false`** (a drop, real or `__DEV__`-simulated):
  the effect's cleanup runs (clears the stale-check interval, best-effort
  `subscription?.remove()` on a subscription that's likely already dead
  natively — harmless either way), and the guard makes the re-run a no-op —
  no discovery attempt against a device that isn't connected.
- **`isConnected` flips back to `true`** (a successful reconnect, this
  ticket's own new path — `deviceId` is unchanged throughout, since Live
  Workout never changes it, so only `isConnected` toggling drives this):
  the effect re-runs its full body, calling
  `discoverAllServicesAndCharacteristicsForDevice` and
  `monitorCharacteristicForDevice` again against the _new_ native connection
  — this is what makes BPM resume without a remount.
- `bpm` is still never reset to `null` on a drop (unchanged) — it keeps
  showing the last known value throughout the reconnecting window, exactly
  as it already does today for the frozen-forever case this ticket now
  makes recoverable. `status`'s derivation (`awaitingFirstReading` /
  `stale` / `live`) is completely unchanged — still purely a function of
  `bpm`/elapsed-time-since-last-reading, per `live-workout-screen`'s own
  Style & Conventions, which this ticket does not touch.

### `src/app/live-workout.tsx` (modified — additive)

```ts
// Before:
const devices = usePairingStore((state) => state.devices);
const [deviceId] = useState(() => {
  /* frozen at mount, unchanged */
});

// After — one new live selector, deliberately narrow:
const devices = usePairingStore((state) => state.devices);
const connection = usePairingStore((state) => state.connection);
const [deviceId] = useState(() => {
  /* frozen at mount, unchanged */
});

const isConnected =
  deviceId != null && connection.kind === 'connected' && connection.deviceId === deviceId;
const isReconnecting =
  deviceId != null && connection.kind === 'reconnecting' && connection.deviceId === deviceId;
```

`deviceId` itself stays frozen — the guard branch (`deviceId === null`) is
unaffected, still evaluated only against the mount-time snapshot, per
`ble-connection-loss-detection`'s own resolution. `connection` is now read
live again, but only to derive two booleans scoped to the frozen device —
the screen does not otherwise react to `connection.kind` (it never renders
`'connectionFailed'`/`'disconnected'`/etc. specially, and still doesn't).

```ts
const { bpm, status } = useLiveHeartRate(deviceId, isConnected);
```

One new, additive render, directly below the existing status line, shown
only while `isReconnecting`:

```tsx
{
  isReconnecting && (
    <ThemedText variant="dataSm" color="onSurfaceMuted" style={styles.reconnecting}>
      {t('liveWorkout.reconnecting')}
    </ThemedText>
  );
}
```

No other line on the screen changes. The existing status line
(`live`/`stale`/`awaitingFirstReading`, driven entirely by `useLiveHeartRate`'s
own `status`) is untouched — during a drop it will already read "SIGNAL
LOST" (via the existing elapsed-time staleness check) independently of
whether a retry is in flight, so the two lines are complementary, not
redundant: "SIGNAL LOST" says the feed stopped; "RECONNECTING…" says the app
is doing something about it. When `isReconnecting` becomes `false` again —
either because a retry succeeded (BPM resumes, "SIGNAL LOST" clears on the
next fresh reading) or because all 3 attempts were exhausted (the screen
reverts to exactly what it already shows for any unrecovered drop) — no
further new UI appears, per Constraints.

### `src/i18n/locales/en.json` (modified)

One new key under the existing `liveWorkout` namespace:

```json
"liveWorkout": {
  "reconnecting": "RECONNECTING…"
}
```

## Files Created

| File | Purpose                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N/A  | This ticket extends existing modules only — two new `ConnectionState` kinds, three new store actions, one new hook effect/loop, one new hook parameter, one new screen line — none of it warrants a new file. |

## Files Modified

| File                                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ble/pairing-types.ts`                        | Add `'reconnecting'`/`'reconnectFailed'` to `ConnectionState`; add `RECONNECT_MAX_ATTEMPTS`/`RECONNECT_BACKOFF_MS`/`RECONNECT_ATTEMPT_TIMEOUT_MS`; add the `!== 'reconnecting'` term to `canScan`. No change to `deriveScanBarState`/`ScanBarState`.                                                                                                                                                                                                                                                                    |
| `src/ble/__tests__/pairing-types.test.ts`         | Add `canScan` cases: `false` for `'reconnecting'`; `true` for `'reconnectFailed'` (mirrors the existing `'connectionFailed'`/`'disconnected'` cases) with every other condition satisfied.                                                                                                                                                                                                                                                                                                                              |
| `src/ble/pairing-store.ts`                        | Add `reconnectAttemptStarted`/`reconnectSucceeded`/`reconnectFailed`; add the `'reconnecting'` branch to `adapterStateChanged`'s cascade.                                                                                                                                                                                                                                                                                                                                                                               |
| `src/ble/__tests__/pairing-store.test.ts`         | New `describe` blocks per Acceptance Criteria: each action's transition + staleness-guard no-ops (wrong kind, wrong deviceId, wrong reason); `adapterStateChanged` while `'reconnecting'` → `connectionLost('adapterOff')`.                                                                                                                                                                                                                                                                                             |
| `src/hooks/use-device-pairing.ts`                 | Extract `persistConnectedDevice`; extend `connect()`'s concurrency guard to `'reconnecting'`; add `reconnectTimeoutRef`/`currentReconnectRef`, the driver effect, `scheduleReconnectAttempt`/`runReconnectAttempt`, and the unmount-cleanup effect. No change to any existing exported field or its documented behavior.                                                                                                                                                                                                |
| `src/hooks/__tests__/use-device-pairing.test.ts`  | New `describe` block per Acceptance Criteria (fake-timer driven, following the file's existing `capturedDisconnectListener` pattern to trigger the initial drop).                                                                                                                                                                                                                                                                                                                                                       |
| `src/hooks/use-live-heart-rate.ts`                | Add the `isConnected` parameter; extend the effect's guard and dependency array.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/hooks/__tests__/use-live-heart-rate.test.ts` | Update existing calls to pass `isConnected: true` (behavior-preserving); add cases: `isConnected: false` at mount never calls discovery; a `false → true` transition re-runs discovery + monitor with the same `deviceId`; a `true → false` transition tears down the old subscription without a new discovery call.                                                                                                                                                                                                    |
| `src/app/live-workout.tsx`                        | Add the live `connection` selector and `isConnected`/`isReconnecting` derivations; pass `isConnected` into `useLiveHeartRate`; render the new conditional "Reconnecting…" line.                                                                                                                                                                                                                                                                                                                                         |
| `src/app/__tests__/live-workout.test.tsx`         | New cases per Acceptance Criteria: `'reconnecting'` renders the new line without disturbing the existing status/BPM assertions; a `'reconnecting' → 'connected'` transition (with a fresh monitor callback) resumes a live BPM/status render with no remount and hides the line; `'reconnectFailed'` renders identically to today's unrecovered-drop case (no new UI). Existing cases (guard branch, live/stale flip, Discard, Save, dev-trigger, the `ble-connection-loss-detection` regression case) pass unmodified. |
| `src/i18n/locales/en.json`                        | Add `liveWorkout.reconnecting`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Implementation Steps

1. **Calibrate the backoff schedule against real hardware first** — this is
   an explicit prerequisite, not a nice-to-have: pair a Garmin Forerunner 55,
   connect, then power-cycle it and measure how long it takes to resume
   advertising. If that duration consistently exceeds
   `RECONNECT_BACKOFF_MS[0]` (2000ms), raise the schedule accordingly before
   writing the constant, and record the measured figure in the code comment
   next to `RECONNECT_BACKOFF_MS` as the value's justification. Do the same
   sanity check for `RECONNECT_ATTEMPT_TIMEOUT_MS` (5000ms) against how long
   a real direct reconnect takes to settle once the device is advertising.
2. Add the two new `ConnectionState` kinds and the three new constants to
   `src/ble/pairing-types.ts`; add the `canScan` exclusion. Update
   `src/ble/__tests__/pairing-types.test.ts`.
3. Add the three new store actions and the `adapterStateChanged` cascade
   branch to `src/ble/pairing-store.ts`. Update
   `src/ble/__tests__/pairing-store.test.ts` — this layer needs no BLE
   adapter, matching every existing action in this store.
4. Extract `persistConnectedDevice` and extend `connect()`'s concurrency
   guard in `src/hooks/use-device-pairing.ts`; confirm the existing
   `connect()`-related tests in
   `src/hooks/__tests__/use-device-pairing.test.ts` still pass unmodified
   (pure refactor, no behavior change).
5. Add the driver effect, `scheduleReconnectAttempt`/`runReconnectAttempt`,
   and the two new refs plus the unmount-cleanup effect. Add the new
   `describe` block to `src/hooks/__tests__/use-device-pairing.test.ts`,
   covering at minimum: the full 2s/4s/8s backoff timing between attempts
   using `jest.advanceTimersByTime`; a success on attempt 2 stopping further
   attempts; exhaustion after 3 failures landing on `reconnectFailed`;
   `'adapterOff'` never starting a retry; a `connect()` call while
   `'reconnecting'` being a no-op; a superseded attempt's late resolution
   (fire the attempt-timeout, then resolve the original
   `connectToDevice` promise) calling `cancelDeviceConnection`, not
   `reconnectSucceeded`.
6. Add the `isConnected` parameter to `src/hooks/use-live-heart-rate.ts`.
   Update `src/hooks/__tests__/use-live-heart-rate.test.ts`'s existing calls
   and add the new transition cases.
7. Add the live selector/derivations and the new conditional line to
   `src/app/live-workout.tsx`. Add the new cases to
   `src/app/__tests__/live-workout.test.tsx`.
8. Add `liveWorkout.reconnecting` to `src/i18n/locales/en.json`.
9. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **Store actions stay synchronous**, per the ticket's own explicit
  constraint and this store's established rule: the three new actions are
  plain `set()`/`get()` calls, identical in shape to every existing one.
  The backoff timers and the native `connectToDevice` calls live entirely in
  `use-device-pairing.ts`.
- **The new store actions reuse the existing staleness-guard pattern**
  (read `get().connection`, check `kind`/`deviceId`, `set()` or return) —
  no new guard style introduced for this ticket.
- **The retry loop shares `persistConnectedDevice` with `connect()`**
  rather than re-deriving the saved-device shape a second time, directly
  per the ticket's explicit instruction not to duplicate the cold-launch
  auto-reconnect's persistence logic.
- **A fresh identity-compared token per attempt**, not a shared boolean or
  counter comparison, is this ticket's mechanism for "is this async result
  still the one that matters" — chosen because two different failure
  timings (the attempt's own timeout firing vs. the native promise settling
  late) both need to become no-ops once superseded, and object identity is
  the simplest correct way to express "this exact attempt, not a
  same-numbered retry of it."
- All new copy renders via `t('liveWorkout.reconnecting')`, matching
  `CLAUDE.md`'s i18n rule — no inline JSX string literal.
- New tests are added to each module's own existing `__tests__/` file, no
  new test file, matching every existing precedent in this repo.

## Acceptance Criteria

- [ ] `connectionLost(deviceId, 'deviceDisconnected')` while connected leads,
      with no further input, to `reconnectAttemptStarted(deviceId, 1)` being
      called after `RECONNECT_BACKOFF_MS[0]` (2000ms by default, or the
      calibrated value from Implementation Step 1).
- [ ] `connectionLost(deviceId, 'adapterOff')` never results in any
      `reconnectAttemptStarted`/`bleManager.connectToDevice` call.
- [ ] A successful `connectToDevice` resolution during any attempt
      transitions `usePairingStore.getState().connection` to `{ kind:
'connected', deviceId }` and calls `saveDevice` with the resolved
      device's `name ?? localName ?? null` — matching a manual connect's
      persistence contract exactly.
- [ ] A rejected/timed-out attempt before the 3rd schedules the next attempt
      after the correct `RECONNECT_BACKOFF_MS` entry; `connection.attempt`
      increments accordingly.
- [ ] A rejected/timed-out 3rd attempt transitions `connection` to `{ kind:
'reconnectFailed', deviceId }` and schedules no further attempt.
- [ ] `canScan(...)` returns `false` for `connection.kind === 'reconnecting'`
      and `true` (all else satisfied) for `connection.kind ===
'reconnectFailed'`, with every other existing `canScan` case unchanged.
- [ ] `usePairingStore.getState().adapterStateChanged('poweredOff')` while
      `connection.kind === 'reconnecting'` transitions `connection` to `{
kind: 'connectionLost', deviceId, reason: 'adapterOff' }`.
- [ ] Calling `connect(deviceId)` while `connection.kind === 'reconnecting'`
      is a no-op: no `connectRequested` call, `connection` unchanged.
- [ ] A late resolution from a superseded attempt (its own
      `RECONNECT_ATTEMPT_TIMEOUT_MS` already fired and the next attempt has
      started) calls `bleManager.cancelDeviceConnection`, and does **not**
      call `reconnectSucceeded`/mutate `connection`.
- [ ] `useLiveHeartRate(deviceId, false)` never calls
      `discoverAllServicesAndCharacteristicsForDevice`.
- [ ] `useLiveHeartRate(deviceId, true)` behaves exactly as
      `useLiveHeartRate(deviceId)` did before this ticket (discovery →
      monitor → live/stale derivation) — existing test cases pass with
      `isConnected: true` added to their call sites.
- [ ] A `true → false → true` `isConnected` transition (same `deviceId`
      throughout) results in exactly two
      `discoverAllServicesAndCharacteristicsForDevice` calls total — one for
      each `true` phase — and the subscription active during the first
      `true` phase has `remove()` called on it before the second begins.
- [ ] `src/app/live-workout.tsx`: with the frozen `deviceId` connected at
      mount, transitioning `usePairingStore`'s `connection` to `{ kind:
'reconnecting', deviceId, attempt }` renders `t('liveWorkout.reconnecting')`
      without changing the existing BPM readout or status line's rendered
      output.
- [ ] Transitioning further to `{ kind: 'connected', deviceId }` and then
      firing a fresh `monitorCharacteristicForDevice` callback resumes a
      live BPM/status render and removes the "Reconnecting…" line — with no
      component remount (assert via the same rendered tree, not a fresh
      `render()` call).
- [ ] Transitioning instead to `{ kind: 'reconnectFailed', deviceId }`
      renders identically to the existing `'connectionLost'` regression case
      (`ble-connection-loss-detection`) — no new text appears.
- [ ] `src/app/(tabs)/device.tsx`'s existing test suite passes unmodified —
      `'reconnecting'`/`'reconnectFailed'` fall through `selectRowStatus` to
      `'available'` with no code change, mirroring `'connectionLost'`'s own
      already-accepted fallthrough.
- [ ] No new string is inline in JSX — the new copy renders via `t(...)`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Triggered only by `connectionLost` with reason `'deviceDisconnected'`.**
  `'adapterOff'` is explicitly excluded, per the ticket's own non-negotiable
  product decision — not generalized to both reasons anywhere in this
  design (the driver effect's guard checks the literal reason string; the
  `adapterStateChanged` cascade's new branch only ever _exits_ a retry
  early, it never starts one).
- **No scan fallback.** Every attempt connects directly to the known
  `deviceId` via `bleManager.connectToDevice`; `bleManager.startDeviceScan`
  is never called by the retry loop, and `canScan`'s new exclusion actively
  prevents the hook's own scan-start effect from racing it.
- **Exactly 3 attempts, then stop.** No unbounded retry, no user-facing
  "retry again" affordance added anywhere by this ticket — reaching
  `'reconnectFailed'` is terminal for that drop; a subsequent drop (a fresh
  `'connected' → connectionLost('deviceDisconnected')` transition) starts an
  entirely new, independent cycle.
- **The "Reconnecting…" indicator is Live-Workout-only.** `deriveScanBarState`
  and `ScanBarState` are unchanged; the Device tab's scan bar and device rows
  show no new state for `'reconnecting'`/`'reconnectFailed'` beyond the
  existing `'available'` fallthrough. This is deliberate, matching the
  ticket's own scope ("the only new thing this screen shows" refers to Live
  Workout) and `CLAUDE.md`'s "additive diffs on working screens" —
  widening `ScanBarState` for one new transient copy string on a screen this
  ticket doesn't otherwise touch was judged out of proportion.
- **No new UI for the terminal failure case anywhere.** Once
  `'reconnectFailed'` is reached, Live Workout reverts to exactly what it
  already renders for any unrecovered drop (frozen BPM, "SIGNAL LOST" via
  the pre-existing, untouched staleness indicator) and the Device tab is
  unchanged from today. The disappearance of "Reconnecting…" combined with
  the already-existing "SIGNAL LOST" line and the always-available
  "Discard" action (back to the Device tab, where the saved device and a
  fresh scan remain the existing, unmodified path back in) is this design's
  answer to "land in a resting state that makes the situation clear and
  offers a manual path forward" — without inventing any new copy or
  component for it.
- **`RECONNECT_BACKOFF_MS`/`RECONNECT_ATTEMPT_TIMEOUT_MS` are this spec's own
  defaults, explicitly flagged as unverified until Implementation Step 1's
  real-device measurement is done.** Do not treat the 2s/4s/8s/5s figures in
  this document as final without that measurement, per the ticket's own
  calibration note.
- **`previousConnectingIdRef` is confirmed unmodified.** It only ever reacts
  to `connection.kind === 'connecting'`, which no part of this ticket's retry
  path ever produces — see Context. Its cancellation duty for the retry
  loop is fulfilled instead by `runReconnectAttempt`'s own token-based
  supersession check, a deliberately separate, parallel mechanism (see Style
  & Conventions), not a widened reuse of that ref.
- **No workout-data recovery.** This ticket does not persist or restore any
  workout state across a drop; Save remains the existing no-op. Out of
  scope, per the ticket.
- **No reaction to BPM staleness without a disconnect event.** `bpm` going
  stale while `connection.kind` never leaves `'connected'` (no
  `onDeviceDisconnected` fire) triggers no retry — this ticket only reacts
  to an actual `connectionLost('deviceDisconnected')` transition, per the
  ticket's own explicit out-of-scope note.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
- No new `DESIGN.md` token: the new "Reconnecting…" line reuses the existing
  `onSurfaceMuted`/`dataSm` treatment already used for
  `liveWorkout.status.waiting`.
