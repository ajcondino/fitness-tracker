# Feature: BLE Runtime Setup

## Intent

`react-native-ble-plx` is installed, configured for Android-only central-mode scanning with no background operation, and exposed as a single app-wide `BleManager` instance plus an Android runtime-permission helper — so a future scanning/pairing feature has native BLE plumbing to build on without touching config plugins or permission mechanics itself.

## Context

- **Problem statement:** No BLE dependency, config plugin, or manager module exists anywhere in the repo (confirmed absent from `package.json` and `app.json`). `DESIGN.md` already specifies BLE-shaped UI tokens (`card-device` — "connected-monitor card, Home"; `chip-device` — device pill on Live/History; `status-connected`/`status-disconnected` colors) and `src/app/(tabs)/device.tsx` is a placeholder screen (title + subtitle only, no logic), but nothing wires an actual BLE connection.
- **Current code:** `src/app/(tabs)/device.tsx` renders `t('tabs.device')` / `t('tabs.deviceSubtitle')` inside `ThemedView`/`ThemedText` — no state, no native module usage. `CLAUDE.md`'s "Read the versioned docs before writing Expo code" section and `pnpm android`/`pnpm ios` command notes already call out BLE explicitly as requiring a dev-client build (`expo-dev-client` is already installed at `~57.0.10`), not Expo Go.
- **User impact:** No user-visible change. This is infrastructure: a later feature (device pairing/scanning) will consume `src/ble/manager.ts` and `src/ble/permissions.ts` instead of constructing its own `BleManager` or permission logic.
- **Dependencies:**
  - New runtime package: `react-native-ble-plx` (install latest — verify at implementation time that it is ≥3.2.0, which fixes a known bug where the bundled config plugin imported the removed `@expo/config-plugins` path instead of the `expo/config-plugins` subpath, breaking `expo prebuild` on SDK 56+; confirm current behavior against https://docs.expo.dev/versions/v57.0.0/ per `AGENTS.md`).
  - Do **not** install `@config-plugins/react-native-ble-plx` — deprecated; the library now ships its own `app.plugin.js`, auto-discovered by name in `app.json`'s `plugins` array.
  - No new dependency for permissions — `PermissionsAndroid` and `Platform` come from the already-installed `react-native` core.
  - `android/` is checked into this repo (not gitignored), so applying the new config plugin requires a **clean** native prebuild (`npx expo prebuild --platform android --clean`) followed by `pnpm android` — both are manual, developer-run steps, out of scope for this spec's automated implementation steps (see Constraints).

## Data Model

- No new persisted data model. `bleManager` is a single in-memory `BleManager` instance (from `react-native-ble-plx`), constructed once at module load and never re-constructed for the life of the process.
- No new TypeScript domain types are introduced — `src/ble/manager.ts` re-exports the library's own `BleManager` instance; `src/ble/permissions.ts` introduces one function type, `() => Promise<boolean>`.

## Interfaces / API

- **`src/ble/manager.ts`** (side-effecting on import, mirroring `src/i18n/index.ts`'s singleton pattern — constructing `BleManager` runs once per process; subsequent imports reuse the module-cached instance):
  - `export const bleManager: BleManager` — the singleton, constructed with `new BleManager()` at module scope. No options object (default config is sufficient for Android central-mode use).
  - JSDoc comment notes the Metro Fast Refresh caveat: editing this file during development can cause Metro to re-evaluate the module and construct a second native `BleManager`, leaking the first. Not solved here — no HMR guard or `destroy()` call is added, since there is no consumer yet to define a teardown lifecycle around.
- **`src/ble/permissions.ts`**:
  - `export async function requestBlePermissions(): Promise<boolean>` — Android-only (`Platform.OS !== 'android'` short-circuits to `true`, since this app doesn't build/update iOS, but the guard keeps the function callable safely on web/Jest without throwing).
    - On `Platform.Version >= 31` (Android 12+): calls `PermissionsAndroid.requestMultiple([BLUETOOTH_SCAN, BLUETOOTH_CONNECT])`, returns `true` only if both are `PermissionsAndroid.RESULTS.GRANTED`.
    - On `Platform.Version < 31`: calls `PermissionsAndroid.request(ACCESS_FINE_LOCATION)`, returns `true` only if granted.
  - No caching/memoization of the result — every call re-checks live OS state, matching `PermissionsAndroid`'s own contract (it already short-circuits if permission is already granted).
- **`app.json` `expo.plugins` entry:** `["react-native-ble-plx", { "isBackgroundEnabled": false, "neverForLocation": true }]`. `isBackgroundEnabled: false` is explicit (matches the library default, documents "no background" intent). `neverForLocation: true` asserts this app never derives physical location from scan results, letting the plugin mark `BLUETOOTH_SCAN` with Android's `neverForLocation` permission flag on API 31+ (this does not remove the `ACCESS_FINE_LOCATION` requirement on API <31 — that's a platform requirement handled in `requestBlePermissions`, not something the flag changes). iOS-only options (`modes`, `bluetoothAlwaysPermission`) are omitted — this project doesn't build or update iOS.
- No new commands, endpoints, or app-facing UI surface — this is internal wiring, not consumed by any screen in this spec.

## Files Created

| File                                    | Purpose                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ble/manager.ts`                    | Module-scope `BleManager` singleton, constructed once per process.                                                                                                                       |
| `src/ble/permissions.ts`                | Android runtime-permission request helper, branching on API level.                                                                                                                       |
| `src/ble/__tests__/manager.test.ts`     | Confirms the singleton constructs via the Jest mock and importing the module twice returns the same reference.                                                                           |
| `src/ble/__tests__/permissions.test.ts` | Confirms the API-31+ branch requests `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` and the pre-31 branch requests `ACCESS_FINE_LOCATION`, and that grant/deny results map to the correct boolean. |
| `__mocks__/react-native-ble-plx.ts`     | Jest manual mock for the native module (mirrors `__mocks__/expo-localization.ts`), auto-applied by Jest for any import of `react-native-ble-plx`.                                        |

## Files Modified

| File             | Change                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`   | Add `react-native-ble-plx` dependency.                                                                                                                                                                                             |
| `app.json`       | Add the `["react-native-ble-plx", { "isBackgroundEnabled": false, "neverForLocation": true }]` entry to `expo.plugins`, alongside the existing `expo-router`/`expo-splash-screen`/`@sentry/react-native/expo`/`expo-font` entries. |
| `pnpm-lock.yaml` | Regenerated by `pnpm install` after the dependency addition — not hand-edited.                                                                                                                                                     |

## Implementation Steps

1. Verify the current `react-native-ble-plx` release and its Expo SDK 57 compatibility against its own repository/changelog (Expo's own docs do not cover this third-party library), per `AGENTS.md`'s instruction to check versioned behavior before writing Expo-adjacent code. Then run `pnpm add react-native-ble-plx`.
2. Add the plugin entry to `app.json`'s `expo.plugins` array as specified in Interfaces / API.
3. Create `__mocks__/react-native-ble-plx.ts`: a mock `BleManager` class (constructor + `jest.fn()` stubs for `state`, `onStateChange`, `startDeviceScan`, `stopDeviceScan`, `connectToDevice`, `cancelDeviceConnection`, `isDeviceConnected`, `discoverAllServicesAndCharacteristicsForDevice`, `monitorCharacteristicForDevice`, `destroy`) and a mock `State` enum (`Unknown`, `Resetting`, `Unsupported`, `Unauthorized`, `PoweredOff`, `PoweredOn`).
4. Create `src/ble/manager.ts` implementing the singleton per the Interfaces / API contract.
5. Create `src/ble/permissions.ts` implementing `requestBlePermissions()` per the Interfaces / API contract.
6. Add `src/ble/__tests__/manager.test.ts` and `src/ble/__tests__/permissions.test.ts` per the Files Created descriptions, mocking `PermissionsAndroid.requestMultiple`/`request` and `Platform.Version` per test case.
7. Run the repository's standard checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
8. Hand off to the developer for the manual native steps in Constraints (clean prebuild + dev-client rebuild) — not run as part of this implementation.

## Style & Conventions

- `src/ble/manager.ts` follows `src/i18n/index.ts`'s established singleton shape: side-effecting construction at module scope, no lazy factory function, no React context/provider (per `src/hooks/use-theme.ts`'s precedent that a static shared reference doesn't need one).
- `src/ble/permissions.ts` is a plain async function module, no class, consistent with the repo's existing preference for small named-export functions over class-based utilities.
- Follow the `@/*` path alias (`@/ble/manager`, `@/ble/permissions`) per `tsconfig.json`, not relative imports across directories, per `CLAUDE.md`'s Architecture section.
- `__mocks__/react-native-ble-plx.ts` matches `__mocks__/expo-localization.ts`'s convention exactly: a manual root-level mock, no `jest.mock()` call needed at test call sites.
- This is a new top-level `src/ble/` directory — the only existing analogous precedent is `src/i18n/`, a feature-domain module rather than a UI/shared-structure concern; per `CLAUDE.md`'s "don't invent cross-cutting structure" guidance, this was confirmed with the requester before this spec was written (2026-08-10) rather than assumed.
- Per `CLAUDE.md`'s Documentation layout section literally, specs would live at flat `docs/*.md`; the only actual precedent in this repo (`docs/specs/i18n-l10n-setup/SPEC.md`) uses this skill's `docs/specs/<feature>/SPEC.md` shape instead — followed here as the real convention over the unused written rule.

## Acceptance Criteria

- [ ] `react-native-ble-plx` is installed and appears in `package.json`/`pnpm-lock.yaml`; `@config-plugins/react-native-ble-plx` is absent.
- [ ] `app.json`'s `expo.plugins` contains the `react-native-ble-plx` entry with `isBackgroundEnabled: false` and `neverForLocation: true`.
- [ ] `src/ble/manager.ts` exports a single `bleManager` constructed exactly once; re-importing the module elsewhere returns the same reference (verified by the unit test, not by manual inspection).
- [ ] `src/ble/permissions.ts`'s `requestBlePermissions()` requests `BLUETOOTH_SCAN`+`BLUETOOTH_CONNECT` on API 31+ and `ACCESS_FINE_LOCATION` below that, returning `true` only when all requested permissions are granted.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.
- [ ] No screen (`device.tsx` or otherwise) is modified by this change — plumbing only.

## Constraints

- **Scope**: plumbing only. No scanning, connection, or characteristic logic; no consuming React hook; no `device.tsx` change. A follow-up ticket builds the actual pairing/scanning feature on top of `bleManager` and `requestBlePermissions()`.
- **No iOS**: `modes`/`bluetoothAlwaysPermission` plugin options and any iOS permission strings are out of scope — this project only builds/updates Android (per `CLAUDE.md`'s EAS Build & Updates section).
- **No background BLE**: `isBackgroundEnabled: false` is a hard requirement of this ticket, not a default left unexamined.
- **Native regeneration is manual, developer-run work, not part of this spec's automated implementation**: because `android/` is checked into the repo, applying the new plugin requires `npx expo prebuild --platform android --clean` (destructive — regenerates `android/` from scratch, must be reviewed via `git diff` before committing) followed by `pnpm android` to rebuild the dev client. Both require an interactive terminal/attached device and are explicitly the developer's steps, not something run unattended as part of implementing this spec.
- **Known upstream risk**: if `expo prebuild` fails with `Cannot find module '@expo/config-plugins'` inside `node_modules/react-native-ble-plx/plugin/build/withBLE.js`, that's the SDK 56+ compatibility bug referenced in Dependencies — confirm the installed version is patched; the documented (temporary) workaround is adding `@expo/config-plugins` as a devDependency, which `expo-doctor` will flag as an unwanted direct dependency, so it should not become permanent.
- **Metro Fast Refresh caveat**: acknowledged in `src/ble/manager.ts`'s JSDoc, not solved by this spec — no HMR guard is implemented since there's no real consumer/lifecycle yet to design around.
