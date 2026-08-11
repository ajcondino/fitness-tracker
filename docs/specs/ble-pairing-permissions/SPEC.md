# Feature: BLE Permission Handling for the Pairing Screen

## Intent

The DEVICE tab becomes a real pairing screen whose scan-status slot reflects the device's live Android Bluetooth-permission state — undetermined, requesting, granted, partially granted, denied, or blocked — re-checked every time the app returns to the foreground, with recovery paths (retry vs. Settings) that match what Android actually allows; Home gains the device card and hero CTA that lead into it. No scanning, connecting, or other BLE operation happens as a result of the grant — that's a follow-up ticket's work.

## Context

- **Problem statement:** `src/ble/permissions.ts` (from [ble-runtime-setup](../ble-runtime-setup/SPEC.md)) exposes a single `requestBlePermissions(): Promise<boolean>` — a coarse yes/no with no consumer anywhere in the app (confirmed: it's referenced only by its own test). It collapses Android's actual permission outcomes (per-permission grant, `NEVER_ASK_AGAIN`) into one boolean, which cannot represent "one of two permissions granted" or "blocked vs. recoverably denied" — both states this ticket must render distinctly. There is also no screen that calls it: `src/app/(tabs)/device.tsx` and `src/app/(tabs)/index.tsx` are both title+subtitle stubs from the nav-shell scaffold (`src/i18n/locales/en.json`'s `tabs.deviceSubtitle` already reads "Pair and manage your heart-rate monitor," but nothing behind it does that yet).
- **Current code:**
  - `src/ble/permissions.ts` — the boolean-returning function described above; branches on `Platform.Version`, not `expo-device` (which is installed at `~57.0.1` per `package.json` but imported nowhere in `src/`).
  - `src/app/(tabs)/device.tsx` / `src/app/(tabs)/index.tsx` — render only `ThemedText` title/subtitle inside a centered `ThemedView`; no state, no navigation targets, no cards.
  - `DESIGN.md` already specifies the Home-only **Device card** (`card-device` token: `surface-raised`/`outline-strong`, `lg` radius, 42px status-dot tile, `title-sm`/`data-md` text, trailing chevron) and the Home hero button's state-dependent label (`START WORKOUT` connected / `CONNECT A MONITOR` not, `xl` radius, 66px, `action-lg`, leading play triangle) — both referenced by name in this ticket's brief. `DESIGN.md` does **not** specify a pairing-screen scan-status bar, a "NEARBY DEVICES" list, or a "PREVIOUSLY PAIRED" section — none of those three exist as tokens, layout, or copy anywhere in the repo; this spec defines their structure and copy for the first time, scoped to what permission-state rendering requires.
  - No reusable button component exists anywhere in `src/components/` — `DESIGN.md`'s "Primary button" / "Ghost button" are documented visual specs, not extracted components. Per `CLAUDE.md`'s "don't invent cross-cutting structure," this spec does not create one (see Constraints).
- **User impact:** Tapping the Home status card, the Home CTA, or the DEVICE tab now reaches a real screen that honestly reflects whether the app can see or connect to Bluetooth devices yet, with the correct recovery action for each broken state, instead of a stub. Home and History remain unaffected when Bluetooth is off or unpermitted — nothing here gates their fixture-driven rendering.
- **Dependencies:**
  - `expo-device` (`~57.0.1`, already installed, currently unused) — this ticket's only consumer; `Device.platformApiLevel` replaces `Platform.Version` for the Android-12 (API 31) branch point, per this ticket's explicit direction.
  - `PermissionsAndroid`, `Platform`, `AppState`, `Linking` — all from the already-installed `react-native` core; no new packages.
  - Builds on `src/ble/permissions.ts` and no other part of [ble-runtime-setup](../ble-runtime-setup/SPEC.md) (`bleManager` itself is untouched — this ticket never calls `startDeviceScan` or any other manager method).

## Data Model

- `BlePermissionResult` (new, `src/ble/permissions.ts`) — the settled outcome of an OS-level permission read or request:
  ```ts
  type BlePermissionResult =
    | 'granted'
    | 'partial-scan-only' // BLUETOOTH_SCAN granted, BLUETOOTH_CONNECT denied (API 31+ only)
    | 'partial-connect-only' // BLUETOOTH_CONNECT granted, BLUETOOTH_SCAN denied (API 31+ only)
    | 'denied'
    | 'blocked'; // any requested permission is NEVER_ASK_AGAIN
  ```
  Below API 31 there is one permission (`ACCESS_FINE_LOCATION`), so only `'granted' | 'denied' | 'blocked'` are reachable — the two `partial-*` variants are structurally impossible pre-31 and this is enforced by the implementation, not just documented.
- `BlePermissionStatus` (new, `src/hooks/use-ble-permission-status.ts`) — `BlePermissionResult | 'undetermined' | 'requesting'`. The two extra variants are UI-session state layered on top of the OS's own binary "granted / not granted" read, because Android's `PermissionsAndroid.check()` cannot distinguish "never asked" from "asked and denied" — only an actual `request()` call's `NEVER_ASK_AGAIN` result can reveal blocked, and even that isn't re-derivable from `check()` alone afterward. Concretely:
  - `undetermined`: no `requestBlePermissions()` call has resolved in this component's lifetime, and the last `checkBlePermissions()` read was not `'granted'`.
  - `denied`: at least one `requestBlePermissions()` call has resolved in this component's lifetime with a non-blocked, non-granted result, and the most recent read still isn't `'granted'`.
  - Both map to the same OS truth (`not granted`) — the distinction is purely "has the user been asked yet, in this screen visit," so first-visit and retry copy can differ.
- No persistence. The "has this session asked before" bit and the sticky "blocked" bit both live in the hook's `useRef`s and reset on remount (e.g., app restart, or navigating away and back if the screen unmounts) — see Constraints for the resulting known gap.
- No changes to `bleManager` or any BLE domain type from `ble-runtime-setup`.

## Interfaces / API

- **`src/ble/permissions.ts`** (replaces the existing `requestBlePermissions(): Promise<boolean>` — it has no consumers to preserve compatibility for):
  - `export async function checkBlePermissions(): Promise<Exclude<BlePermissionResult, 'blocked'>>` — read-only, no dialog. Uses `PermissionsAndroid.check()` (per-permission; there is no `checkMultiple`). Always resolves `'granted'` on `Platform.OS !== 'android'`.
  - `export async function requestBlePermissions(): Promise<BlePermissionResult>` — may show the OS dialog. Uses `PermissionsAndroid.requestMultiple()`/`.request()`. Always resolves `'granted'` on `Platform.OS !== 'android'`.
  - Both branch on `Device.platformApiLevel` (from `expo-device`) `>= 31` vs. `< 31`, guarded for `Platform.OS !== 'android'` first (where `platformApiLevel` is `null`). If `platformApiLevel` is unexpectedly `null` on Android, fall back to the pre-31 (`ACCESS_FINE_LOCATION`) branch defensively and note this in a code comment — it shouldn't happen on a real device, but the type is `number | null`.
  - Result mapping for `requestBlePermissions()` on API 31+: `NEVER_ASK_AGAIN` on either permission → `'blocked'` (checked first — a mixed `NEVER_ASK_AGAIN` + `GRANTED` result is `'blocked'`, not `'partial-*'`, because retrying can't recover it). Otherwise both `GRANTED` → `'granted'`; scan-only `GRANTED` → `'partial-scan-only'`; connect-only `GRANTED` → `'partial-connect-only'`; otherwise `'denied'`. Pre-31: `GRANTED` → `'granted'`, `NEVER_ASK_AGAIN` → `'blocked'`, `DENIED` → `'denied'`.
- **`src/hooks/use-ble-permission-status.ts`** (new):
  ```ts
  export type BlePermissionStatus = BlePermissionResult | 'undetermined' | 'requesting';

  export function useBlePermissionStatus(): {
    status: BlePermissionStatus;
    requestAccess: () => void;
    openSettings: () => void;
  };
  ```
  - On mount and on every `AppState` transition to `'active'`, calls `checkBlePermissions()` (never `requestBlePermissions()` — foreground re-entry must not trigger an OS dialog) and updates `status`, per the mapping in Data Model. This is what satisfies "a grant must not be cached at mount" and "re-check on app foreground."
  - Once a `requestBlePermissions()` call resolves `'blocked'`, a sticky ref holds `status` at `'blocked'` on every subsequent foreground re-check until `checkBlePermissions()` reports full `'granted'` — a partial or denied read while the sticky bit is set does not downgrade the displayed state, since neither is recoverable without Settings. See Constraints for what happens across an app restart.
  - `requestAccess()`: sets `status` to `'requesting'`, calls `requestBlePermissions()`, marks the "asked this session" ref, and applies the result via the same mapping (including setting the sticky blocked bit).
  - `openSettings()`: calls `Linking.openSettings()` (`react-native`, no new dependency). The caller is responsible for only surfacing this action while `status === 'blocked'`.
- **`src/components/scan-status-bar.tsx`** (new, presentational):
  ```ts
  export type ScanStatusBarProps = {
    status: BlePermissionStatus;
    onRequestAccess: () => void;
    onOpenSettings: () => void;
  };
  export function ScanStatusBar(props: ScanStatusBarProps): JSX.Element;
  ```
  Renders a status dot + `t()` copy + at most one action, per state (see the copy table below). Color: `success` for `granted`; `danger` for `partial-scan-only` / `partial-connect-only` / `denied` / `blocked` (`DESIGN.md` has no dedicated warning color — see Style & Conventions for why `partial` reuses `danger` rather than inventing one); `onSurfaceFaint` for `undetermined` / `requesting`.
- **`src/components/device-card.tsx`** (new, presentational, per `DESIGN.md`'s Device card spec):
  ```ts
  export type DeviceCardProps = {
    status: 'connected' | 'disconnected';
    title: string;
    subtitle: string;
    onPress: () => void;
  };
  export function DeviceCard(props: DeviceCardProps): JSX.Element;
  ```
  This ticket's only caller (`index.tsx`) always passes `status="disconnected"` — there is no real connection state yet (that's the follow-up scanning/connection ticket). The prop exists now so that ticket only has to thread real state through, not touch this component's shape.
- **`src/app/(tabs)/device.tsx`** (rewritten into the pairing screen): keeps its existing `t('tabs.device')` / `t('tabs.deviceSubtitle')` header, then renders `ScanStatusBar` wired to `useBlePermissionStatus()`, then a NEARBY DEVICES section, then a PREVIOUSLY PAIRED section — see Files Modified and the copy table.
- **`src/app/(tabs)/index.tsx`** (Home, additive): keeps its existing header, adds a `DeviceCard` and a hero button below it, both navigating to the DEVICE tab via `useRouter().navigate('/device')` (typedRoutes resolves this against `src/app/(tabs)/device.tsx`).
- No endpoints, no persistence API, no change to `bleManager`'s public surface.

### Screen states and copy

All strings below are new keys in `src/i18n/locales/en.json`, namespaced `pairing` (device.tsx's new content) and `home` (index.tsx's new content) — `tabs.device`/`tabs.deviceSubtitle`/`tabs.home`/`tabs.homeSubtitle` are unchanged.

| `status`               | Reachable on             | Scan-status bar copy                                                               | Action              | NEARBY DEVICES                        | PREVIOUSLY PAIRED                                          |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------- | ------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `undetermined`         | mount, before first ask  | `○ BLUETOOTH ACCESS NEEDED`                                                        | `GRANT ACCESS`      | section hidden                        | `Grant Bluetooth access to see previously paired devices.` |
| `requesting`           | all API levels           | `○ REQUESTING ACCESS…`                                                             | none (dialog is up) | section hidden                        | `Grant Bluetooth access to see previously paired devices.` |
| `granted`              | all API levels           | `● BLUETOOTH ACCESS GRANTED`\*                                                     | none                | shown, empty: `No devices found yet.` | `No previously paired devices yet.`                        |
| `partial-scan-only`    | API 31+ only             | `● CAN'T CONNECT TO DEVICES` + detail `Bluetooth connect access is off.`           | `TRY AGAIN`         | section hidden                        | `Grant Bluetooth access to see previously paired devices.` |
| `partial-connect-only` | API 31+ only             | `● CAN'T SEE NEARBY DEVICES` + detail `Bluetooth scan access is off.`              | `TRY AGAIN`         | section hidden                        | `Grant Bluetooth access to see previously paired devices.` |
| `denied`               | all API levels, post-ask | `● BLUETOOTH ACCESS DENIED`                                                        | `TRY AGAIN`         | section hidden                        | `Grant Bluetooth access to see previously paired devices.` |
| `blocked`              | all API levels           | `● BLUETOOTH ACCESS BLOCKED` + detail `Turn it on in system settings to continue.` | `OPEN SETTINGS`     | section hidden                        | `Grant Bluetooth access to see previously paired devices.` |

\* `granted`'s copy is a deliberate placeholder — this ticket does no scanning, so it cannot show a live "● SCANNING… / N found" count. The follow-up scanning ticket replaces this exact copy once it has something to count; that ticket does not need to touch `ScanStatusBar`'s other six rows.

Home (fixed, since there is no real connection state yet):

| Element              | Copy                               |
| -------------------- | ---------------------------------- |
| Device card title    | `No monitor connected`             |
| Device card subtitle | `Tap to pair a heart-rate monitor` |
| Hero button label    | `CONNECT A MONITOR`                |

`en.json` additions:

```json
{
  "pairing": {
    "scanStatus": {
      "undetermined": "BLUETOOTH ACCESS NEEDED",
      "requesting": "REQUESTING ACCESS…",
      "granted": "BLUETOOTH ACCESS GRANTED",
      "partialScanOnly": "CAN'T CONNECT TO DEVICES",
      "partialScanOnlyDetail": "Bluetooth connect access is off.",
      "partialConnectOnly": "CAN'T SEE NEARBY DEVICES",
      "partialConnectOnlyDetail": "Bluetooth scan access is off.",
      "denied": "BLUETOOTH ACCESS DENIED",
      "blocked": "BLUETOOTH ACCESS BLOCKED",
      "blockedDetail": "Turn it on in system settings to continue.",
      "grantAction": "GRANT ACCESS",
      "retryAction": "TRY AGAIN",
      "openSettingsAction": "OPEN SETTINGS"
    },
    "nearbyDevices": {
      "header": "NEARBY DEVICES",
      "empty": "No devices found yet."
    },
    "previouslyPaired": {
      "header": "PREVIOUSLY PAIRED",
      "emptyGranted": "No previously paired devices yet.",
      "emptyNoAccess": "Grant Bluetooth access to see previously paired devices."
    }
  },
  "home": {
    "deviceCard": {
      "title": "No monitor connected",
      "subtitle": "Tap to pair a heart-rate monitor"
    },
    "connectCta": "CONNECT A MONITOR"
  }
}
```

## Files Created

| File                                                    | Purpose                                                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/hooks/use-ble-permission-status.ts`                | Owns the `BlePermissionStatus` state machine: mount/foreground checks, sticky blocked bit, request/openSettings actions.                                                                                           |
| `src/hooks/__tests__/use-ble-permission-status.test.ts` | Covers every state transition in the table above, including the AppState foreground re-check and the sticky blocked bit surviving a subsequent partial/denied read.                                                |
| `src/components/scan-status-bar.tsx`                    | Renders the copy/action/color for a given `BlePermissionStatus`.                                                                                                                                                   |
| `src/components/__tests__/scan-status-bar.test.tsx`     | Asserts the correct copy, color, and action visibility per status, including the `granted` placeholder text.                                                                                                       |
| `src/components/device-card.tsx`                        | `DESIGN.md`'s Device card, generic enough for the future `'connected'` state but only exercised as `'disconnected'` here.                                                                                          |
| `src/components/__tests__/device-card.test.tsx`         | Asserts title/subtitle render, status-dot color per `status` prop, and `onPress` firing.                                                                                                                           |
| `__mocks__/expo-device.ts`                              | Manual Jest mock exposing `platformApiLevel` as a getter (so tests can `jest.spyOn(Device, 'platformApiLevel', 'get')`, matching the existing `Platform.Version` test pattern) — `jest-expo` ships no mock for it. |

## Files Modified

| File                                       | Change                                                                                                                                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ble/permissions.ts`                   | Replace `requestBlePermissions(): Promise<boolean>` with `checkBlePermissions()` / `requestBlePermissions(): Promise<BlePermissionResult>`; branch on `Device.platformApiLevel` instead of `Platform.Version`.                                                       |
| `src/ble/__tests__/permissions.test.ts`    | Rewritten for the granular result type and the `expo-device` mock; covers `partial-*` and `blocked` outcomes on API 31+, and `blocked` pre-31.                                                                                                                       |
| `src/app/(tabs)/device.tsx`                | Add `ScanStatusBar` (wired to `useBlePermissionStatus()`), a NEARBY DEVICES section (rendered only when `status === 'granted'`), and a PREVIOUSLY PAIRED section (always rendered, permission-aware empty copy) below the existing header — header markup unchanged. |
| `src/app/(tabs)/__tests__/device.test.tsx` | New file (no prior test existed) — renders the screen for each `BlePermissionStatus` (mocking `useBlePermissionStatus`) and asserts section visibility/copy per the table above.                                                                                     |
| `src/app/(tabs)/index.tsx`                 | Add a `DeviceCard` (`status="disconnected"`, fixed copy) and a hero button below the existing header, both navigating to `/device`.                                                                                                                                  |
| `src/app/(tabs)/__tests__/index.test.tsx`  | New file — asserts the card and button render with the fixed copy and both call `router.navigate('/device')` on press (mocking `expo-router`'s `useRouter`).                                                                                                         |
| `src/i18n/locales/en.json`                 | Add the `pairing` and `home` keys shown above.                                                                                                                                                                                                                       |

## Implementation Steps

1. Confirm `expo-device`'s `Device.platformApiLevel` shape against https://docs.expo.dev/versions/v57.0.0/sdk/device/ per `AGENTS.md` (already verified for this spec: `number | null`, Android-only, non-null on a real Android device).
2. Create `__mocks__/expo-device.ts`, defining `platformApiLevel` via `Object.defineProperty(..., 'get', ...)` so it's spy-able the same way tests already spy on `Platform.Version`.
3. Rewrite `src/ble/permissions.ts` per the Interfaces/API contract; update `src/ble/__tests__/permissions.test.ts` for the new return type and the API-level source, covering: granted / partial-scan-only / partial-connect-only / denied / blocked on API 31+, and granted / denied / blocked pre-31.
4. Create `src/hooks/use-ble-permission-status.ts` and its test, covering: initial `checkBlePermissions()` on mount, `undetermined` vs. `denied` first-ask distinction, the `AppState` `'active'` re-check (mock `AppState.addEventListener`), `requestAccess()`'s full transition set, the sticky blocked bit surviving a later partial/denied `checkBlePermissions()` read, and `openSettings()` calling `Linking.openSettings()`.
5. Create `src/components/scan-status-bar.tsx` and its test, rendering all seven states from the copy table.
6. Create `src/components/device-card.tsx` and its test.
7. Add the `pairing` and `home` keys to `src/i18n/locales/en.json`.
8. Update `src/app/(tabs)/device.tsx` to compose `ScanStatusBar` plus the two new sections, additively below the existing header; add `src/app/(tabs)/__tests__/device.test.tsx`.
9. Update `src/app/(tabs)/index.tsx` to add `DeviceCard` plus the hero button, additively below the existing header; add `src/app/(tabs)/__tests__/index.test.tsx`.
10. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- `src/ble/permissions.ts` stays a plain async-function module (no class), per `ble-runtime-setup`'s established convention for this file.
- `src/hooks/use-ble-permission-status.ts` follows `src/hooks/use-theme.ts`'s precedent of being the single seam a screen consumes — no context/provider, since only one screen needs this state right now.
- `ScanStatusBar` and `DeviceCard` are composed/feature components under `src/components/` directly (not `src/components/ui/`), per `CLAUDE.md`'s primitive-vs-composed split — both are specific to the pairing/Home domain, not generic presentational primitives like `themed-text.tsx`.
- **Deliberately not building a shared Primary/Ghost button component.** `DESIGN.md` documents both, but no button component exists anywhere in the repo yet, and per `CLAUDE.md`'s "don't invent cross-cutting structure," this spec doesn't introduce one on the strength of a single hero button. `index.tsx`'s hero button is styled inline with `StyleSheet.create`, matching every other screen's current approach — extracting a shared button is a call for whoever next needs a second one.
- **`partial-*` states reuse `danger`, not a new color.** `DESIGN.md` has exactly two status colors (`success`, `danger`) and explicitly says "don't add a second accent color." A three-way traffic-light (green/amber/red) would need a token that doesn't exist; `partial` is still a broken state functionally, so it's styled identically to `denied`/`blocked` and differentiated by copy alone.
- Status-dot glyphs are the literal `●`/`○` characters via `ThemedText`, matching this ticket's own worked example and the tab bar's precedent of drawing glyphs directly rather than pulling in an icon set (`expo-symbols` is SF Symbols — Apple-only, and this app doesn't build iOS).
- All new copy goes through `t('pairing.…')` / `t('home.…')` per `CLAUDE.md`'s i18n section — no inline JSX string literals.
- New tests are colocated under `src/app/(tabs)/__tests__/`, following "colocated with the code under test" — `CLAUDE.md`'s literal example path (`src/app/__tests__/index.test.tsx`) predates the `(tabs)` route group and is stale here, same as the i18n spec already flagged for its own reasons.
- Per this skill's default and the only real precedent in this repo (both existing specs live at `docs/specs/<feature>/SPEC.md`), this spec is filed there rather than at the flat `docs/ble-permissions.md` path named in the ticket brief — `CLAUDE.md`'s literal "Documentation layout" text is superseded by actual repo convention, exactly as `ble-runtime-setup`'s spec already noted for itself.

## Acceptance Criteria

- [ ] `checkBlePermissions()` and `requestBlePermissions()` branch on `Device.platformApiLevel`, not `Platform.Version`.
- [ ] All five `BlePermissionResult` values are reachable from `requestBlePermissions()` on API 31+ with the correct precedence (`blocked` wins over `partial-*`); only `granted` / `denied` / `blocked` are reachable pre-31.
- [ ] `useBlePermissionStatus()` re-checks on mount and on every foreground transition, without ever calling `requestBlePermissions()` automatically (verified by asserting the OS request spy is not called from the foreground-check test).
- [ ] `undetermined` and `denied` render different copy for the same underlying "not granted" OS read, differentiated only by whether this session has asked before.
- [ ] Once `blocked` is reached, a subsequent `checkBlePermissions()` resolving `partial-*` or `denied` does not change the rendered status away from `blocked`; only a `granted` read does.
- [ ] No retry action renders in the `blocked` state — only `OPEN SETTINGS`, calling `Linking.openSettings()`.
- [ ] The NEARBY DEVICES section renders only when `status === 'granted'`; it is absent (not merely empty) in every other state.
- [ ] The PREVIOUSLY PAIRED section always renders, with `emptyGranted` copy iff `status === 'granted'` and `emptyNoAccess` copy otherwise.
- [ ] Home's device card and hero button both navigate to `/device` and always render the fixed disconnected-state copy (no conditional connected branch is implemented).
- [ ] No new string is inline in JSX — all render via `t('pairing.…')` / `t('home.…')`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: permission grant/deny/blocked rendering only. No `startDeviceScan`, no discovery, no connection, no characteristic work — `bleManager` is not called anywhere by this ticket. A follow-up ticket replaces the `granted` row's placeholder copy with live scan results and populates NEARBY DEVICES / PREVIOUSLY PAIRED with real data.
- **No iOS**: this app doesn't build or update iOS; no iOS permission strings or branches are introduced.
- **Adapter power state (Bluetooth off) is out of scope.** `bleManager.state()`/`onStateChange` (already available from `ble-runtime-setup`) are not consulted here — a `granted`-but-Bluetooth-off device shows the `granted` placeholder row regardless. Noting this so it isn't mistaken for an oversight: it's a distinct concern for a later ticket, per the ticket brief.
- **Blocked detection does not survive an app restart.** The sticky "blocked" bit is in-memory (`useRef`) and resets on remount. After a restart, a truly blocked permission set will render `undetermined` until the user taps `GRANT ACCESS` once — that tap silently no-ops at the OS level (no dialog, since it's still `NEVER_ASK_AGAIN` under the hood) and immediately corrects the displayed state to `blocked`. This is a one-tap correction, not a broken flow, and adding persistence (there is no storage dependency in this app yet) to avoid it is out of scope.
- **Home and Device tab screens keep their existing headers verbatim** — this is an additive change to two working stubs, not a rewrite, per `CLAUDE.md`.
- **No shared button component is introduced** (see Style & Conventions) — this is a scope boundary, not an oversight, and should not be expanded without a second real caller.
- **`en.json`'s `pairing`/`home` namespaces do not yet cover a connected/live state** for the Device card or hero button — both are fixed to their disconnected copy in this ticket.
