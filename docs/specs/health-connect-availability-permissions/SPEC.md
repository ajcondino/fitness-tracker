# Feature: Health Connect Availability, Permissions & Profile Settings

## Intent

The Profile screen (new) has a Health Connect settings section that
correctly reports whether the device/app can write to Health Connect and
whether the user has chosen to, across all six real-world states the
platform can produce — with a deliberate, explicitly-tapped grant action
that never fires on screen entry. No record is ever written; this ticket
only establishes capability and consent, persisted for a follow-up ticket
to consume.

## Context

- **Problem statement:** No Health Connect dependency, permission logic, or
  settings UI exists anywhere in the repo (confirmed absent from
  `package.json`, `app.json`, and `src/`). There is also **no Profile
  screen** — confirmed by exhaustive search (`grep -rni profile` across
  `src/`, `docs/`, `DESIGN.md`): the only Profile-shaped things that exist
  are an inert avatar `Pressable` on Home
  (`src/app/(tabs)/index.tsx:96-112`, `testID="home-profile-control"`,
  `accessibilityLabel="Profile"`, no `onPress`, with the comment "Mocked —
  there's no user/profile feature yet") and an unused `ProfileIcon` export
  in `src/components/icons.tsx:69-74` (not wired into `tab-bar.tsx`'s
  `ICONS` map — Profile was never a tab). `DESIGN.md` never mentions
  "Profile," has no settings-section/list-row spec, and no toggle/switch
  component exists anywhere in the design tokens or `src/components/`.
  **This was confirmed with the requester before writing this spec**
  (2026-08-26, same pattern `ble-runtime-setup/SPEC.md` and
  `ble-pairing-permissions/SPEC.md` used for their own cross-cutting
  gaps): build a minimal Profile screen as part of this ticket, wiring
  Home's existing (currently dead) avatar control to it, and design the
  settings section from `DESIGN.md`'s general rules (screen skeleton,
  spacing scale, elevation levels, existing color tokens) since no mock
  exists to match pixel-for-pixel. The new `Toggle` primitive introduced
  below uses only existing `DESIGN.md` color tokens — no new token is
  added.
- **Current code:**
  - `src/app/_layout.tsx:33-37` — root `<Stack>` registers `(tabs)`,
    `live-workout`, and `session/[id]` as top-level screens, each
    `headerShown: false`. Both non-tab screens are `<SafeAreaView
edges={['top']}>`'s children and independently handle their own
    bottom safe-area inset (per `_layout.tsx:24-30`'s comment) since the
    floating `TabBar` is absent outside `(tabs)`.
  - `src/app/session/[id].tsx:57-70` — the closest precedent for a pushed,
    non-tab detail screen with a back affordance: a `Pressable` rendering
    `‹` (`titleMd`, `onSurfaceDim`), `testID="session-detail-back"`,
    calling `router.back()`.
  - `src/app/(tabs)/device.tsx` — the closest precedent for a settings-like
    screen composed of an eyebrow/title/subtitle header
    (`:60-70`) followed by `label-caps`-headed sections (`:82-137`), each
    holding either a status bar (`ScanStatusBar`) or empty-state copy.
    This ticket's Profile screen and Health Connect section follow the
    same shape.
  - `src/ble/saved-device.ts` and `src/workout/workout-store.ts` — the
    established local-persistence convention: a framework-free module
    (no React/BLE import) wrapping `@react-native-async-storage/async-storage`
    directly, one deliberate key per concern, every read swallowing
    errors/corrupt data to a safe default rather than throwing. This
    ticket's `src/health/health-connect-store.ts` follows the identical
    shape.
  - `src/ble/permissions.ts` / `src/hooks/use-ble-permission-status.ts`
    (from `ble-pairing-permissions/SPEC.md`) — the established split
    between a **read-only check** (`checkBlePermissions`, safe to call on
    mount and on every foreground re-entry) and an **explicit request**
    (`requestBlePermissions`, only ever called from a user tap). This
    ticket's Health Connect equivalent (`checkHealthConnectPermission` /
    `requestHealthConnectPermission`) follows the identical split, for the
    identical reason stated in this ticket's brief: the grant action must
    never fire incidentally.
  - No dependency on `src/ble/*` or `usePairingStore` anywhere in this
    ticket — Health Connect and BLE are unrelated subsystems that happen
    to share a persistence style.
- **User impact:** Tapping the avatar control on Home now opens a Profile
  screen. Its Health Connect section always reflects live, current
  capability and consent — including when Health Connect was uninstalled
  or permission was revoked outside the app — with recovery guidance
  specific to what actually went wrong, never a dead end.
- **Dependencies:**
  - **`react-native-health-connect`** (new; Android-only, no iOS
    equivalent ships from this package) — install via `npx expo install`.
    Confirm the current release's Expo SDK 57 / RN 0.86.2 compatibility
    against https://github.com/matinzd/react-native-health-connect and
    its docs site (https://matinzd.github.io/react-native-health-connect/)
    per `AGENTS.md`, since Expo's own versioned docs don't cover
    third-party libraries (same caveat `ble-runtime-setup/SPEC.md` noted
    for `react-native-ble-plx`).
  - **`expo-build-properties`** (new, likely — see Constraints) — Health
    Connect requires `minSdkVersion=26`
    (source: the library's own install docs, which show it paired with an
    `expo-build-properties` plugin entry setting
    `android.minSdkVersion: 26`). This repo's `minSdkVersion` isn't
    hand-set anywhere in the checked-in `android/build.gradle` (it reads
    `rootProject.ext.minSdkVersion`, sourced from the React Native Gradle
    plugin's own default for RN 0.86.2) — **verify the resolved value at
    implementation time**; add the dependency and plugin entry only if
    it's below 26.
  - **`expo-local-authentication`** (new) — not for authentication; its
    `getEnrolledLevelAsync()` (`SecurityLevel.NONE | SECRET | BIOMETRIC`)
    is this spec's mechanism for detecting "no screen lock set" (see
    Interfaces/API — Health Connect itself reports no such status, see
    the mismatch called out there).
  - `@react-native-async-storage/async-storage` (already installed, from
    `persist-last-connected-device`) — no new storage dependency.
  - All three new native packages require an Android dev-client rebuild
    (`pnpm android`) after a clean prebuild, per the existing BLE-library
    precedent (`CLAUDE.md`'s "Read the versioned docs..." section, already
    flags native BLE modules; the same applies here).

## Data Model

```ts
// src/health/health-connect-client.ts

export type HealthConnectAvailability = 'available' | 'unavailable';
// Collapses the library's own three-way `SdkAvailabilityStatus`
// (`SDK_AVAILABLE` / `SDK_UNAVAILABLE` /
// `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED`) into two, per the ticket's
// own state 4, which is explicitly one state covering both "not installed"
// and "Android version unsupported." See Interfaces/API for the mapping
// and why Android-14's framework-integrated Health Connect needs no
// separate branch here.
```

```ts
// src/hooks/use-health-connect-settings.ts

export type HealthConnectSectionStatus =
  | 'checking' // initial load in flight — not one of the ticket's six
  // states; mirrors index.tsx/history.tsx's `undefined`-while-loading
  // convention. The section renders nothing during this state.
  | 'unavailable' // ticket state 4
  | 'noScreenLock' // ticket state 5
  | 'permissionExhausted' // ticket state 6
  | 'notGranted' // ticket state 1
  | 'grantedEnabled' // ticket state 2
  | 'grantedDisabled'; // ticket state 3
```

```ts
// src/health/health-connect-store.ts

// Two independent AsyncStorage keys, not one JSON blob — mirrors
// saved-device.ts's one-key-per-concern shape, and keeps `declineCount`
// (an internal heuristic, see Interfaces/API) legible/inspectable
// separately from `writeBackEnabled` (the actual user-facing setting the
// follow-up ticket will read).
const WRITE_BACK_ENABLED_KEY = 'healthConnect.writeBackEnabled'; // 'true' | 'false'
const DECLINE_COUNT_KEY = 'healthConnect.declineCount'; // stringified integer
```

- `writeBackEnabled: boolean` — the toggle's persisted value. This is the
  value "nothing reads yet," per the ticket. Defaults to `true` when
  unset (see Interfaces/API's `loadWriteBackEnabled` contract) — granting
  access is itself the opt-in; the toggle is an off-switch for something
  that starts on, not an additional consent gate.
- `declineCount: number` — **not** a value from the Health Connect API.
  Health Connect's `requestPermission()` has no equivalent of
  `PermissionsAndroid`'s `NEVER_ASK_AGAIN` result — it gives no signal
  distinguishing "first decline" from "second, now-permanent decline."
  This locally-persisted counter is this app's own best-effort proxy for
  that OS-level state, incremented once per `requestPermission()` call
  that resolves without both required permissions granted. It is not
  read anywhere else and has no consumer beyond
  `use-health-connect-settings.ts`'s own state derivation. See
  Constraints for the one known drift case (clearing app storage without
  uninstalling).
- No new Zustand store. Both values are read/derived into a plain hook's
  `useState`, mirroring `use-device-pairing.ts`'s shape (a framework-free
  storage module plus a hook, no store) rather than
  `pairing-store.ts`'s (a Zustand store) — there is no cross-screen
  live-connection state here to justify one, and `saved-device.ts` already
  established that this repo's persisted-preference shape doesn't use
  Zustand either.

## Interfaces / API

### `src/health/health-connect-client.ts` (new)

Thin wrapper around `react-native-health-connect`, mirroring
`src/ble/permissions.ts`'s "no BLE/React import, plain async functions"
shape (here: no React import; native-module import only).

```ts
export const REQUIRED_PERMISSIONS = [
  { accessType: 'write', recordType: 'ExerciseSession' },
  { accessType: 'write', recordType: 'HeartRate' },
] as const;
// Write-only, matching the ticket's explicit scope ("This ticket writes
// nothing... Writing sessions is the follow-up ticket" — requesting
// write access now, using it later, is standard Health Connect practice
// and lets this ticket's grant flow be the one the follow-up reuses
// verbatim). No 'read' permission is requested anywhere — this app never
// reads from Health Connect (explicit non-goal).

export async function getHealthConnectAvailability(): Promise<HealthConnectAvailability>;
// Android-only: resolves 'unavailable' immediately on `Platform.OS !==
// 'android'`, no native call — mirrors ble/permissions.ts's own
// Platform.OS guard. On Android, calls the library's `getSdkStatus()`
// and maps SDK_AVAILABLE -> 'available', anything else (SDK_UNAVAILABLE
// or SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) -> 'unavailable'. This one
// call already covers the Android-14-framework-integration question this
// ticket's brief raises: on API 34+, Health Connect is part of the OS and
// `getSdkStatus()` reports 'available' with nothing installed; on API
// <34 it reflects whether the separate Health Connect app is
// installed/current. No separate API-level branch is written here — the
// library's own status call already absorbs it.

export async function hasScreenLock(): Promise<boolean>;
// The mismatch this ticket's brief asks to flag, found: Health Connect
// (both the OS and this library) exposes NO status, exception, or
// `getSdkStatus()` variant for "no screen lock set." The requirement is
// real (Android's own Health Connect UI blocks entry and shows its own
// "set a screen lock" prompt), but it is enforced entirely inside
// Health Connect's own permission UI, not reported back to the caller —
// so it cannot be derived from anything in `react-native-health-connect`.
// This function instead uses `expo-local-authentication`'s
// `getEnrolledLevelAsync()`, checking device security independent of
// Health Connect: resolves `true` iff the result is `SecurityLevel.SECRET`
// or `SecurityLevel.BIOMETRIC` (both imply an underlying PIN/pattern/
// password — Android requires a backup knowledge-factor for any
// biometric enrollment), `false` for `SecurityLevel.NONE`. Resolves
// `true` immediately on `Platform.OS !== 'android'` (no screen-lock gate
// applies to a platform this app doesn't build for). **Verify at
// implementation time** that `SECRET`/`BIOMETRIC` precisely covers what
// Health Connect itself requires (PIN, pattern, or password) — the
// `expo-local-authentication` docs describe `SECRET` as exactly that set,
// but this hasn't been confirmed against a real device with, e.g., a
// swipe-only or "Smart Lock" trivial unlock configured.

let initializePromise: Promise<boolean> | null = null;
async function ensureInitialized(): Promise<boolean>;
// Lazily calls the library's own `initialize()` exactly once per process
// and caches the promise — mirrors bleManager's "construct once at
// module scope" singleton discipline from ble/manager.ts, adapted to an
// async initializer. Both functions below call this first. **Verify at
// implementation time** whether `initialize()` is actually required
// before `getGrantedPermissions()`/`requestPermission()` (the library's
// docs example calls it before `requestPermission()`; unconfirmed whether
// it's required before a read-only grant check) and whether it's safe to
// call more than once — if the library already memoizes internally, this
// wrapper's own memoization is redundant but harmless.

export async function checkHealthConnectPermission(): Promise<boolean>;
// Read-only, no dialog. Calls ensureInitialized() then the library's
// `getGrantedPermissions()`, returns true iff every entry in
// REQUIRED_PERMISSIONS has a matching {recordType, accessType} in the
// result. A partial grant (e.g. ExerciseSession write granted, HeartRate
// write not) returns false — this ticket's six states don't include a
// partial-grant state (unlike ble-pairing-permissions's `partial-*`
// BLE states), so both permissions are treated as one all-or-nothing
// unit. Safe to call on mount and on every foreground re-check.

export async function requestHealthConnectPermission(): Promise<boolean>;
// May show the OS dialog (or, per the screen-lock mismatch above, may
// instead surface Health Connect's own "set a screen lock" prompt if
// hasScreenLock() was skipped — callers must always check hasScreenLock()
// first and never call this function when it's false). Calls
// ensureInitialized() then the library's `requestPermission
// (REQUIRED_PERMISSIONS)`, returns true iff every required permission is
// present in the resolved granted list — same all-or-nothing check as
// checkHealthConnectPermission.

export async function openHealthConnectApp(): Promise<void>;
// Wraps the library's `openHealthConnectSettings()` — opens the Health
// Connect app's own permission-management screen directly, where a user
// can grant manually after this app has exhausted its two in-app
// prompts. This is what state 6's copy points at.
```

**`RecordType`/`Permission` exact shape note:** the string literals above
(`'ExerciseSession'`, `'HeartRate'`, `'write'`) are taken from the
library's own published usage examples. **Confirm the exact exported
`RecordType`/`Permission` TypeScript types at implementation time**
against the version actually installed, per `AGENTS.md`'s "read the
versioned docs before writing" discipline applied to this third-party
library.

### `src/health/health-connect-store.ts` (new)

Framework-free (no React/health-connect import), mirroring
`src/ble/saved-device.ts` exactly.

```ts
export async function loadWriteBackEnabled(): Promise<boolean>;
// Reads WRITE_BACK_ENABLED_KEY. Missing key, or any read/parse failure,
// resolves `true` (see Data Model's default rationale) — never throws.
export async function saveWriteBackEnabled(enabled: boolean): Promise<void>;
// setItem; a thrown error is caught and swallowed, matching
// saved-device.ts's "a failed write is not a user-facing failure" rule.

export async function loadDeclineCount(): Promise<number>;
// Missing key, or a non-numeric/negative parse, resolves 0. Never throws.
export async function recordDeclinedAttempt(): Promise<number>;
// Reads the current count, writes count + 1, returns the new value. Errors
// swallowed; on a write failure, returns the incremented value anyway (the
// in-memory hook state still advances for this session even if the
// persisted count didn't — see Constraints for the resulting gap, the
// same shape as saved-device.ts's own accepted best-effort-write gap).
export async function clearDeclineCount(): Promise<void>;
// removeItem; called once permission is confirmed fully granted (defends
// against a stale exhausted-looking count if the user later grants
// manually from the Health Connect app after this app had recorded two
// declines).
```

### `src/hooks/use-health-connect-settings.ts` (new)

```ts
export function useHealthConnectSettings(): {
  status: HealthConnectSectionStatus;
  grantAccess: () => void;
  setWriteBackEnabled: (enabled: boolean) => void;
  openHealthConnectApp: () => void;
  openSecuritySettings: () => void;
  openPlayStore: () => void;
};
```

- **On mount, and on every `AppState` transition to `'active'`** (mirrors
  `use-ble-permission-status.ts`'s established foreground-re-check
  pattern, for the identical reason: this ticket's own acceptance
  criteria require revocation via system settings, and Health-Connect
  uninstall, to be reflected without a restart), runs this precedence
  chain, never calling `requestHealthConnectPermission()` from here:
  1. `getHealthConnectAvailability()` — `'unavailable'` -> `status =
'unavailable'`, stop.
  2. `hasScreenLock()` — `false` -> `status = 'noScreenLock'`, stop.
  3. `checkHealthConnectPermission()` — `true`: load
     `writeBackEnabled`, call `clearDeclineCount()`, `status =
writeBackEnabled ? 'grantedEnabled' : 'grantedDisabled'`, stop.
  4. Not granted: load `declineCount`; `status = declineCount >= 2 ?
'permissionExhausted' : 'notGranted'`.
- **`grantAccess()`** — only meaningful (and only ever rendered as
  tappable, see `HealthConnectSection`) from `'notGranted'`. Calls
  `requestHealthConnectPermission()`. On `true`: `saveWriteBackEnabled
(true)`, `clearDeclineCount()`, `status = 'grantedEnabled'`. On
  `false`: `recordDeclinedAttempt()`; `status = newCount >= 2 ?
'permissionExhausted' : 'notGranted'`. This is the ticket's "deliberate,
  never incidental" grant path — the only call site anywhere in this
  spec that invokes `requestHealthConnectPermission()`.
- **`setWriteBackEnabled(enabled)`** — only meaningful from
  `'grantedEnabled'`/`'grantedDisabled'`. Calls `saveWriteBackEnabled
(enabled)` and updates `status` between those two values immediately
  (optimistic; the write is fire-and-forget, matching
  `use-device-pairing.ts`'s `forgetDevice`/persistence-on-connect
  precedent of not awaiting storage writes before updating UI state).
- **`openHealthConnectApp()` / `openSecuritySettings()` /
  `openPlayStore()`** — thin action wrappers: `openHealthConnectApp` calls
  `health-connect-client.ts`'s `openHealthConnectApp()`;
  `openSecuritySettings` calls `Linking.sendIntent
('android.settings.SECURITY_SETTINGS')` (`react-native` core, no new
  dependency — **verify this intent action at implementation time**,
  it's the standard AOSP action but OEM security-settings screens
  occasionally diverge); `openPlayStore` calls `Linking.openURL` with the
  Health Connect Play Store listing
  (`market://details?id=com.google.android.apps.healthdata`, falling
  back to the `https://play.google.com/store/apps/details?id=...` form
  if `canOpenURL` reports the `market:` scheme unavailable, e.g. in an
  emulator with no Play Store).

### `src/components/ui/toggle.tsx` (new, primitive)

```ts
export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
};
export function Toggle(props: ToggleProps): JSX.Element;
```

- Primitive, presentation-only — goes under `src/components/ui/`, not
  `src/components/`, per `CLAUDE.md`'s split (generic, not tied to Health
  Connect; a future settings row could reuse it). First new
  `src/components/ui/` addition since `themed-text.tsx`/`themed-view.tsx`.
- Built entirely from existing `DESIGN.md` tokens — no new token added,
  per `CLAUDE.md`'s "any new token must exist in DESIGN.md first": track
  `success` when `value` (an active/enabled state, matching this app's
  existing "a live/active thing is green" convention from
  `DeviceCard`/`ScanStatusBar`) / `surfaceTrackIdle` with `outlineStrong`
  border when not; thumb `onSurface` circle. `rounded.full` on both track
  and thumb.
- **No animation.** `DESIGN.md`'s Do's and Don'ts is explicit: "Don't
  animate anything except the live dot, the BPM ring, and the scan-bar
  sweep." A sliding-thumb transition would be a fourth. The thumb's
  position is set by a plain conditional style (`alignItems: value ?
'flex-end' : 'flex-start'`), snapping instantly — no `Animated.Value`,
  no `react-native-reanimated` usage.
- Track/thumb are sized smaller than `DESIGN.md`'s 34px touch-target
  floor (a native-scale switch, ~44×26 visual), so the `Pressable`
  carries `hitSlop` padding out to a 34px+ effective hit area rather than
  inflating the visual element — the floor is about touch reliability,
  not visual size.

### `src/components/health-connect-section.tsx` (new, composed)

```ts
export type HealthConnectSectionProps = {
  status: HealthConnectSectionStatus;
  onGrantAccess: () => void;
  onToggleWriteBack: (enabled: boolean) => void;
  onOpenHealthConnectApp: () => void;
  onOpenSecuritySettings: () => void;
  onOpenPlayStore: () => void;
};
export function HealthConnectSection(props: HealthConnectSectionProps): React.JSX.Element | null;
```

Renders `null` for `'checking'` (mirrors `index.tsx`'s "renders nothing
further while loading" convention — no skeleton/spinner anywhere else in
this app). Otherwise: a `label-caps` section header
(`t('healthConnect.sectionHeader')`) above one `surface`/`outline`/`md`-
radius container (styling matches `ScanStatusBar`'s bar chrome, not
`DeviceCard`'s raised chrome — this is an informational/status row, not a
tappable navigation card), whose body is one of:

| `status`              | Body copy                                | Control                                                                                           |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `notGranted`          | `healthConnect.notGranted.body`          | text action `healthConnect.notGranted.grantAction` -> `onGrantAccess`                             |
| `grantedEnabled`      | `healthConnect.granted.enabledBody`      | `Toggle` (`value=true`) + label `healthConnect.granted.toggleLabel` -> `onToggleWriteBack(false)` |
| `grantedDisabled`     | `healthConnect.granted.disabledBody`     | `Toggle` (`value=false`) + label `healthConnect.granted.toggleLabel` -> `onToggleWriteBack(true)` |
| `unavailable`         | `healthConnect.unavailable.body`         | text action `healthConnect.unavailable.action` -> `onOpenPlayStore`                               |
| `noScreenLock`        | `healthConnect.noScreenLock.body`        | text action `healthConnect.noScreenLock.action` -> `onOpenSecuritySettings`                       |
| `permissionExhausted` | `healthConnect.permissionExhausted.body` | text action `healthConnect.permissionExhausted.action` -> `onOpenHealthConnectApp`                |

All text actions render via the same `Pressable` + `ThemedText
variant="actionSm" color="primary"` pattern `ScanStatusBar`'s
`scan-status-bar-action` and `SavedDeviceRow`'s "FORGET" already
establish — no new button component, matching
`ble-pairing-permissions/SPEC.md`'s explicit "deliberately not building a
shared Primary/Ghost button component" precedent. Body copy renders via
`ThemedText variant="bodySm" color="onSurfaceMuted"`. No status dot is
used for any of the six states (unlike `ScanStatusBar`): `notGranted` /
`unavailable` / `noScreenLock` / `permissionExhausted` are all
"informative, not error" per the ticket's own instruction for state 4,
extended consistently to the others — `DESIGN.md`'s two status colors
(`success`/`danger`) are reserved for live/broken connection state
elsewhere in the app, and none of these are that. The granted states
communicate on/off via the `Toggle` alone, with no redundant dot beside
it.

### `src/app/profile.tsx` (new)

A minimal screen: back chevron (`session/[id].tsx`'s exact pattern,
`testID="profile-back"`, `onPress={() => router.back()}`), `h2` title
(`t('profile.title')`), then `HealthConnectSection` wired to
`useHealthConnectSettings()`. No other profile content is added — this
ticket's only content requirement is the Health Connect section; per
`CLAUDE.md`'s "don't invent cross-cutting structure," no user-info
fields, settings beyond this one, or navigation entries are added on the
strength of this ticket alone.

### `src/app/_layout.tsx` (modified)

One new `<Stack.Screen name="profile" options={{ headerShown: false }}
/>`, alongside the existing three (`:33-37`) — same shape, same reasoning
(this screen manages its own header/back affordance, matching
`live-workout`/`session/[id]`).

### `src/app/(tabs)/index.tsx` (modified, additive)

`home-profile-control`'s `Pressable` (`:96-112`) gains `onPress={() =>
router.navigate('/profile')}` — the one-line change that finally connects
the already-existing avatar control to something. No other change to
Home.

### `src/i18n/locales/en.json` (modified)

New top-level `profile` and `healthConnect` namespaces:

```json
{
  "profile": {
    "title": "Profile",
    "back": "Back"
  },
  "healthConnect": {
    "sectionHeader": "HEALTH CONNECT",
    "notGranted": {
      "body": "Pulse can save your workout sessions and heart rate data to Health Connect.",
      "grantAction": "GRANT ACCESS"
    },
    "granted": {
      "toggleLabel": "Save to Health Connect",
      "enabledBody": "Workout sessions and heart rate data are saved to Health Connect automatically.",
      "disabledBody": "Turn this on to save workout sessions and heart rate data to Health Connect."
    },
    "unavailable": {
      "body": "Health Connect isn't available on this device. Install or update it from Google Play to enable syncing.",
      "action": "OPEN GOOGLE PLAY"
    },
    "noScreenLock": {
      "body": "Health Connect requires a screen lock. Set a PIN, pattern, or password to enable it.",
      "action": "OPEN SECURITY SETTINGS"
    },
    "permissionExhausted": {
      "body": "You've already responded to this request twice, so Pulse can't ask again here. Open the Health Connect app to grant access manually.",
      "action": "OPEN HEALTH CONNECT APP"
    }
  }
}
```

### `app.json` (modified)

```json
"plugins": [
  // ...existing entries unchanged...
  "react-native-health-connect",
  ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
]
```

The `expo-build-properties` entry is added only if the verify step in
Dependencies confirms the resolved `minSdkVersion` is currently below 26.
`react-native-health-connect`'s own plugin (auto-discovered by name, same
convention `react-native-ble-plx` already established in this repo) is
expected to add the Health Connect permission declarations
(`android.permission.health.WRITE_EXERCISE`,
`android.permission.health.WRITE_HEART_RATE`) and the Android 11+ package-
visibility `<queries>` entry for `com.google.android.apps.healthdata` to
the generated manifest — **confirm both against the library's current
install docs at implementation time**, since this repo's `AndroidManifest.xml`
is generated, not hand-edited (per `CLAUDE.md`'s Architecture section).

No plugin entry is expected for `expo-local-authentication` (its
`getEnrolledLevelAsync()` needs no manifest permission beyond what
autolinking already provides) — **verify at implementation time** against
https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/, per
`AGENTS.md`.

## Files Created

| File                                                       | Purpose                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/health/health-connect-client.ts`                      | Wraps `react-native-health-connect` + `expo-local-authentication`: availability, screen-lock, permission check/request, open-Health-Connect-app.                                                                                       |
| `src/health/__tests__/health-connect-client.test.ts`       | Covers the `Platform.OS` guard, the availability mapping, `hasScreenLock`'s `SecurityLevel` mapping, and the permission check/request all-or-nothing logic.                                                                            |
| `src/health/health-connect-store.ts`                       | AsyncStorage-backed `writeBackEnabled`/`declineCount` read/write, framework-free.                                                                                                                                                      |
| `src/health/__tests__/health-connect-store.test.ts`        | Missing-key defaults, round-trip, corrupt-value fallback, swallowed write errors, `recordDeclinedAttempt`'s increment.                                                                                                                 |
| `src/hooks/use-health-connect-settings.ts`                 | Owns `HealthConnectSectionStatus`: mount/foreground precedence chain, `grantAccess`, `setWriteBackEnabled`, the three `open*` actions.                                                                                                 |
| `src/hooks/__tests__/use-health-connect-settings.test.ts`  | Every state transition in the precedence chain; the `AppState` foreground re-check surfacing an external revoke/uninstall; the decline-count escalation to `permissionExhausted` at 2; `grantAccess` never firing outside a user call. |
| `src/components/ui/toggle.tsx`                             | Generic on/off switch primitive, no animation.                                                                                                                                                                                         |
| `src/components/ui/__tests__/toggle.test.tsx`              | Renders correct track/thumb color per `value`, calls `onValueChange`, respects `disabled`.                                                                                                                                             |
| `src/components/health-connect-section.tsx`                | Renders the six-state (plus `checking`) settings section body/control per the copy table.                                                                                                                                              |
| `src/components/__tests__/health-connect-section.test.tsx` | Asserts correct copy/control per status, including `null` render for `checking` and the toggle's two granted variants.                                                                                                                 |
| `src/app/profile.tsx`                                      | New Profile screen: back chevron, title, `HealthConnectSection`.                                                                                                                                                                       |
| `src/app/__tests__/profile.test.tsx`                       | Renders the screen, asserts back navigation and that `HealthConnectSection` receives the hook's live status (mocking `useHealthConnectSettings`).                                                                                      |
| `__mocks__/react-native-health-connect.ts`                 | Jest manual mock: `getSdkStatus`, `SdkAvailabilityStatus`, `initialize`, `getGrantedPermissions`, `requestPermission`, `openHealthConnectSettings`, all `jest.fn()` — mirrors `__mocks__/react-native-ble-plx.ts`'s established shape. |
| `__mocks__/expo-local-authentication.ts`                   | Jest manual mock exposing `getEnrolledLevelAsync` (`jest.fn()`) and a `SecurityLevel` enum — mirrors `__mocks__/expo-device.ts`'s spy-able-getter precedent where relevant.                                                            |

## Files Modified

| File                                      | Change                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `pnpm-lock.yaml`         | Add `react-native-health-connect`, `expo-local-authentication`, and (conditionally) `expo-build-properties`.                                                                                                                                                           |
| `app.json`                                | Add the `react-native-health-connect` plugin entry and (conditionally) the `expo-build-properties` entry, per Interfaces/API.                                                                                                                                          |
| `src/app/_layout.tsx`                     | Add `<Stack.Screen name="profile" options={{ headerShown: false }} />`.                                                                                                                                                                                                |
| `src/app/(tabs)/index.tsx`                | Add `onPress={() => router.navigate('/profile')}` to `home-profile-control`. No other change.                                                                                                                                                                          |
| `src/app/(tabs)/__tests__/index.test.tsx` | Update the existing "renders an inert mocked avatar tile..." test (`:142-153`): rename to reflect real navigation, replace `expect(navigate).not.toHaveBeenCalled()` with `expect(navigate).toHaveBeenCalledWith('/profile')`. Every other existing case is unchanged. |
| `src/i18n/locales/en.json`                | Add the `profile` and `healthConnect` keys shown above.                                                                                                                                                                                                                |

## Implementation Steps

1. Confirm `react-native-health-connect`'s current release and its Expo
   SDK 57 / RN 0.86.2 compatibility (exact `RecordType`/`Permission`
   export shapes, `initialize()` semantics) against the library's own
   repo/docs, per `AGENTS.md`. Confirm the resolved `minSdkVersion` in the
   generated `android/app/build.gradle` against the 26 floor. Run `npx
expo install react-native-health-connect expo-local-authentication`
   and, only if the `minSdkVersion` check requires it, `npx expo install
expo-build-properties`.
2. Add the `app.json` plugin entries per Interfaces/API.
3. Create `__mocks__/react-native-health-connect.ts` and
   `__mocks__/expo-local-authentication.ts`.
4. Create `src/health/health-connect-store.ts` and its test.
5. Create `src/health/health-connect-client.ts` and its test, including
   the `Platform.OS !== 'android'` guard on every exported function.
6. Create `src/hooks/use-health-connect-settings.ts` and its test,
   covering the full precedence chain, the `AppState` re-check, the
   decline-count escalation, and confirming `requestHealthConnectPermission`
   (via the mocked client) is only ever invoked from `grantAccess()`.
7. Create `src/components/ui/toggle.tsx` and its test.
8. Create `src/components/health-connect-section.tsx` and its test.
9. Add the `profile`/`healthConnect` keys to `src/i18n/locales/en.json`.
10. Create `src/app/profile.tsx` and its test.
11. Add the `profile` route to `src/app/_layout.tsx`.
12. Wire `home-profile-control` in `src/app/(tabs)/index.tsx`; update
    `src/app/(tabs)/__tests__/index.test.tsx` per Files Modified.
13. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
14. Hand off to the developer for the manual native steps (clean prebuild
    - dev-client rebuild) — not run as part of this implementation, per
      the existing `ble-runtime-setup/SPEC.md` precedent.

## Style & Conventions

- `src/health/` mirrors `src/ble/`'s exact two-module split (a native-
  wrapper module + a framework-free storage module), per this repo's only
  existing precedent for a native-integration domain.
- `checkHealthConnectPermission`/`requestHealthConnectPermission`'s
  read-vs-request split, and the hook's "never call request from a mount
  effect" rule, directly reuse `ble-pairing-permissions/SPEC.md`'s
  established pattern and rationale — cited there as answering the exact
  same "grant must be deliberate" requirement this ticket restates for
  Health Connect.
- `Toggle` follows `CLAUDE.md`'s primitive/composed split
  (`src/components/ui/` vs `src/components/`) exactly as `themed-text.tsx`/
  `themed-view.tsx` do; `HealthConnectSection` follows `ScanStatusBar`/
  `DeviceCard`'s composed-component precedent.
- No new `DESIGN.md` token. `Toggle` and `HealthConnectSection` compose
  existing color tokens only (`success`, `surfaceTrackIdle`,
  `outlineStrong`, `onSurface`, `onSurfaceMuted`, `primary` for text
  actions) — per `CLAUDE.md`'s "any new token must exist in DESIGN.md
  first."
- No animation added to `Toggle`, per `DESIGN.md`'s explicit Don't rule
  restricting motion to the live dot, BPM ring, and scan-bar sweep.
- Every new string renders via `t('profile.…')` / `t('healthConnect.…')`,
  per `CLAUDE.md`'s i18n rule — no inline JSX string literals.
- Component files are kebab-case, component names PascalCase
  (`health-connect-section.tsx` -> `HealthConnectSection`,
  `toggle.tsx` -> `Toggle`), per `CLAUDE.md`.
- Filed at `docs/specs/health-connect-availability-permissions/SPEC.md`
  per this skill's default and the only real convention in this repo
  (every existing spec lives at `docs/specs/<feature>/SPEC.md`), over
  `CLAUDE.md`'s literal (but unused) flat `docs/*.md` text — same
  deviation every prior spec in this repo already notes for itself.

## Acceptance Criteria

- [ ] `getHealthConnectAvailability()` resolves `'unavailable'` for both
      `SDK_UNAVAILABLE` and `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED`,
      and `'available'` for `SDK_AVAILABLE`; resolves `'unavailable'`
      immediately (no native call) when `Platform.OS !== 'android'`.
- [ ] `hasScreenLock()` resolves `false` only for `SecurityLevel.NONE`;
      `true` for `SECRET`/`BIOMETRIC` and for any non-Android platform.
- [ ] `checkHealthConnectPermission()`/`requestHealthConnectPermission()`
      both return `true` only when **every** entry in
      `REQUIRED_PERMISSIONS` is present in the library's result — a
      partial grant of either permission alone is `false`.
- [ ] `useHealthConnectSettings()`'s mount-time and every foreground-
      re-check run the full four-step precedence chain (availability ->
      screen lock -> permission -> decline count), never skipping a step.
- [ ] `requestHealthConnectPermission()` (and therefore any OS dialog) is
      only ever invoked from `grantAccess()` — never from a mount effect,
      a foreground re-check, or any other automatic trigger (verified by
      asserting the mocked `requestPermission` spy is never called
      outside a test that explicitly calls `grantAccess()`).
- [ ] A second `grantAccess()` call that resolves without full grant sets
      `status` to `'permissionExhausted'`; a third or later call is not
      possible through the UI (`HealthConnectSection` renders no tappable
      grant action once `status === 'permissionExhausted'`).
- [ ] `'permissionExhausted'` renders only an `OPEN HEALTH CONNECT APP`
      action, calling `openHealthConnectSettings()` — no retry action.
- [ ] `'grantedEnabled'`/`'grantedDisabled'` render a `Toggle` whose
      `onValueChange` calls `setWriteBackEnabled`, which persists via
      `saveWriteBackEnabled` and flips `status` between the two granted
      values.
- [ ] `writeBackEnabled` defaults to `true` on first grant, and on any
      later load where the permission is granted but no value was ever
      persisted.
- [ ] `Toggle` renders with no animation — no `Animated.Value` or
      `react-native-reanimated` import in `toggle.tsx`.
- [ ] Tapping Home's avatar control navigates to `/profile`
      (`router.navigate('/profile')`); Profile's back chevron calls
      `router.back()`.
- [ ] Each of the six `HealthConnectSectionStatus` values (excluding
      `'checking'`) renders distinct, correct copy and control per the
      Interfaces/API copy table — verified by
      `health-connect-section.test.tsx`, not by manual inspection.
- [ ] No new string is inline in JSX — all render via `t('profile.…')` /
      `t('healthConnect.…')`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope: capability and consent only, matching the ticket exactly.** No
  record is ever written to Health Connect — `REQUIRED_PERMISSIONS` is
  requested but nothing calls `insertRecords` or equivalent anywhere in
  this spec. No session-schema change, no sync-status indicator, no read
  from Health Connect. iOS/HealthKit is untouched — every new function
  short-circuits safely on non-Android per its own contract above, but no
  HealthKit-equivalent branch exists anywhere.
- **`declineCount` is a best-effort local proxy, not an OS-reported
  fact — flagged mismatch, not invented.** Health Connect gives no
  `NEVER_ASK_AGAIN`-equivalent signal. The one known drift case: if a
  user clears this app's storage (not a full uninstall — AsyncStorage
  survives an app restart but not a manual "clear storage") after having
  been recorded as `permissionExhausted`, the local counter resets to 0
  and the UI reverts to `'notGranted'`. A subsequent `GRANT ACCESS` tap
  then silently no-ops at the OS level (no dialog, since Health Connect
  itself is still in its real two-decline-locked state):
  `requestHealthConnectPermission()` resolves `false` with nothing shown,
  `grantAccess()`'s `false` branch calls `recordDeclinedAttempt()`, and
  the counter jumps straight back to 1 — still short of the `>= 2`
  threshold, so the display reads `'notGranted'` for one more tap than it
  should before a second no-op tap corrects it to `'permissionExhausted'`.
  This is a two-tap, not one-tap, self-correction, but the same accepted
  shape `ble-pairing-permissions/SPEC.md` already used for its own sticky-
  blocked-bit gap, not a broken flow.
- **Revoke-via-system-settings and Health-Connect-uninstall behavior
  needs on-device confirmation.** The precedence chain's design (re-run
  availability and permission checks on every foreground transition) is
  built to handle both per the ticket's Notes/verify section, but the
  exact resulting `HealthConnectSectionStatus` after a system-settings
  revoke — specifically, whether it's `'notGranted'` (decline count
  untouched, since a revoke isn't a decline) or something else — is a
  design intent stated here, not something verified against a real
  device or emulator. Flagged for implementation-time confirmation, not
  asserted as tested fact.
- **No shared button component introduced** (see Style & Conventions) —
  all actions are text links, matching `ble-pairing-permissions/SPEC.md`'s
  identical, explicit scope boundary.
- **The Profile screen's visual design is this spec's own judgment, not a
  matched mock.** Confirmed with the requester (see Context) — the
  section header/body/action layout follows `device.tsx`'s established
  section shape and existing `DESIGN.md` tokens throughout, but has not
  been reviewed against whatever mock the original ticket brief referred
  to.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered
  anywhere in this spec.
