# Feature: Foreground Location Permission and GPS Sampling

## Intent

While a workout session is running, the app samples the device's latitude/longitude at one configurable interval and saves the timestamped coordinates on the session record as `route`. Nothing is sampled while the session is paused. Every location failure (permission denied, permanently denied, GPS off, no fix yet) shows a distinct, non-blocking status on Live Workout and never interrupts or alters heart-rate recording, Pause/Resume/Stop, or Save.

## Context

- **Problem statement:** [GitHub issue #75](https://github.com/ajcondino/fitness-tracker/issues/75) (Milestone 3: Optional Stretch). Nothing in `src/` reads location: grep for `expo-location`, `Location.`, `route` finds only BLE-related `ACCESS_FINE_LOCATION` handling in `src/ble/permissions.ts` (the pre-API-31 BLE scan permission) and the `locationServicesDisabled` BLE scan error. `WorkoutRecord` (`src/workout/workout-record.ts`) has no coordinate field. `package.json` has `react-native-maps` (from #73) but no location package. `app.json` declares no location permission; `react-native-ble-plx` is configured with `neverForLocation: true`.
- **Current code:**
  - `src/hooks/use-workout-session.ts` — owns the `idle | running | paused | ended` phase machine and the `samples`/`pauses` arrays. Its ingestion effect appends a heart-rate sample only when `phase === 'running'` ("no sample while idle, paused, or ended"). This is the single-condition pause rule the issue asks location to copy.
  - `src/ble/permissions.ts` + `src/hooks/use-ble-permission-status.ts` — the permission flow to mirror: a pure check/request module returning a settled result (`'granted' | 'denied' | 'blocked'`...), and a hook layering `'undetermined' | 'requesting'` UI states on top, re-checking on foreground (`AppState` → `'active'`) and never re-prompting from a re-check. `src/ble/pairing-types.ts` + `src/components/scan-status-bar.tsx` are the framework-free state derivation and presentational status bar for the same pattern.
  - `src/workout/workout-record.ts` — `WORKOUT_RECORD_SCHEMA_VERSION = 4`; `WorkoutRecord` fields: `schemaVersion, id, startedAt, samples, device, pauses, healthConnect, source, activityType`.
  - `src/workout/workout-migrations.ts` — the #61 runner: `MIGRATIONS` keyed by the version upgraded FROM (currently `1`, `2`, `3`); adding a field means one new entry plus a version bump.
  - `src/workout/workout-store.ts` — `parseWorkoutRecord` validates the core fields, runs `migrateWorkoutRecord`, then applies lenient per-field parsers (`parseHealthConnectWriteInfo`, `parseWorkoutSource`, `parseActivityType`).
  - `src/app/live-workout.tsx` — the only site that constructs a `WorkoutRecord` (the `session.phase === 'ended'` effect) and the only consumer of `useWorkoutSession`.
- **User impact:** A person who grants location gets a GPS trail stored with each session (displayed by a later ticket; none here). A person who denies, blocks, or has GPS off sees one small status line explaining why no route is being recorded, and the workout is otherwise identical to today.
- **Dependencies:**
  - #61 migration runner (present).
  - New package `expo-location` (SDK-57-aligned version; install with `pnpm expo install expo-location`).
  - **Native change:** adds `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` to the manifest, so the native fingerprint changes. This requires a new EAS build (not an OTA update), and a local `expo prebuild --clean` since `android/` is generated and not checked in.

## Data Model

```ts
// src/workout/workout-record.ts — modified
export const WORKOUT_RECORD_SCHEMA_VERSION = 5; // was 4

export type RoutePoint = {
  latitude: number; // degrees, WGS84, finite
  longitude: number; // degrees, WGS84, finite
  timestamp: number; // Date.now() at the moment the fix arrived (same convention as HeartRateSample)
};

export type WorkoutRecord = {
  // ...existing fields unchanged
  route: RoutePoint[]; // [] = no location was recorded (denied, unavailable, no fix, or a pre-v5 session)
};
```

```ts
// src/location/location-types.ts — new, framework-free
export type LocationPermissionResult = 'granted' | 'denied' | 'blocked';

export type LocationTrackingStatus =
  | 'idle' // session not running or no permission request made yet and nothing to show
  | 'requesting' // OS dialog is up
  | 'permission-denied' // asked, refused, can ask again
  | 'permission-denied-permanently' // refused with "don't ask again"; only Settings recovers
  | 'gps-unavailable' // permission granted but location services off / provider errors
  | 'acquiring-fix' // permission granted, running, no fix yet in the current running stretch
  | 'sampling'; // fixes arriving
```

- Invariants: `route` is append-only during a session, ordered by `timestamp`, and only ever appended while `phase === 'running'`. `route` does not affect `deriveWorkoutSummary` or any heart-rate derivation.
- **Migration 4 → 5:** `4: (record) => ({ ...record, route: record.route ?? [], schemaVersion: 5 })`. Pre-v5 sessions get `[]` — "no location recorded", never a guess. `parseWorkoutRecord` gains a lenient `parseRoute(raw)`: non-array → `[]`; entries that aren't `{ latitude, longitude, timestamp }` finite numbers are dropped individually (a corrupt point never invalidates the record), matching `parseWorkoutSource`/`parseActivityType` precedent.
- Persistence: same AsyncStorage key per session (`workout.session.<id>`); no new storage keys. Size: at 5 s, a 1 h session is ~720 points (~50 KB JSON) — acceptable for AsyncStorage per-key.

## Interfaces / API

```ts
// src/location/location-config.ts — new; the ONE place the interval lives
export const LOCATION_SAMPLE_INTERVAL_MS = 5_000;
```

Interval decision: **5 s**, as the issue proposes. Reasoning: at walking/running speed (2–4 m/s) that is a point every ~10–20 m, which draws a smooth polyline and is more than enough for distance; at cycling speed (~8 m/s) ~40 m spacing, still acceptable. Sampling is foreground-only while the screen is on and the BLE stream is already active, so marginal battery cost is the GPS receiver itself; a longer interval lets the receiver duty-cycle less. Accuracy is requested at `Balanced` rather than `High` to avoid forcing the highest-power GNSS mode. **The issue refers to "the battery findings", but no such document exists in this repo (searched `docs/` and README).** Either link them or accept this reasoning; the constant makes retuning a one-line change.

```ts
// src/location/permissions.ts — new (mirrors src/ble/permissions.ts)
checkLocationPermission(): Promise<'granted' | 'denied'>        // read-only; never shows the dialog
requestLocationPermission(): Promise<LocationPermissionResult>   // may show the dialog; 'blocked' when canAskAgain === false
// Both resolve 'granted' on non-Android platforms (the app is Android-only).
```

```ts
// src/location/location-types.ts
deriveLocationStatus(input: {
  permission: 'undetermined' | 'requesting' | LocationPermissionResult;
  servicesEnabled: boolean;
  phase: SessionPhase;
  hasFixThisStretch: boolean;
}): LocationTrackingStatus
```

```ts
// src/hooks/use-location-route.ts — new
useLocationRoute(phase: SessionPhase): {
  status: LocationTrackingStatus;
  route: RoutePoint[];
  requestAccess: () => void; // OS dialog; no-op once blocked
  openSettings: () => void;  // Linking.openSettings()
}
```

Behavior:

- Takes only `phase`, like `useWorkoutSession` takes primitives — testable in isolation; `useWorkoutSession` itself is **not** modified.
- Subscription runs only while `phase === 'running'` and permission is granted, polling/watching at `LOCATION_SAMPLE_INTERVAL_MS`. It is torn down on pause/stop/unmount, so no GPS work occurs while paused.
- The ingestion point additionally guards `phase === 'running'` (read from a ref), so a fix delivered after a pause tap but before teardown is dropped. This is the single condition that keeps `route` correct.
- `acquiring-fix` shows from the start of each running stretch until the first fix of that stretch (so after Resume it briefly returns to `acquiring-fix`).
- Errors/timeouts from the location API or `Location.hasServicesEnabledAsync() === false` → `gps-unavailable`; sampling resumes automatically when a later fix arrives (status flips back to `sampling`). Nothing throws into the render path.
- Permission re-checked on `AppState` → `'active'` (so returning from Settings clears `permission-denied-permanently` if granted), never via the request path — same rule as `use-ble-permission-status.ts`.
- Permission is first requested when the user taps Start (fire-and-forget; the session starts immediately and does not wait on the dialog). It is never requested on screen mount or foreground re-entry.

```ts
// src/components/location-status.tsx — new, presentational
<LocationStatus status={LocationTrackingStatus} onRequestAccess={() => void} onOpenSettings={() => void} testID? />
```

Renders nothing for `idle`. Otherwise one compact, non-modal line (no overlay, no `Alert`), distinct text per status; an "Enable location" action for `permission-denied`, "Open settings" for `permission-denied-permanently`, none for the others.

Compatibility: `LocationStatus`/`useLocationRoute` add no required props to existing components. `useWorkoutSession`'s snapshot is unchanged.

## Files Created

| File                                                | Purpose                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/location/location-config.ts`                   | `LOCATION_SAMPLE_INTERVAL_MS` — the single tunable.                                          |
| `src/location/location-types.ts`                    | Framework-free `LocationPermissionResult`, `LocationTrackingStatus`, `deriveLocationStatus`. |
| `src/location/permissions.ts`                       | `checkLocationPermission` / `requestLocationPermission` over `expo-location`.                |
| `src/hooks/use-location-route.ts`                   | Permission + sampling hook; owns `route` and the pause gate.                                 |
| `src/components/location-status.tsx`                | Presentational non-blocking status line.                                                     |
| `src/location/__tests__/location-types.test.ts`     | Status derivation for every state.                                                           |
| `src/location/__tests__/permissions.test.ts`        | Granted / denied / blocked / non-Android.                                                    |
| `src/hooks/__tests__/use-location-route.test.ts`    | Pause gating, denied path, GPS-unavailable recovery, interval constant.                      |
| `src/components/__tests__/location-status.test.tsx` | Distinct render + actions per status; `idle` renders nothing.                                |

## Files Modified

| File                                                                                                  | Change                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `pnpm-lock.yaml`                                                                     | Add `expo-location` via `pnpm expo install`.                                                                                                                                          |
| `app.json`                                                                                            | Add the `expo-location` plugin with background location disabled and a foreground-only permission rationale; ensure `ACCESS_FINE_LOCATION` survives manifest merge (see Constraints). |
| `src/workout/workout-record.ts`                                                                       | Bump to v5; add `RoutePoint` and `WorkoutRecord.route`.                                                                                                                               |
| `src/workout/workout-migrations.ts`                                                                   | Add `4:` step defaulting `route` to `[]`.                                                                                                                                             |
| `src/workout/workout-store.ts`                                                                        | Add lenient `parseRoute`; include `route` in the parsed record.                                                                                                                       |
| `src/app/live-workout.tsx`                                                                            | Call `useLocationRoute(session.phase)`; request access on Start; render `LocationStatus` (additive, no restructuring); include `route` in the constructed record.                     |
| `src/i18n/locales/en.json`                                                                            | `liveWorkout.location.*` strings for each status and action.                                                                                                                          |
| `src/workout/__tests__/workout-migrations.test.ts`, `workout-store.test.ts`, `workout-record.test.ts` | v4→v5 migration, `parseRoute` leniency, record shape.                                                                                                                                 |
| `src/app/__tests__/live-workout.test.tsx`                                                             | Denied path keeps the session running and saves with `route: []`; granted path saves points.                                                                                          |
| `README.md`                                                                                           | One short note on the location permission and the new-build requirement.                                                                                                              |

## Implementation Steps

1. Read https://docs.expo.dev/versions/v57.0.0/sdk/location/ (per CLAUDE.md) and confirm the SDK-57 API for permissions (`requestForegroundPermissionsAsync`, `canAskAgain`), `hasServicesEnabledAsync`, and `watchPositionAsync`/`getCurrentPositionAsync` options. Adjust the hook design below if any name or option differs.
2. `pnpm expo install expo-location`; add the plugin to `app.json`.
3. Add `location-config.ts` and `location-types.ts` (+ tests first for `deriveLocationStatus`).
4. Add `permissions.ts` (+ tests incl. `blocked` via `canAskAgain: false`).
5. Schema: bump version, add `RoutePoint`/`route`, add migration `4`, add `parseRoute`; update migration/store/record tests (v4 fixture → `route: []`; malformed points dropped; valid points preserved).
6. Add `use-location-route.ts` (+ tests with fake timers and a mocked `expo-location`): no points while `paused`; a late fix after pause is dropped; points resume after resume; denied/blocked → `route` stays `[]` and status is correct; GPS-unavailable → recovers on next fix; interval taken from `LOCATION_SAMPLE_INTERVAL_MS`.
7. Add i18n strings and `location-status.tsx` (+ tests, all via `t()`; theme tokens only, no new tokens).
8. Wire into `live-workout.tsx` additively; extend `live-workout.test.tsx`.
9. Verify: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Then `pnpm expo prebuild --clean`, inspect the merged `AndroidManifest.xml`, and smoke-test on a device build (grant / deny / deny-permanently / GPS off / pause-resume).

## Style & Conventions

- Mirrors `src/ble/permissions.ts` / `use-ble-permission-status.ts` / `pairing-types.ts` / `scan-status-bar.tsx` layering: pure result module, hook that adds UI-session states, framework-free status derivation, presentational bar.
- **Deliberate deviation:** permission calls go through `expo-location` rather than `PermissionsAndroid` (as BLE does), because `PermissionsAndroid.check` cannot report `canAskAgain` and the issue needs a distinct permanently-denied state; `expo-location` is also required for the sampling itself, so no extra dependency is introduced for permissions.
- Location lives in its own `src/location/` module and hook rather than inside `useWorkoutSession`, keeping that hook's two-primitive contract and tests untouched ("additive diffs on working screens").
- Every user-facing string in `en.json` via `t()`; styling via `StyleSheet.create` and existing theme tokens; kebab-case filenames; `@/` aliases; no manual `useMemo`/`useCallback`; `render()` is awaited in tests; tests colocated in `__tests__/`; pnpm only.

## Acceptance Criteria

- [ ] Stopping and saving a session with location granted persists `route` as an array of `{ latitude, longitude, timestamp }` (verified in `live-workout.test.tsx` and on device).
- [ ] Each of `permission-denied`, `permission-denied-permanently`, `gps-unavailable`, `acquiring-fix`, `sampling` renders a distinct, non-modal status (`location-status.test.tsx`), and none disables Start/Pause/Resume/Stop/Save.
- [ ] With permission denied, the session records heart rate normally and saves with `route: []`.
- [ ] No coordinates are recorded between a pause and the next resume, including a fix that arrives just after Pause is tapped (`use-location-route.test.ts`).
- [ ] The interval is defined only by `LOCATION_SAMPLE_INTERVAL_MS`; `grep -rn "5_000\|5000" src/location src/hooks/use-location-route.ts` finds it nowhere else.
- [ ] A v4 record loads as v5 with `route: []`; a record with malformed route entries loads with only the valid points.
- [ ] Returning from system Settings after granting clears the permanently-denied status without a restart.
- [ ] Merged `AndroidManifest.xml` contains `ACCESS_FINE_LOCATION` without `maxSdkVersion` limiting it below the target API.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Constraints

- **Non-goals:** background location / foreground service; drawing the route on a map (react-native-maps is installed but unused here); distance, pace, or altitude derivation; writing the route to Health Connect; syncing it to Firestore; any location-interval setting in the UI (the constant is code-level only).
- iOS is not built; no iOS permission strings are required.
- Requires a new native build; an OTA update to an existing preview build will not include the permission or the `expo-location` native module.
- **Verify during implementation:** (a) `react-native-ble-plx`'s plugin with `neverForLocation: true` may add `ACCESS_FINE_LOCATION` with `maxSdkVersion="30"` — if so, the merged manifest must be adjusted (e.g. a plugin/`tools:replace`) so location permission is not stripped on API 31+; (b) exact `expo-location` SDK 57 API names (step 1); (c) the "battery findings" referenced in the issue — not found in the repo.
- Route data is sensitive: it stays local on-device (AsyncStorage) and is not logged to Sentry or included in error payloads.
- Session recording must never depend on location: no code path in this feature may throw into, await, or gate the session phase machine.
