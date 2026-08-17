# Feature: Persist Last-Connected Device

## Intent

The Device screen remembers the last heart-rate monitor it successfully
connected to and, on the next mount, tries that device directly — once,
silently — before falling back to today's scan-and-tap flow, so a returning
user doesn't have to scan and tap again for the monitor they already paired.

## Context

- **Problem statement:** `usePairingStore` (`src/ble/pairing-store.ts`) and
  `useDevicePairing` (`src/hooks/use-device-pairing.ts`) hold connection state
  only in memory for the life of one mount; `reset()` is called on every
  mount (`src/hooks/use-device-pairing.ts:64-67`) and wipes it. Nothing
  survives to the next launch, so every session — even one reconnecting to
  the exact monitor just used — starts from a fresh scan and a manual tap.
  There is no persistence mechanism anywhere in this app today: no
  `AsyncStorage`, `SecureStore`, or `SQLite` import exists in `src/`, and
  `docs/specs/ble-pairing-permissions/SPEC.md:218` names this gap explicitly
  ("there is no storage dependency in this app yet"). This ticket introduces
  the app's first local-persistence dependency,
  `@react-native-async-storage/async-storage` (confirmed with the requester:
  the unencrypted, standard Expo key-value store — the right fit for a
  non-sensitive device id/name pair; `expo-secure-store`'s encryption and
  `expo-sqlite`'s relational engine are both a heavier fit than this needs).
  `src/app/(tabs)/device.tsx:97-105`'s "PREVIOUSLY PAIRED" section is already
  reserved in the UI but currently only ever renders one of two static empty
  strings — there is no code path that ever fills it.
- **Current code:**
  - `src/hooks/use-device-pairing.ts:158-191` — `connect(deviceId)`. Calls
    `bleManager.connectToDevice(deviceId)`, and on success calls
    `usePairingStore.getState().connectSucceeded(deviceId)`. The resolved
    native `Device` (which carries `.name`/`.localName`) is currently
    discarded (`.then(() => { ... })` takes no parameter). This is the one
    and only place a connection ever succeeds, whether from a user's tap on a
    scanned row or (after this ticket) from the new auto-reconnect attempt —
    it is the single natural place to persist "this device is now the
    remembered one."
  - `src/ble/pairing-types.ts:182-195` — `canScan(snapshot, context)`, a pure
    function ANDing `permissionGranted`, `isFocused`, `isAppActive`, adapter
    `poweredOn`, and `connection.kind` not being `connecting`/`connected`/
    `connectionLost`. `src/hooks/use-device-pairing.ts:87` is its only call
    site, feeding the scan-start effect's `eligible` gate
    (`src/hooks/use-device-pairing.ts:92-152`).
  - `src/hooks/use-device-pairing.ts:64-67` — the `reset()` effect, `[]`
    deps, runs synchronously in the first commit after mount.
    `src/ble/pairing-store.ts:119-125` — `reset()` sets `adapter: 'unknown'`,
    `scan: { kind: 'idle' }`, `devices: []`, `connection: { kind:
'disconnected' }`. None of this ticket's new persisted data lives in
    `usePairingStore` (see Data Model), so `reset()` cannot clobber it
    regardless of ordering — the only ordering hazard would be a synchronous
    effect calling `connectRequested` _before_ `reset()` runs in the same
    commit, and there is no such effect: the new auto-reconnect attempt is
    gated on an `AsyncStorage.getItem` read (see Interfaces/API), which is
    always at least one microtask later than every synchronous effect in the
    initial commit, `reset()` included.
  - `src/hooks/use-device-pairing.ts:70-76` — the adapter subscription
    (`bleManager.onStateChange(listener, true)`), mount-to-unmount, feeds the
    `adapter` field this ticket's new effect also depends on to decide when
    it's safe to attempt a connect.
  - `src/app/(tabs)/device.tsx:97-105` — the static "PREVIOUSLY PAIRED"
    section: a header plus one of `previouslyPaired.emptyGranted` /
    `previouslyPaired.emptyNoAccess`, chosen only by `status === 'granted'`.
    This is where the saved device (and the "forget" action) render.
  - `src/components/device-row.tsx` — the closest existing row precedent
    (name + trailing status/action), but its prop shape (`rssi: number`,
    `status: 'available' | 'connecting' | 'connected' | 'failed'`) is
    scan-specific and required, not optional — reusing it for a
    not-currently-scanning saved device would mean widening a working,
    tested component's contract for a shape it wasn't designed for. This
    ticket adds a new, narrower sibling component instead (see Interfaces/
    API), per `CLAUDE.md`'s "additive diffs on working screens."
  - **Android bonding, confirmed:** `node_modules/react-native-ble-plx`
    exposes no bond/unbond API (grepped `src/*.js` for `bond` — no matches),
    and Android does not let a normal (non-privileged) app remove an
    OS-level Bluetooth bond programmatically. "Forget" in this ticket can
    only mean "this app stops remembering the device for auto-reconnect" —
    it does not unpair at the OS level. UI copy is written to say exactly
    that (see Data Model / Interfaces/API), not "unpair" or "forget this
    device from your phone."
- **User impact:** After a successful connection, the Device screen's
  "PREVIOUSLY PAIRED" section shows that device's name with a "FORGET"
  action instead of the empty-state copy. On the next visit to the screen
  (including a fresh app launch), if that device is still reachable, the
  screen goes straight to "CONNECTING" / "CONNECTED" (the bar's copy doesn't
  name the device) without the user scanning or tapping anything; if it
  isn't, the screen falls back to the normal scan list exactly as it does
  today, with no visible error. Tapping "FORGET" clears the remembered
  device; the next visit reverts to scan-and-tap only, same as before this
  ticket existed.
- **Dependencies:** New runtime dependency
  `@react-native-async-storage/async-storage` (install via
  `npx expo install @react-native-async-storage/async-storage` so Expo pins
  the SDK 57-compatible version). It's a native module — the Android dev
  client needs a rebuild (`pnpm android`) after adding it, per `CLAUDE.md`'s
  existing note that native BLE modules already require a dev-client build,
  not Expo Go. No other new package. Builds on `usePairingStore`/
  `pairing-types.ts` (`ble-device-scanning`), `bleManager`
  (`ble-runtime-setup`), and the connect flow
  (`ble-device-scanning`/`ble-connection-loss-detection`).

## Data Model

```ts
// src/ble/saved-device.ts

export type SavedDevice = {
  id: string;
  // The resolved display name at the moment this device was last connected,
  // or null if neither the native Device nor its localName had one at that
  // moment. Never a translated placeholder string — "Unknown device" is UI
  // copy, not data, and copy must not get baked into a persisted value that
  // outlives the locale it was written under. Screens re-derive the
  // fallback label at render time (mirrors `selectDeviceDisplayName`).
  name: string | null;
};
```

Persisted as a single JSON-serialized value under one `AsyncStorage` key,
`'ble.savedDevice'`. There is exactly one saved device at a time — connecting
to a new device overwrites whatever was saved before; there is no history or
list. Storage is fully decoupled from `usePairingStore`: it never lives in
that Zustand state and is therefore untouched by `reset()` (see Context).
All reads/writes are best-effort — any failure (storage unavailable,
corrupt/legacy JSON) is caught and treated as "nothing saved," never thrown,
per the ticket's "a stale saved device must never block or confuse the
normal path."

## Interfaces / API

### `src/ble/saved-device.ts` (new)

```ts
export async function loadSavedDevice(): Promise<SavedDevice | null>;
export async function saveDevice(device: SavedDevice): Promise<void>;
export async function clearSavedDevice(): Promise<void>;
```

- `loadSavedDevice`: reads the key, `JSON.parse`s it, and returns `null` for
  a missing key, a parse failure, a non-object value, or an object missing a
  string `id`. `name` is coerced to `null` unless it's a string. Never
  throws.
- `saveDevice`/`clearSavedDevice`: `setItem`/`removeItem` the key; any thrown
  error is caught and swallowed (a failed write just means no auto-reconnect
  next launch — not a user-facing failure).
- No BLE import, no Zustand import, no React import — a pure I/O module,
  mirroring `pairing-types.ts`'s "framework-free" boundary but for storage
  instead of BLE types.

### `src/ble/pairing-types.ts` (modified)

`canScan`'s `context` gains one new required field:

```ts
export function canScan(
  snapshot: { adapter: AdapterPowerState; connection: ConnectionState },
  context: {
    permissionGranted: boolean;
    isFocused: boolean;
    isAppActive: boolean;
    autoReconnectPending: boolean; // new
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
```

`autoReconnectPending` is `true` from mount until the hook has either (a)
confirmed there is no saved device to try, or (b) let one attempt against a
saved device fully settle (connected or failed) — see the hook changes
below. While `true`, `canScan` is `false` regardless of every other
condition, so the scan-start effect cannot start a scan while the
auto-reconnect attempt is still being decided or is in flight. This directly
answers the ticket's race concern: scanning and the auto-reconnect attempt
are mutually exclusive by construction, not by ordering luck.

`deriveScanBarState` and `ScanBarState`: **no change.** The auto-reconnect
attempt drives `connection.kind` to `'connecting'`/`'connected'`/
`'connectionFailed'` through the exact same `connect()` path a manual tap
uses, so the existing `connecting`/`connected` bar rows
(`src/ble/pairing-types.ts:146-154`) already render it correctly with no
caveat needed — the bar's copy for both (`"CONNECTING"` / `"CONNECTED"`)
doesn't name the device at all, so there's nothing for the auto-reconnect
attempt's empty `devices` list to fail to resolve.

### `src/hooks/use-device-pairing.ts` (modified — additive)

New local state:

```ts
const [savedDevice, setSavedDevice] = useState<SavedDevice | null | undefined>(undefined);
// undefined = not yet loaded from storage; null = loaded, nothing saved;
// SavedDevice = loaded, and this is the remembered device.
const [autoReconnectPending, setAutoReconnectPending] = useState(true);
const autoReconnectDeviceIdRef = useRef<string | null>(null);
```

Three new effects, in addition to the existing ones:

```ts
// 1. Load the saved device once per mount. Declared after the reset()
// effect (src/hooks/use-device-pairing.ts:64-67) so reset() always applies
// first within the initial commit — though per Context, the async read
// guarantees this ordering regardless of declaration position.
useEffect(() => {
  let cancelled = false;
  loadSavedDevice().then((device) => {
    if (!cancelled) setSavedDevice(device);
  });
  return () => {
    cancelled = true;
  };
}, []);

// 2. Fire the single auto-reconnect attempt once every gating condition is
// met: the saved-device read has resolved, there is one to try, no attempt
// has been made yet this mount, the user has granted BLE permission, and
// the adapter has reached 'poweredOn' (never against an unknown/off
// adapter — this answers the ticket's third open question directly).
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
}, [savedDevice, permissionGranted, adapter]);

// 3. Once the attempt this effect fired has left 'connecting' (succeeded or
// failed — connect()'s own CONNECT_TIMEOUT_MS and error handling apply
// unchanged, so this is a single attempt with the same timeout ceiling any
// manual connect already has, not a new timeout), unblock scanning.
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
```

`eligible` (`src/hooks/use-device-pairing.ts:87`) gains the new argument:

```ts
const eligible = canScan(
  { adapter, connection },
  { permissionGranted, isFocused, isAppActive, autoReconnectPending },
);
```

`connect(deviceId)` (`src/hooks/use-device-pairing.ts:158-191`) gains
persistence on success — the only change to its body, in the existing
success branch:

```ts
bleManager.connectToDevice(deviceId).then(
  (device) => {
    // was: () => { ... } — the resolved Device is now used
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
    /* unchanged */
  },
);
```

This is the one code path both a manual tap and the new auto-reconnect
attempt share, so persistence-on-success needs no separate handling for
either caller.

New exported action:

```ts
function forgetDevice() {
  setSavedDevice(null);
  void clearSavedDevice();
}
```

Scoped exactly to clearing this app's own reference — it does not call
`bleManager`, does not touch `connection`, and does not attempt (and cannot
attempt) any OS-level unpairing. If the forgotten device happens to be
connected right now, that live connection is left running untouched; only
future auto-reconnect attempts are affected.

Return value gains two fields; every existing field is unchanged:

```ts
return {
  // ...unchanged...
  savedDevice: savedDevice ?? null, // collapses 'still loading' to 'none' for callers
  forgetDevice,
};
```

### `src/components/saved-device-row.tsx` (new)

```ts
export type SavedDeviceRowProps = {
  name: string;
  isNameFallback: boolean; // dims the name, mirrors DeviceRowProps
  onForget: () => void;
};

export function SavedDeviceRow(props: SavedDeviceRowProps): JSX.Element;
```

A row with the device name on the left and a "FORGET" text action
(`actionSm`, `danger` — the same color token `status-disconnected` already
uses in `DESIGN.md`) on the right, in a `surface`/`outline`/`rounded.md`
container matching `device-row.tsx`'s resting-elevation styling. No new
`DESIGN.md` token. A new component rather than widening `DeviceRow` — see
Context.

### `src/app/(tabs)/device.tsx` (modified — additive)

The "PREVIOUSLY PAIRED" section (`:97-105`) gains one new branch, gated the
same way the "NEARBY DEVICES" section already is:

```tsx
<View style={styles.section}>
  <ThemedText variant="labelCaps" color="onSurfaceFaint">
    {t('pairing.previouslyPaired.header')}
  </ThemedText>
  {status === 'granted' && savedDevice != null ? (
    <SavedDeviceRow
      name={savedDevice.name ?? t('pairing.deviceRow.unknownDevice')}
      isNameFallback={savedDevice.name == null}
      onForget={forgetDevice}
    />
  ) : (
    <ThemedText variant="bodyMd" color="onSurfaceMuted">
      {status === 'granted'
        ? t('pairing.previouslyPaired.emptyGranted')
        : t('pairing.previouslyPaired.emptyNoAccess')}
    </ThemedText>
  )}
</View>
```

`savedDevice` and `forgetDevice` are destructured from `useDevicePairing`
alongside the screen's existing destructured fields. No other part of
`device.tsx` changes.

### `src/i18n/locales/en.json` (modified)

One new key under the existing `pairing.previouslyPaired` namespace:

```json
"previouslyPaired": {
  "header": "PREVIOUSLY PAIRED",
  "emptyGranted": "No previously paired devices yet.",
  "emptyNoAccess": "Grant Bluetooth access to see previously paired devices.",
  "forgetAction": "FORGET"
}
```

No confirmation-dialog copy — "FORGET" is a single tap, no `Alert`, matching
every other action in this flow ("SCAN AGAIN", "RETRY", "TRY AGAIN" are all
undone by the next natural action, not confirmed).

### `__mocks__/@react-native-async-storage/async-storage.ts` (new)

```ts
export * from '@react-native-async-storage/async-storage/jest/async-storage-mock';
export { default } from '@react-native-async-storage/async-storage/jest/async-storage-mock';
```

Placed under `__mocks__/`, matching the existing pattern for
`react-native-ble-plx`/`expo-device`/`expo-localization` — picked up
automatically by Jest with no `jest.mock()` call needed in test files, the
same way the existing three are consumed today.

## Files Created

| File                                                     | Purpose                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/ble/saved-device.ts`                                | Storage module: `loadSavedDevice`/`saveDevice`/`clearSavedDevice`, wrapping `AsyncStorage`. |
| `src/ble/__tests__/saved-device.test.ts`                 | Unit tests for the module above.                                                            |
| `src/components/saved-device-row.tsx`                    | Presentational row for the saved device + its "FORGET" action.                              |
| `src/components/__tests__/saved-device-row.test.tsx`     | Tests for the component above.                                                              |
| `__mocks__/@react-native-async-storage/async-storage.ts` | Jest manual mock, re-exporting the package's official in-memory mock.                       |

## Files Modified

| File                                             | Change                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                   | Add `@react-native-async-storage/async-storage` (via `npx expo install`, so pnpm-lock.yaml picks up the SDK 57-pinned version).                                                                                                                                                                                                |
| `src/ble/pairing-types.ts`                       | Add `autoReconnectPending` to `canScan`'s `context` parameter and its boolean AND. No change to `deriveScanBarState`/`ScanBarState`.                                                                                                                                                                                           |
| `src/ble/__tests__/pairing-types.test.ts`        | Extend the shared `canScan` `context` fixture with `autoReconnectPending: false`; add a case asserting `false` when `autoReconnectPending: true` with every other condition satisfied.                                                                                                                                         |
| `src/hooks/use-device-pairing.ts`                | Add `savedDevice`/`autoReconnectPending` state, the three new effects, the `autoReconnectPending` argument to `canScan`, persistence in `connect()`'s success branch, `forgetDevice`, and the two new return fields — all per Interfaces/API. No existing exported member's behavior changes for a mount with no saved device. |
| `src/hooks/__tests__/use-device-pairing.test.ts` | Add a `saved device` / `auto-reconnect` describe block — see Implementation Steps and Acceptance Criteria for required cases.                                                                                                                                                                                                  |
| `src/app/(tabs)/device.tsx`                      | Add the "PREVIOUSLY PAIRED" saved-device branch per Interfaces/API.                                                                                                                                                                                                                                                            |
| `src/app/(tabs)/__tests__/device.test.tsx`       | Add cases: saved device renders `SavedDeviceRow` with its name and a working "FORGET" tap; no saved device (or permission not granted) keeps today's empty-state text unchanged.                                                                                                                                               |
| `src/i18n/locales/en.json`                       | Add `pairing.previouslyPaired.forgetAction`.                                                                                                                                                                                                                                                                                   |

## Implementation Steps

1. Confirm the current `@react-native-async-storage/async-storage` release
   compatible with Expo SDK 57 / React Native 0.86.2 per
   https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/, then run
   `npx expo install @react-native-async-storage/async-storage`.
2. Add `__mocks__/@react-native-async-storage/async-storage.ts` re-exporting
   the package's own jest mock. Confirm `pnpm test` picks it up
   automatically for a throwaway `AsyncStorage.getItem` call before writing
   real code against it.
3. Add `src/ble/saved-device.ts` (`SavedDevice`, `loadSavedDevice`,
   `saveDevice`, `clearSavedDevice`) and
   `src/ble/__tests__/saved-device.test.ts` (missing key → `null`; corrupt
   JSON → `null`; an object missing `id` → `null`; a round-tripped
   save/load; `clearSavedDevice` removing a previously saved value; a
   thrown `AsyncStorage` error on any of the three swallowed, not thrown).
4. Add the `autoReconnectPending` field to `canScan` in
   `src/ble/pairing-types.ts`; update
   `src/ble/__tests__/pairing-types.test.ts` per Files Modified.
5. Add the new state, the three effects, the `connect()` persistence
   change, `forgetDevice`, and the two new return fields to
   `src/hooks/use-device-pairing.ts`, per Interfaces/API. Update
   `src/hooks/__tests__/use-device-pairing.test.ts`, mocking
   `loadSavedDevice`/`saveDevice`/`clearSavedDevice` (via
   `jest.mock('@/ble/saved-device')`, following the file's existing
   `jest.mocked(bleManager.xxx)` style) with cases covering:
   - No saved device (`loadSavedDevice` resolves `null`): scanning starts
     exactly as today, `connectToDevice` is never called before a manual
     `connect()`.
   - A saved device, adapter already `poweredOn`, permission granted:
     `connectToDevice` is called with the saved id before any
     `startDeviceScan` call; on success, `usePairingStore.getState().connection`
     is `{ kind: 'connected', deviceId }` and `saveDevice` is called again
     (re-persisting) with the resolved device's name.
   - Same, but `connectToDevice` rejects: `startDeviceScan` is called after
     the failure settles (`connection.kind === 'connectionFailed'`), and
     never before.
   - Adapter starts `poweredOff`, saved device present: no
     `connectToDevice` call until the adapter transitions to `poweredOn`.
   - Permission is `false` at mount, saved device present: no
     `connectToDevice` call until `useDevicePairing` is re-rendered with
     `permissionGranted: true`.
   - Only one `connectToDevice` call ever happens for the saved device,
     even across adapter/permission changes after the attempt has already
     fired (guards the `autoReconnectDeviceIdRef` "already attempted"
     check).
   - A manual `connect(deviceId)` call (success or failure) also calls
     `saveDevice` with that device's resolved name.
   - `forgetDevice()` calls `clearSavedDevice()` and flips the hook's
     returned `savedDevice` to `null`.
6. Add `SavedDeviceRow` (`src/components/saved-device-row.tsx`) and its test
   file, following `device-row.tsx`'s structure and testing style.
7. Add the "PREVIOUSLY PAIRED" branch to `src/app/(tabs)/device.tsx` and the
   new cases to `src/app/(tabs)/__tests__/device.test.tsx`, per Files
   Modified.
8. Add `pairing.previouslyPaired.forgetAction` to
   `src/i18n/locales/en.json`.
9. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **Storage stays out of `usePairingStore`**, mirroring `ble-device-scanning`'s
  existing rule that BLE side effects stay out of the store: `saved-device.ts`
  is called only from `use-device-pairing.ts`, never from
  `pairing-store.ts`/`pairing-types.ts`.
- `canScan` grows by one boolean AND term, the same shape
  `ble-connection-loss-detection` used to add its own `!== 'connectionLost'`
  term — extend the existing pure function rather than branching around it
  at the call site.
- The three new hook effects follow this file's existing idiom: react to
  store/prop state, call a store action or a local setter, no promise
  threaded back to the caller — matching the "subscribe/derive, don't chain
  promises through the hook" shape already used by every other effect here.
- `saved-device-row.tsx` follows `device-row.tsx`'s exact file shape
  (named export, `StyleSheet.create` at the bottom, `useTheme()` for
  colors/radii, `useTranslation()` for copy) — a new sibling component, not
  a variant bolted onto the existing one, per "additive diffs on working
  components."
- Every user-facing string is a new `en.json` key rendered via `t(...)`,
  per `CLAUDE.md`'s i18n rule — no inline JSX string literals.
- Component file is kebab-case (`saved-device-row.tsx`), component name is
  PascalCase (`SavedDeviceRow`), per `CLAUDE.md`.

## Acceptance Criteria

- [ ] `loadSavedDevice()` returns `null` for a missing key, corrupt JSON, or
      an object without a string `id`, and never throws.
- [ ] `saveDevice(device)` persists a value `loadSavedDevice()` then returns
      unchanged (round-trip).
- [ ] `clearSavedDevice()` makes a subsequent `loadSavedDevice()` return
      `null`.
- [ ] `canScan(...)` returns `false` when `autoReconnectPending: true`, with
      every other condition satisfied; unchanged (per existing tests) for
      `autoReconnectPending: false`.
- [ ] With no saved device, `useDevicePairing`'s mount behavior is
      byte-for-byte unchanged from today: no `connectToDevice` call happens
      before a manual `connect()`, and scanning starts under the same
      conditions as before this ticket.
- [ ] With a saved device, adapter `poweredOn`, and permission granted,
      `bleManager.connectToDevice` is called with the saved id before
      `bleManager.startDeviceScan` is ever called.
- [ ] A successful auto-reconnect attempt transitions
      `usePairingStore.getState().connection` to `{ kind: 'connected',
deviceId }`, matching a manual connect's outcome, and no scan is started
      for the remainder of that mount (existing `canScan` exclusion for
      `'connected'`).
- [ ] A failed auto-reconnect attempt (rejection or `CONNECT_TIMEOUT_MS`
      elapsing) leaves `connection.kind === 'connectionFailed'` and then
      allows scanning to start — with no user-visible error state
      introduced for this failure beyond what a manual failed connect
      already shows.
- [ ] Exactly one `connectToDevice` call is ever made for the saved device
      in a single mount, regardless of how many times `adapter` or
      `permissionGranted` change afterward.
- [ ] With a saved device present but adapter not yet `poweredOn` (or
      permission not yet granted), no `connectToDevice` call happens until
      that condition is met — confirming the attempt waits for both.
- [ ] On any successful connect (manual tap or auto-reconnect),
      `saveDevice` is called with `{ id: deviceId, name }`, where `name` is
      the resolved native `Device`'s `name ?? localName ?? null` — never a
      translated placeholder string.
- [ ] `useDevicePairing`'s returned `savedDevice` reflects the persisted
      value: `null` before the async load resolves and when nothing is
      saved, the loaded `SavedDevice` otherwise, and the just-connected
      device immediately after any successful connect.
- [ ] Calling the returned `forgetDevice()` calls `clearSavedDevice()` and
      flips `savedDevice` to `null`; it does not call any `bleManager`
      method and does not change `connection`.
- [ ] `src/app/(tabs)/device.tsx`: with a saved device and `status ===
'granted'`, the "PREVIOUSLY PAIRED" section renders `SavedDeviceRow` with
      that device's name (or the "Unknown device" fallback when `name` is
      `null`) and a "FORGET" action that calls `forgetDevice`. With no saved
      device, or with `status !== 'granted'`, the section renders exactly
      today's empty-state copy, unchanged.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Single attempt, no retry.** A failed auto-reconnect attempt never
  retries within the same mount; the user falls back to the normal
  scan-and-tap flow. Retry/backoff policy is an explicitly separate,
  out-of-scope ticket.
- **No mid-session auto-reconnect after a drop.** This ticket only covers
  the mount-time attempt. A `connectionLost` transition mid-session (per
  `ble-connection-loss-detection`) is unaffected and unhandled here — out of
  scope, per the ticket.
- **No Live Workout screen change.** `src/app/live-workout.tsx` is not
  touched by this ticket.
- **"Forget" is app-scoped, not OS-scoped.** Confirmed: this app cannot
  remove an Android Bluetooth bond programmatically (see Context). "FORGET"
  copy says only that this app stops remembering the device — it must never
  imply the phone's system-level pairing is removed.
- **Accepted cosmetic gap: brief "BLUETOOTH READY" flash before "CONNECTING".**
  Between the adapter reaching `poweredOn`/permission being granted
  and the auto-reconnect-firing effect actually calling `connect()`, one
  render can occur where `autoReconnectPending` is still `true` but
  `deriveScanBarState` (which doesn't consult `canScan`/`autoReconnectPending`
  at all) computes its normal adapter/scan-derived row. This is at most a
  single-frame flash, not a functional bug, and fixing it would require
  teaching `deriveScanBarState`/`ScanBarState` a new kind purely for this —
  out of scope for this ticket's smallest-coherent-design goal.
- **No longer a gap: the bar's `connecting` copy doesn't name the device at
  all.** An earlier draft of this spec accepted a cosmetic gap where the
  bar would show "CONNECTING TO Unknown device" during the auto-reconnect
  attempt, since `deriveScanBarState` resolves a connecting device's
  display name by looking it up in the store's `devices` list
  (`src/ble/pairing-types.ts:146-150`), which is empty until a scan runs.
  That gap is moot now that the `connecting` bar row's copy was simplified
  to a bare "CONNECTING" (see `ble-device-scanning/SPEC.md`) — there's no
  name in the copy for a missing lookup to degrade.
- **Accepted edge case: forgetting a device mid-auto-reconnect-attempt to
  it.** If the user taps "FORGET" while the auto-reconnect attempt to that
  same device is still in flight, and the attempt then succeeds,
  `connect()`'s success branch re-persists it — the forget action is
  effectively undone by the in-flight attempt's own success. This is a
  narrow timing window (the attempt is a single connect, bounded by
  `CONNECT_TIMEOUT_MS`) and self-consistent (the device that just connected
  is the remembered one, which is the feature's own stated behavior) rather
  than a bug; not engineered around here.
- **`autoReconnectPending` gates only scanning, not focus/app-state.** The
  auto-reconnect-firing effect does not itself check `isFocused`/
  `isAppActive` — it mirrors `connect()`'s own existing lack of such
  gating. Those two conditions remain part of `canScan`'s independent AND
  chain for scanning specifically.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
- No new `DESIGN.md` token: `SavedDeviceRow` reuses existing `danger`/
  `actionSm`/`surface`/`outline`/`rounded.md` tokens.
