# Feature: Live Workout Screen

## Intent

A new "START WORKOUT" control on Home — enabled only while a heart-rate
monitor is connected — opens a minimal Live Workout screen that subscribes to
the connected device's real Heart Rate Measurement notifications and renders
the live BPM, with a status line that visibly flips to "signal lost" the
moment readings stop arriving instead of letting the number silently freeze.
No zones, trace graph, session stats, or persistence — this proves the raw
BPM pipeline works end to end; everything else is a follow-up ticket.

## Context

- **Problem statement:** There is no code path anywhere in the repo that
  reads Heart Rate Service (`0x180D`) / Heart Rate Measurement (`0x2A37`)
  characteristic data. `bleManager` (`src/ble/manager.ts`) has exactly one
  consumer today, `src/hooks/use-device-pairing.ts`, and it only ever calls
  `startDeviceScan`/`stopDeviceScan`/`connectToDevice`/`cancelDeviceConnection`/
  `onStateChange` — `discoverAllServicesAndCharacteristicsForDevice` and
  `monitorCharacteristicForDevice` are unused (confirmed by the prior spec's
  own Constraints: "`bleManager.monitorCharacteristicForDevice` ... [is] not
  called anywhere by this ticket"). Home (`src/app/(tabs)/index.tsx`) has no
  path to a workout screen at all — its only navigation is `goToDevice()` —
  and its `DeviceCard`/hero button are both hardcoded to `'disconnected'`
  copy by deliberate prior-spec constraint ("Home's `DeviceCard` and hero
  button are unaffected... propagating this ticket's real connection state
  to Home would need a shared state mechanism... this spec deliberately does
  not do that; wiring Home to it is a call for whoever picks up that
  follow-up"). This ticket is that follow-up, scoped narrowly to a new,
  separate control rather than to the existing hero CTA (see the UI decision
  below).
- **Current code:**
  - `src/ble/pairing-store.ts` / `src/ble/pairing-types.ts` — `usePairingStore`
    is a module-level Zustand singleton holding `connection: ConnectionState`
    (`{ kind: 'disconnected' | 'connecting' | 'connected' | 'connectionFailed', ... }`)
    and `devices: DiscoveredDevice[]`. It survives a tab blur (per its own
    spec's Constraints: "`<Tabs>`'s default `unmountOnBlur: false`" means
    `use-device-pairing.ts`'s hook, and therefore the store's live state,
    stays mounted for the app session once the DEVICE tab has been visited
    once). This is what lets Live Workout read the connected device with no
    navigation param.
  - **No store transition exists for "a connected device disconnected."**
    `pairing-store.ts`'s only connection-mutating actions are
    `connectRequested`/`connectSucceeded`/`connectFailed`/`connectCancelled`;
    none of them fire once `connection.kind === 'connected'`, and the prior
    spec's Constraints explicitly scope out "mid-session drop recovery once
    `connection.kind === 'connected'`" as future, already-queued work. This
    is exactly why the ticket's "simulate dropout" trigger calls
    `bleManager.cancelDeviceConnection(deviceId)` **directly** rather than
    through any store action: nothing currently reacts to it, so the only
    ticket-observable effect of a disconnect (real or simulated) is the HR
    notification stream going quiet — which this screen's own staleness
    timer is what has to detect. This spec does not add a
    "connected → disconnected" store transition; that remains the queued
    follow-up the ticket references.
  - `node_modules/react-native-ble-plx@3.5.1`'s installed (Flow-typed)
    source — read directly, no bundled `.d.ts`, per `AGENTS.md`:
    - `Characteristic.value: ?Base64` (`src/Characteristic.js`) — a base64
      string, or `null`/`undefined` if the characteristic hasn't produced a
      value yet.
    - `monitorCharacteristicForDevice(deviceIdentifier, serviceUUID,
characteristicUUID, listener, transactionId?, subscriptionType?):
Subscription` (`src/BleManager.js`) — the docstring's own example
      calls it with short-form UUIDs (`'180F'`, `'2A19'`), confirming
      4-character service/characteristic UUIDs are valid input directly (the
      library's exported `fullUUID()` helper — unused internally by
      `BleManager.js` itself — exists for callers who need to _compare_
      discovered UUIDs, not for constructing call arguments).
    - `discoverAllServicesAndCharacteristicsForDevice(deviceIdentifier,
transactionId?): Promise<Device>` — must resolve before
      `monitorCharacteristicForDevice` can find the service/characteristic;
      there is no existing call site in this repo, so this ticket's hook is
      the first.
    - `onDeviceDisconnected` exists but is **not used** by this spec — see
      Style & Conventions for why staleness is detected purely from elapsed
      time since the last valid notification, not from a disconnect event.
    - No base64-decoding utility ships with the library or with any other
      installed dependency (`grep`-confirmed: no `base64-js`, no `buffer`
      package in `node_modules`, and `global.atob`/`Buffer` are not
      polyfilled anywhere in this RN 0.86.2 / Hermes setup). This spec adds
      one small, pure, dependency-free base64 decoder rather than adding a
      new package for four bytes of parsing.
  - `DESIGN.md` already names several tokens for this exact surface,
    confirming this screen's visual language rather than inventing it:
    `readout-bpm` (`display-xl`, `primary`, centered BPM), `live-dot` (the
    only other ambient animation besides the BPM ring — **not** used here,
    see Constraints), `chip-device` ("device pill on Live"), `status-connected`
    / `status-disconnected` (a `data-sm` word + implied dot, `success`/
    `danger`), `button-hero` ("full-width START WORKOUT on Home" — see the
    UI decision below for why this ticket does not reuse this exact
    component), and the "Live session title" row in the `title-md` table.
  - `src/app/_layout.tsx` — a bare `<Stack>` with a single declared
    `<Stack.Screen name="(tabs)" />`. Any new file under `src/app/` is
    auto-routed by `expo-router`'s file-based routing even without a
    matching `<Stack.Screen>` entry; one is added here purely to set
    `headerShown: false` (matching `(tabs)`'s own option) so Live Workout
    gets the app's custom screen-skeleton header treatment instead of a
    native header bar.
- **User impact:** With a monitor connected, Home shows an enabled START
  WORKOUT control that opens a screen showing the live BPM as it arrives, and
  makes a dropped signal (real or, in dev builds, simulated) visually obvious
  instead of an indistinguishable frozen number. Without a monitor connected,
  the control is visibly present but inert, with a one-line hint.
- **Dependencies:** No new npm package. Builds on `usePairingStore`
  (`ble-device-scanning`), `bleManager` (`ble-runtime-setup`), and
  `expo-router`'s `Stack`/`useRouter` (already in use). Depends on a device
  already being connected via the existing DEVICE tab flow — this ticket
  adds no pairing UI of its own.

### UI decision: a new, separate Start Workout control, not a reused hero CTA

`DESIGN.md`'s `button-hero` token describes a single Home button whose label
changes with connection state ("START WORKOUT when connected, CONNECT A
MONITOR when not"), which reads like it could double as this ticket's entry
point. It is **not** reused here, per explicit confirmation: the ticket's
literal behavior — enabled-only-when-connected, **disabled with a hint**
otherwise, navigating only to Live Workout — is a third behavior distinct
from both today's code (hero CTA always active, always → `/device`) and
`button-hero`'s own note (implies the disconnected label stays actionable
too). Reconciling that would mean changing the existing hero CTA's tested
behavior (`src/app/(tabs)/__tests__/index.test.tsx`'s "renders the hero CTA
and navigates to /device on press" case) on a screen `CLAUDE.md` says to
change additively, and would supersede the prior spec's explicit "Home's
`DeviceCard` and hero button are unaffected" constraint — too large a
reinterpretation for this ticket to make unilaterally. Instead:

- The existing `DeviceCard` and hero CTA (`home-hero-cta`) are **untouched** —
  still always "CONNECT A MONITOR" → `/device`, exactly as today.
- A new, separate, smaller control is added below them, styled from
  `DESIGN.md`'s existing `button-primary` / `button-primary-disabled` tokens
  (60px, `action-md`, `xl` radius — not the 66px `button-hero` shape, so the
  screen never shows two full-width hero-styled buttons at once), implementing
  the ticket's literal enabled/disabled-with-hint/navigate-to-Live-Workout
  behavior exactly.
- This matches the ticket's own "provisional placement — final location TBD,
  may move to DEVICE later" framing: a standalone element is what can
  actually be relocated later without touching the hero CTA at all.

## Data Model

```ts
// src/ble/heart-rate.ts — framework-free, no BLE/Zustand/React import except
// `Characteristic['value']`'s type, used the same way pairing-types.ts uses
// `BleState` as a type-only import.

export const HEART_RATE_SERVICE_UUID = '180D';
export const HEART_RATE_MEASUREMENT_UUID = '2A37';

/** How long since the last valid HR notification before the screen reports
 * "signal lost." Not specified by the ticket brief — this spec's own
 * default, chosen from typical HR monitor broadcast behavior: chest-strap
 * monitors implementing the standard BLE HRM profile notify at ~1 Hz;
 * optical wrist units are commonly slower and less regular (up to ~1 per
 * 1-2s). 3000ms absorbs one or two missed/delayed notifications (radio
 * jitter, a connection-interval hiccup) without a false "signal lost" flash,
 * while still surfacing a genuine drop well within a few seconds of it
 * happening — the same "spec picks a working default, flagged as a
 * decision, trivially retunable" treatment `ble-device-scanning` gave
 * `SCAN_TIMEOUT_MS`/`CONNECT_TIMEOUT_MS`. */
export const HR_STALE_THRESHOLD_MS = 3_000;

/** How often the hook polls elapsed-time-since-last-reading to decide
 * staleness. Cheap, and frequent enough that "signal lost" appears within
 * half a second of crossing the threshold. */
export const HR_STALE_CHECK_INTERVAL_MS = 500;
```

`ConnectionState`/`DiscoveredDevice` are unchanged (`src/ble/pairing-types.ts`)
— this spec adds no new fields to either; it only reads `connection.kind`,
`connection.deviceId`, and `devices` from the existing store shape.

**Invariant:** `parseHeartRateMeasurement` and the base64 decoder it uses are
pure functions of their input byte string — no BLE, no store, no timers —
matching `pairing-types.ts`'s existing "framework-free, pure derivations"
layer.

## Interfaces / API

### `src/ble/heart-rate.ts` (new — types, constants, pure parsing)

```ts
export function parseHeartRateMeasurement(value: string | null | undefined): number | null;
```

Per the Bluetooth GATT Heart Rate Measurement characteristic (`0x2A37`)
format: byte 0 is a Flags field; bit 0 of Flags is the Heart Rate Value
Format bit — `0` means the BPM value is a single `UInt8` at byte offset 1,
`1` means it's a little-endian `UInt16` across byte offsets 1–2. This
function base64-decodes `value` to a byte array, reads bit 0 of byte 0, and
returns the `UInt8` or `UInt16` BPM value accordingly. Returns `null` for
`null`/`undefined` input, or if the decoded byte array is too short to
contain the BPM field its own flags byte claims (offset 1 for the `UInt8`
case, offsets 1–2 for the `UInt16` case) — never throws on malformed input.

The remaining Flags bits (Sensor Contact Status: bits 1–2, Energy Expended
Status present: bit 3, RR-Interval present: bit 4) are **not** parsed. They
describe fields that, per the GATT spec, always follow the BPM field in byte
order — they affect where _those_ fields start, never where the BPM field
itself starts (always byte offset 1) or how wide it is (governed solely by
bit 0). Since this ticket reads only the BPM, correct parsing needs bit 0
alone; documented here so a future field (RR-interval, energy expended) isn't
assumed to need the same offset-1 read.

A private, unexported base64-to-byte-array decoder backs this — standard
base64 alphabet (`A–Z`, `a–z`, `0–9`, `+`, `/`), `=` padding, 4 input
characters → 3 output bytes (2 output bytes if the group ends in one `=`, 1
if it ends in `==`). No dependency added for this — see Context.

### `src/hooks/use-live-heart-rate.ts` (new — the only I/O layer this ticket adds)

```ts
export type LiveHeartRateStatus = 'awaitingFirstReading' | 'live' | 'stale';

export function useLiveHeartRate(deviceId: string | null): {
  bpm: number | null; // last known BPM; null until the first reading ever arrives
  status: LiveHeartRateStatus;
};
```

Always called unconditionally (rules of hooks) — `deviceId` is the gate,
mirroring `useDevicePairing(permissionGranted)`'s own gate-argument shape.
When `deviceId` is `null`, the hook does nothing and returns
`{ bpm: null, status: 'awaitingFirstReading' }` for the life of that render.

When `deviceId` is non-null, an effect (dependency `[deviceId]`):

1. Calls `bleManager.discoverAllServicesAndCharacteristicsForDevice(deviceId)`.
2. On resolution, calls
   `bleManager.monitorCharacteristicForDevice(deviceId, HEART_RATE_SERVICE_UUID, HEART_RATE_MEASUREMENT_UUID, listener)`
   and keeps the returned `Subscription` in a ref for cleanup.
3. `listener(error, characteristic)`: if `error` is non-null, the callback is
   a no-op — swallowed, the same "expected native race, not a bug to
   surface" treatment `use-device-pairing.ts` gives
   `BleErrorCode.BluetoothPoweredOff`. Otherwise calls
   `parseHeartRateMeasurement(characteristic?.value)`; if the result is a
   number, sets `bpm` to it, records `lastReadingAt = Date.now()` in a ref,
   and clears the stale flag.
4. On the `discoverAllServicesAndCharacteristicsForDevice` promise rejecting
   (e.g. the device dropped before discovery finished), the rejection is
   swallowed the same way — the screen simply stays at
   `'awaitingFirstReading'` with no HR pipeline established, an accepted
   minimal edge case (see Constraints).
5. A `setInterval(HR_STALE_CHECK_INTERVAL_MS)` compares `Date.now()` against
   `lastReadingAt`; once a reading has ever arrived and the gap exceeds
   `HR_STALE_THRESHOLD_MS`, sets the stale flag (idempotent past that point).
6. Cleanup (on `deviceId` changing or unmount): clears the interval and calls
   `subscription?.remove()` best-effort if the monitor call ever resolved.

`status` derivation: `bpm === null` → `'awaitingFirstReading'`; else the
stale flag → `'stale'`; else → `'live'`. `bpm` is never reset to `null` once
set — a stale reading stays visibly frozen at its last known value, which is
what makes the status line (not a vanishing number) the signal of a drop.

This hook does **not** read `usePairingStore` at all — deliberately. See
Style & Conventions for why staleness is derived purely from the HR
notification stream's own timing, independent of `connection.kind` (which,
per Context, never transitions away from `'connected'` on a real mid-session
drop today).

### `src/app/live-workout.tsx` (new screen)

Reads `usePairingStore((state) => state.connection)` and
`usePairingStore((state) => state.devices)` directly — no navigation param,
per the ticket. Derives:

```ts
const deviceId = connection.kind === 'connected' ? connection.deviceId : null;
const device = devices.find((candidate) => candidate.id === deviceId) ?? null;
```

`const { bpm, status } = useLiveHeartRate(deviceId);`

- **Guard branch** (`deviceId === null` — connection is not `'connected'`,
  an edge case since Home only enables navigation here when it is, but
  handled defensively rather than assumed): renders a short
  `t('liveWorkout.noDevice.title')` / `t('liveWorkout.noDevice.subtitle')`
  message and a single back action (same handler as Discard, below) — no BPM
  readout, no Save, no dev trigger, since there is no live pipeline to act on.
- **Connected branch:**
  - Title row: `t('liveWorkout.title')` (`titleMd`, "Live session title" per
    `DESIGN.md`'s typography table) plus a `chip-device`-styled pill showing
    `device ? selectDeviceDisplayName(device, t('pairing.deviceRow.unknownDevice')).text : t('pairing.deviceRow.unknownDevice')`
    — reusing the existing fallback string rather than adding a duplicate.
  - Status line: `status === 'live'` → `status-connected` token (`success`,
    `t('liveWorkout.status.live')`); `status === 'stale'` → `status-disconnected`
    token (`danger`, `t('liveWorkout.status.signalLost')`);
    `status === 'awaitingFirstReading'` → neutral `onSurfaceMuted` /
    `dataSm`, `t('liveWorkout.status.waiting')` (not one of `DESIGN.md`'s two
    named status tokens — a third, pre-first-reading state that isn't either
    "connected" or "disconnected" in the sense those tokens describe).
  - BPM readout: `readout-bpm` token (`displayXl`, `primary`, centered),
    rendering `bpm ?? '--'`, with a `dataSm` `t('liveWorkout.bpmUnit')` ("BPM")
    unit beneath it. The number is **not** dimmed or re-colored when stale —
    the status line alone carries "this is frozen," keeping this screen to
    exactly the two live elements the ticket asks for (number + status),
    with no new visual treatment invented on top.
  - Action row: `Discard` (ghost button, `t('liveWorkout.discard')`,
    `onPress={() => router.back()}` — does **not** touch `bleManager` or the
    store, so the connection persists exactly as it was) and `Save`
    (`button-primary`, `t('liveWorkout.save')`, `onPress={() => {}}` — an
    intentional, tappable no-op; a code comment notes workout persistence is
    a separate future ticket, not an oversight).
  - `__DEV__`-only: a small ghost-styled trigger,
    `t('liveWorkout.devSimulateDropout')`, rendered only when the global
    `__DEV__` is true, `onPress={() => bleManager.cancelDeviceConnection(deviceId).catch(() => {})}`
    — calls the manager directly, exactly as the ticket specifies, so the
    only thing that reacts is this screen's own staleness timer once
    notifications stop arriving (see Style & Conventions).

## Files Created

| File                                              | Purpose                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ble/heart-rate.ts`                           | UUID/threshold constants, `parseHeartRateMeasurement`, and the private base64 decoder. Zero BLE/Zustand/React import.                                                                                                        |
| `src/ble/__tests__/heart-rate.test.ts`            | Hand-built base64 fixtures for the `UInt8`/`UInt16` flag-bit cases, short/malformed/null input, and byte-boundary edges.                                                                                                     |
| `src/hooks/use-live-heart-rate.ts`                | The I/O layer: discovers + monitors the HR characteristic for a given device id, tracks last-reading time, derives `status`.                                                                                                 |
| `src/hooks/__tests__/use-live-heart-rate.test.ts` | Fake-timer-driven tests: null-`deviceId` no-op, discover→monitor call sequence, reading → `'live'`, elapsed time → `'stale'`, a later reading un-staling, cleanup on unmount/deviceId change, discovery-rejection swallowed. |
| `src/app/live-workout.tsx`                        | The new screen: guard branch, live BPM/status/device-chip render, Discard/Save/dev-trigger actions.                                                                                                                          |
| `src/app/__tests__/live-workout.test.tsx`         | Render tests for both branches, the `'live'`/`'stale'` status flip, Discard not disconnecting, Save's no-op, and the `__DEV__` trigger's presence/absence and its `cancelDeviceConnection` call.                             |

## Files Modified

| File                                      | Change                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/_layout.tsx`                     | Add `<Stack.Screen name="live-workout" options={{ headerShown: false }} />` alongside the existing `(tabs)` entry. Purely additive — no other line changes.                                                                                                                                                              |
| `src/app/(tabs)/index.tsx`                | Add a new `usePairingStore((state) => state.connection)` read and a new, separate Start Workout control (see UI decision) below the existing `DeviceCard`/hero button, which are otherwise untouched.                                                                                                                    |
| `src/app/(tabs)/__tests__/index.test.tsx` | Add cases: disconnected → control disabled + hint visible + press is a no-op; connected → control enabled, no hint, press navigates to `/live-workout`. Add a `usePairingStore.getState().reset()` in `beforeEach` (the store is a singleton, now consumed here for the first time). Existing three cases are untouched. |
| `src/i18n/locales/en.json`                | Add `home.startWorkoutCta`/`home.startWorkoutHint` and a new `liveWorkout` namespace (see below). Existing keys untouched.                                                                                                                                                                                               |

`en.json` additions:

```json
{
  "home": {
    "startWorkoutCta": "START WORKOUT",
    "startWorkoutHint": "Connect a device first"
  },
  "liveWorkout": {
    "title": "LIVE WORKOUT",
    "bpmUnit": "BPM",
    "status": {
      "live": "LIVE",
      "signalLost": "SIGNAL LOST",
      "waiting": "WAITING FOR SIGNAL…"
    },
    "discard": "DISCARD",
    "save": "SAVE",
    "devSimulateDropout": "SIMULATE DROPOUT (DEV)",
    "noDevice": {
      "title": "No monitor connected",
      "subtitle": "Go back and connect a heart-rate monitor to start a workout."
    }
  }
}
```

## Implementation Steps

1. Re-verify the `react-native-ble-plx@3.5.1` API surface used below
   (`discoverAllServicesAndCharacteristicsForDevice`,
   `monitorCharacteristicForDevice`, `Characteristic.value`) against
   `node_modules/react-native-ble-plx/src/*.js` — already done for this
   spec; re-confirm at implementation time per `AGENTS.md`.
2. Create `src/ble/heart-rate.ts` and its test — no dependency on anything
   else created in this ticket, so it's fully unit-testable first.
3. Create `src/hooks/use-live-heart-rate.ts` and its test, using
   `jest.useFakeTimers()` and spying on `bleManager`'s
   `discoverAllServicesAndCharacteristicsForDevice`/
   `monitorCharacteristicForDevice` (already stubbed in
   `__mocks__/react-native-ble-plx.ts` — confirm no additional mock changes
   are needed there).
4. Add the `home.*`/`liveWorkout.*` keys to `src/i18n/locales/en.json`.
5. Modify `src/app/(tabs)/index.tsx` to add the Start Workout control per
   Interfaces/API; extend its test file with the two new cases and the
   `beforeEach` store reset.
6. Create `src/app/live-workout.tsx` and its test.
7. Add the `<Stack.Screen name="live-workout" .../>` entry to
   `src/app/_layout.tsx`.
8. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **Staleness is derived purely from elapsed time since the last valid HR
  notification — never from `connection.kind` or a disconnect event.** This
  is not a simplification of convenience: per Context, nothing in
  `pairing-store.ts` transitions `connection` away from `'connected'` on a
  real mid-session drop today, so watching `connection.kind` would never
  detect a real drop at all, and watching `bleManager.onDeviceDisconnected`
  would detect a real drop but not the simulated one the same way (the
  ticket's own framing — "for testing the staleness path" — implies the dev
  trigger should exercise the _same_ detection path a real drop does, not a
  separate instant-disconnect-event branch). One mechanism covers both.
- **`useLiveHeartRate` never imports `usePairingStore`.** It takes a plain
  `deviceId: string | null` and is testable with a mocked `bleManager` alone
  — mirroring `pairing-store.ts`'s own "BLE side effects stay out of the
  store" separation, applied here as "device-selection stays out of the HR
  hook."
- **No dependency added for base64 decoding.** Confirmed absent from
  `node_modules` (no `base64-js`, no `buffer`) and not polyfilled by this RN/
  Hermes setup — a ~20-line pure decoder is proportionate to "read 2-3
  bytes," matching this repo's existing bias toward framework-free pure
  functions (`pairing-types.ts`) over reaching for a package.
- **The existing hero CTA and `DeviceCard` are untouched** — see the UI
  decision above. This preserves the prior spec's explicit constraint
  instead of silently superseding it.
- All new copy renders via `t('home.…')` / `t('liveWorkout.…')`, matching
  `CLAUDE.md`'s i18n section — no inline JSX string literals.
- `live-workout.tsx` is a top-level `src/app/` route (outside `(tabs)`), so
  `expo-router`'s `<Stack>` naturally pushes/pops it — unlike the DEVICE tab,
  it genuinely unmounts on Discard/back, which is what stops the HR
  subscription without needing `useIsFocused`/`AppState` wiring the way
  `use-device-pairing.ts` needs for a tab that never unmounts on blur.
- New tests colocated under each module's own `__tests__/`, matching every
  existing precedent in this repo.

## Acceptance Criteria

- [ ] `parseHeartRateMeasurement` returns the correct BPM for a hand-built
      `UInt8`-flagged base64 value and for a hand-built little-endian
      `UInt16`-flagged one.
- [ ] `parseHeartRateMeasurement` returns `null` (never throws) for `null`,
      `undefined`, empty, and truncated-below-the-claimed-width input.
- [ ] `src/ble/heart-rate.ts` has no import of `bleManager`, `usePairingStore`,
      or any `react-native-ble-plx` value beyond a type-only import if any.
- [ ] `useLiveHeartRate(null)` never calls
      `discoverAllServicesAndCharacteristicsForDevice` and returns
      `{ bpm: null, status: 'awaitingFirstReading' }`.
- [ ] `useLiveHeartRate(deviceId)` calls
      `discoverAllServicesAndCharacteristicsForDevice(deviceId)` then
      `monitorCharacteristicForDevice(deviceId, '180D', '2A37', expect.any(Function))`.
- [ ] A monitor callback carrying a parseable value moves `status` to
      `'live'` with the correct `bpm`.
- [ ] With fake timers, no further callback for `HR_STALE_THRESHOLD_MS` moves
      `status` to `'stale'` while `bpm` stays at its last value (never
      reset to `null`).
- [ ] A later valid callback after going stale moves `status` back to
      `'live'`.
- [ ] Unmounting (or a `deviceId` change) calls the monitor subscription's
      `remove()`.
- [ ] Home's new Start Workout control is disabled with
      `t('home.startWorkoutHint')` visible when `connection.kind !==
    'connected'`, and pressing it does not navigate.
- [ ] Home's new Start Workout control is enabled with no hint when
      `connection.kind === 'connected'`, and pressing it navigates to
      `/live-workout`.
- [ ] Home's existing hero CTA and `DeviceCard` tests
      (`src/app/(tabs)/__tests__/index.test.tsx`'s three existing cases)
      pass unmodified.
- [ ] Live Workout's guard branch renders when `connection.kind !==
    'connected'` at mount, with no BPM readout, Save button, or dev
      trigger.
- [ ] Live Workout's Discard button calls `router.back()` and does **not**
      call `bleManager.cancelDeviceConnection` or any pairing-store action.
- [ ] Live Workout's Save button is present, tappable, and calling it throws
      nothing and triggers no navigation or store change.
- [ ] The `__DEV__`-only trigger renders when `__DEV__` is `true` and is
      absent when `__DEV__` is `false`; pressing it calls
      `bleManager.cancelDeviceConnection(deviceId)`.
- [ ] No new string is inline in JSX — all render via `t(...)`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: live BPM display plus a staleness indicator only. No zones, no
  live trace graph, no avg/max/elapsed-time stats, no workout persistence
  (Save is an intentional no-op), no auto-reconnect, and no new
  "connected → disconnected" transition in `pairing-store.ts` — all
  deliberately deferred, per the ticket's own out-of-scope list and the
  prior spec's already-queued "mid-session drop recovery" item.
- **No AppState/background handling for the HR subscription.** Unlike
  `use-device-pairing.ts`'s scan effect, this hook does not stop monitoring
  when the app backgrounds. This is not an oversight: `app.json`'s
  `["react-native-ble-plx", { "isBackgroundEnabled": false, ... }]` plugin
  entry (`ble-runtime-setup`) already prevents the native BLE stack from
  keeping the connection meaningfully alive in the background at the OS
  level; on returning to foreground, any gap simply reads as "stale" via the
  existing elapsed-time mechanism. Adding a redundant JS-level background
  handler was judged out of proportion to "keep this minimal."
- **The guard branch (no connected device) is a defensive edge case, not a
  designed flow.** Home only enables navigation to Live Workout when
  `connection.kind === 'connected'`, so this branch is reachable only via an
  unusual timing race or a future/manual deep link — it is not itself a
  polished empty state.
- **Discovery-rejection has no retry.** If
  `discoverAllServicesAndCharacteristicsForDevice` rejects (e.g. the device
  dropped between connect and this screen mounting), the screen stays at
  `'awaitingFirstReading'` indefinitely with no further attempt — acceptable
  for this minimal ticket; a retry/backoff strategy is future work.
- **The existing hero CTA and `DeviceCard` are unaffected** — reaffirming,
  not superseding, the prior spec's own constraint. See the UI decision
  above for the reasoning and the explicit alternative considered and
  rejected.
- **`HR_STALE_THRESHOLD_MS` (3000ms) and `HR_STALE_CHECK_INTERVAL_MS`
  (500ms) are this spec's own defaults**, not values given by the ticket
  brief — trivially retunable single constants, per Data Model.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
