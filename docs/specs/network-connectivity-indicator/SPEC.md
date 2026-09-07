# Feature: Network Connectivity Indicator

## Intent

A user who loses network connectivity sees a small, unobtrusive signal that
they're offline — never a hang, a generic failure, or a UI that implies the
app itself is broken — and the one action that genuinely cannot proceed
offline (Google sign-in) explains that plainly instead of attempting and
failing silently.

## Context

- **Problem statement:** No connectivity awareness exists anywhere in this
  repo today (confirmed absent: no `@react-native-community/netinfo`
  dependency in `package.json`, no `NetInfo`/`useNetInfo` reference anywhere
  in `src/`). Two concrete gaps this creates:
  - `src/auth/google-sign-in.ts`'s `signInWithGoogle()` has no offline-aware
    path. Reading its own header comment and error mapping (:49-73), a
    GoogleSignin-side failure while offline (Play Services unreachable, the
    native picker failing to load account data) has "no reliable symbolic
    code to check" per that comment and resolves the generic `{ status:
'error', reason: 'unknown' }` — rendered by `AccountSection` (:65-92) as
    the equally generic `account.error.title`/`account.error.body`
    ("Couldn't sign in" / "Check your connection and try again"). This
    already hints at connectivity but only after a real, possibly slow
    native round-trip has been attempted and failed — not a proactive
    explanation, and not guaranteed to surface promptly (`GoogleSignin.signIn()`
    invoking the native account picker while offline is exactly the "hang"
    shape this ticket calls out, not a fast rejection).
  - No screen anywhere shows connectivity state. A user who loses
    connectivity mid-session has no way to know why, e.g., a Firestore sync
    silently queuing (see below) looks identical to it happening instantly.
- **Current code:**
  - `src/hooks/use-auth.ts` / `src/auth/google-sign-in.ts` — landed per
    `docs/specs/firebase-auth-google-sign-in/SPEC.md`. `signInWithGoogle()`
    never rejects, always resolving a `SignInResult`
    (`{status:'success'}|{status:'cancelled'}|{status:'error',reason}`).
    This ticket adds a proactive offline check **in front of** this call —
    see Interfaces/API — rather than changing its own error-mapping, which
    stays exactly as landed.
  - `src/components/account-section.tsx` — the presentational card
    `profile.tsx` already wires to `useAuth()`. Its `'signedOut'`/`'error'`
    branches (:45-54, :65-109) each render the same `GoogleSignInButton`
    (`testID="account-sign-in-action"`). This ticket adds one new prop
    (`isOffline`) and one new branch of copy/disabled state to this same
    component — no other prop or state changes.
  - `src/hooks/use-preferences-sync.ts` / `src/sync/preferences-store.ts` —
    landed per `docs/specs/cloud-settings-sync-firestore/SPEC.md`. Its push
    effect is already fire-and-forget with a swallowed rejection
    (`.catch(() => {})`), and that spec's own Constraints section states:
    _"The offline/online indicator is not built here... neither
    [`writeRemotePreferences`'s rejection nor Firestore's own network-state
    listeners] is read or exposed anywhere in this ticket's own code."_
    Concretely, this means **the units-preference acceptance criterion below
    is already satisfied by landed code and needs no new sync-layer
    change** — `@react-native-firebase/firestore`'s native SDK persists the
    write locally and flushes it once connectivity returns, and the caller
    never sees or surfaces a rejection either way. This ticket's job for
    that criterion is to confirm it, not build it (see Acceptance).
  - `src/app/_layout.tsx` — the one file every screen mounts underneath
    (`SafeAreaView` -> `Stack` -> each `Stack.Screen`: `(tabs)`,
    `live-workout`, `session/[id]`, `profile`). This is the single
    integration point for an indicator that must appear identically across
    every screen without threading a prop through each one.
  - `src/components/scan-status-bar.tsx` — this app's established "a status
    is a dot glyph plus a word, same color, `actionSm` typography" grammar
    (:395-398's `{filled ? '●' : '○'} {text}` line, `COLOR_BY_STATUS`
    lookup). This ticket's connectivity banner reuses that exact grammar
    rather than inventing a second one.
  - `src/components/device-row.tsx:148` — this app's established disabled-
    control treatment (`opacity: disabled ? 0.5 : 1` on an otherwise-
    unchanged control), reused here for the sign-in button's offline-
    disabled state rather than a new visual language for "disabled."
  - **No existing top-level connectivity banner or persistent status strip
    exists in `DESIGN.md`.** `DESIGN.md`'s one closest analog, `Toast`
    (Components, "Toast — absolutely positioned 24px from each gutter, 110px
    from the bottom so it clears the tab bar... a `success` dot plus
    `body-sm` copy"), is unused anywhere in `src/` today and is fixed to a
    `success`-colored, bottom-anchored, tab-bar-clearing shape — wrong on
    all three counts for this ticket: the indicator is not a success state,
    two of the four screens it must appear on (`live-workout`,
    `session/[id]`, `profile`) have no floating tab bar to clear (and
    `live-workout` has its own bottom-anchored session controls a
    bottom-floating bar risks sitting over), and per `CLAUDE.md`'s "the
    indicator must not imply the app is degraded" this is a neutral status,
    not a `danger` one either. Per `CLAUDE.md`'s "shared components... are
    decided by hand; if something shared is missing, say so rather than
    creating it" — **this is flagged, not silently invented.** The design
    proposed below (Interfaces/API's `ConnectivityBanner`) composes only
    already-declared tokens (`surfaceMuted`, `outlineSoft`, `onSurfaceMuted`,
    `actionSm`) in a new arrangement (an edge-to-edge top strip, not a
    floating card) rather than adding any new color/spacing token, but the
    arrangement itself has no `DESIGN.md` precedent and should get a design
    look before or during implementation.
- **User impact:** Going offline shows a thin, wordless-alarm strip at the
  top of every screen ("OFFLINE") that disappears the instant connectivity
  returns; nothing else changes. Attempting to sign in while offline shows a
  clear explanation in place of the normal sign-in prompt, with the same
  button now disabled, instead of triggering a native flow that may hang or
  fail with unrelated-looking copy.
- **Dependencies:** `@react-native-community/netinfo` (new). No other new
  package. Depends on nothing landed since `cloud-settings-sync-firestore`
  (confirmed landed, per Context above) other than that ticket's own
  explicit hand-off of "the indicator" to this one.

## Data Model

```ts
// src/hooks/use-network-status.ts (new)

export type NetworkStatus = {
  isOffline: boolean;
};
```

- **No new persisted state, no store.** Connectivity is inherently transient,
  observed-not-owned state — nothing here is written to AsyncStorage,
  Firestore, or any other store in this repo. This mirrors
  `use-ble-permission-status.ts`'s "derive from an OS/library signal, hold no
  disk state of its own" shape, not `saved-device.ts`'s persistence shape.
- **Which NetInfo signal this reflects (ticket's own "decide and state it"
  note):** `isInternetReachable`, not merely `isConnected`. A device
  associated with Wi-Fi but behind a captive portal or a dead access point
  reports `isConnected: true` while `isInternetReachable: false` — exactly
  the "captive portals and dead wifi are common" case the ticket calls out
  — and this indicator must catch that, not just a radio-level disconnect.
  Concretely (mirroring the weather app's `useNetworkStatus` hook, per the
  ticket's "check what's reusable" note — that hook's own
  `isOnline = isConnected !== false && isInternetReachable !== false`
  logic is reused verbatim as the raw signal here):
  - `isConnected === false` -> offline (no radio link at all).
  - `isInternetReachable === false` -> offline (linked but not reachable —
    the captive-portal/dead-wifi case).
  - Either value `null` (NetInfo's own "not yet determined" state — true
    briefly on cold start, and briefly again while NetInfo re-probes
    reachability after any network change) -> treated as **online**
    (optimistic), matching the weather app's `isUnknown` skip. This is what
    prevents a flash of the banner during NetInfo's own brief re-probe
    window on every network change, on top of this ticket's own debounce
    below.
- **Debounce, since NetInfo's raw signal flips instantly:** entering the
  offline state is delayed 2500ms behind the raw signal; leaving it is
  immediate. Rationale — a transient Wi-Fi handoff or cell-tower switch
  typically resolves within one to two seconds (the ticket's own "confirm
  the indicator doesn't flicker on brief connectivity changes... a short
  debounce is usually needed"), so a short one-directional delay absorbs
  those without ever delaying the good news that connectivity is back. This
  is the one respect in which this hook's logic goes beyond the weather
  app's own (which tracks `lastOnlineAt` for a different purpose and has no
  banner to debounce).
- **Deliberately no shared store (Zustand or otherwise) despite two call
  sites** (`_layout.tsx` for the banner, `profile.tsx` for sign-in gating —
  see Interfaces/API). Each mounts its own `useNetworkStatus()` instance.
  `usePairingStore` is this repo's precedent for a _shared_ external-system
  store, adopted there because BLE connection state must stay consistent
  while multiple screens read and act on it concurrently. Connectivity has
  no equivalent hazard: both call sites derive the same raw signal from the
  same underlying NetInfo state and apply the identical debounce constant,
  so they agree well within a frame in the steady state. The one accepted
  edge case — navigating into Profile while already offline can briefly
  (up to 2500ms) leave the profile screen's own `isOffline` at `false`
  while the global banner already reads `true`, since profile's hook
  instance starts its own debounce timer at mount — is the same class of
  documented, accepted transient effect `cloud-settings-sync-firestore/SPEC.md`
  recorded for its own sign-in/pull race, not a functional gap: nothing in
  either Acceptance criterion below depends on the two staying
  millisecond-synchronized, and the mismatch self-resolves within one
  debounce window.

## Interfaces / API

### `src/hooks/use-network-status.ts` (new)

```ts
export function useNetworkStatus(): NetworkStatus;
```

- Calls `useNetInfo()` (`@react-native-community/netinfo`), destructuring
  `isConnected`/`isInternetReachable`.
- Derives the raw signal per Data Model
  (`rawIsOffline = isConnected === false || isInternetReachable === false`,
  a `null` on either treated as not-offline).
- A `useState<boolean>(false)` holds the debounced `isOffline`; a `useRef`
  holds the pending `setTimeout` handle.
- `useEffect` keyed on `rawIsOffline`:
  - `rawIsOffline === true` and no timer is already pending -> start a
    2500ms timer that sets `isOffline = true`.
  - `rawIsOffline === false` -> clear any pending timer and set
    `isOffline = false` immediately.
  - Cleanup clears the pending timer on unmount or before the effect
    re-runs, so a rapid online/offline/online flap never leaves a stale
    timer that fires after the state has already recovered.
- Returns `{ isOffline }`.

**Verify at implementation time** (per `AGENTS.md`): the installed
`@react-native-community/netinfo` version's exact `useNetInfo()` return
shape (`isConnected`/`isInternetReachable`'s nullability) against its own
docs — written here from the same version the weather app pins
(`11.4.1`), not confirmed against this project's own Expo SDK 57 /
RN 0.86.2 toolchain. Also confirm whether this package needs an `app.json`
plugin entry or config beyond autolinking (unlike `@react-native-firebase/*`,
most NetInfo releases ship no Expo config plugin — confirm rather than
assume, the same caution `cloud-settings-sync-firestore/SPEC.md` applied to
`@react-native-firebase/firestore`'s own plugin question).

### `src/components/connectivity-banner.tsx` (new, composed)

```ts
export type ConnectivityBannerProps = {
  isOffline: boolean;
};
export function ConnectivityBanner({
  isOffline,
}: ConnectivityBannerProps): React.JSX.Element | null;
```

Renders `null` when `isOffline` is `false` — no space is reserved, no
"you're connected" state exists, per the ticket's own "nothing is shown when
online" requirement. When `isOffline` is `true`: an edge-to-edge
(full-width, no horizontal inset, no rounded corners — deliberately
distinct from every card-shaped section in this app, reading as a
system-level strip rather than a piece of screen content) `ThemedView`
strip, `background="surfaceMuted"`, a single `outlineSoft` 1px bottom
border, containing one line: `● {t('connectivity.offline')}` in `actionSm`/
`onSurfaceMuted` — the exact "dot glyph plus a word, same color, `actionSm`"
grammar `scan-status-bar.tsx` already established (:395-398), reused rather
than introducing a second status-line convention. No icon component, no
animation (`DESIGN.md`'s motion list is exhaustive — live dot, BPM ring,
scan-bar sweep — and a persistent connectivity strip is none of those).

### `src/app/_layout.tsx` (modified)

```tsx
const { isOffline } = useNetworkStatus();
// ...
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
  <StatusBar style="light" />
  <ConnectivityBanner isOffline={isOffline} />
  <Stack>...</Stack>
</SafeAreaView>;
```

One new hook call and one new element, directly above the existing `<Stack>`
— inside the existing `SafeAreaView`'s top-inset area, so the strip sits
below the OS status bar on every screen without any per-screen change.
Inline (not absolutely positioned): when shown, it pushes `<Stack>`'s
content down by its own height for as long as connectivity is down; when
hidden, no space is reserved. This is a deliberate departure from `Toast`'s
absolute-overlay shape (see Context) — a brief, occasional layout shift on
a state that can persist for an unpredictable duration reads more honestly
than floating an overlay above content that could obscure a control
mid-tap on `live-workout`'s bottom-anchored session buttons.

### `src/components/account-section.tsx` (modified)

```ts
export type AccountSectionProps = {
  status: AccountSectionStatus;
  user: AuthUser | null;
  isOffline: boolean; // new
  onSignIn: () => void;
  onSignOut: () => void;
};
```

- New `isOffline` prop, read only when `status === 'signedOut'` or
  `status === 'error'` (the two states whose body already renders the
  `GoogleSignInButton` — see Context). `'checking'`/`'signingIn'`/`'signedIn'`
  are unaffected: this ticket doesn't gate an already-in-flight attempt or
  an already-signed-in session, only the entry point.
- When gated (`isOffline && (status === 'signedOut' || status === 'error')`):
  - Body copy becomes `t('account.offline.body')` in place of
    `account.signedOut.body` / the `account.error.*` title+body pair —
    stating plainly that sign-in needs a connection, not a generic
    "something went wrong."
  - `GoogleSignInButton` renders `disabled`, with
    `style={[..., { opacity: 0.5 }]}` — the exact `device-row.tsx:148`
    disabled convention (opacity halving on an otherwise-unchanged control),
    and does not call `onSignIn` while disabled (a `Pressable`'s own
    `disabled` prop already blocks its `onPress`, so no change to
    `onSignIn`/`useAuth`/`google-sign-in.ts` is needed — the entire gate is
    presentational).
- Not gated (`isOffline === false`, or `status` is anything else): every
  existing branch, copy key, and control is byte-for-byte unchanged. This
  keeps the diff additive on an already-shipped, working component per
  `CLAUDE.md`.
- If connectivity drops **during** an in-flight `signingIn` attempt, no new
  handling is added: the existing `signInWithGoogle()` call already resolves
  either `'error'` (most likely, since the native flow can no longer
  complete) or, rarely, `'success'` if it had already gotten far enough —
  landing back on the gated `'error'` branch above on the very next render,
  since `isOffline` is live. No mid-flight cancellation is introduced,
  matching the ticket's own "no retry logic" / "don't change existing
  behavior" scope.

### `src/app/profile.tsx` (modified)

```ts
const { isOffline } = useNetworkStatus();
// ...
<AccountSection
  status={authStatus}
  user={user}
  isOffline={isOffline}
  onSignIn={signInWithGoogle}
  onSignOut={signOut}
/>
```

One new hook call, one new prop passed through. No other change — the
existing `useAuth()`, `useHealthConnectSettings()`, `useUnitsPreference()`,
and `usePreferencesSync(...)` calls and every other section on this screen
are untouched.

### `src/i18n/locales/en.json` (modified)

```json
{
  "connectivity": {
    "offline": "OFFLINE"
  },
  "account": {
    "offline": {
      "body": "Sign-in needs a connection. Try again once you're back online."
    }
  }
}
```

`connectivity` is a new top-level namespace (mirrors `errorFallback`'s
existing precedent for a small, app-wide, non-screen-owned namespace — see
`src/components/error-boundary.tsx`'s consumption of it). `account.offline`
is added as a sibling of the existing `account.signedOut`/`account.error`
blocks, touching neither.

## Files Created

| File                                                    | Purpose                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/hooks/use-network-status.ts`                       | Debounced, `isInternetReachable`-first connectivity signal.                                                                                                                                      |
| `src/hooks/__tests__/use-network-status.test.ts`        | Raw-signal derivation (`isConnected`/`isInternetReachable`/null combinations), debounce timing, flap-cleanup.                                                                                    |
| `src/components/connectivity-banner.tsx`                | Presentational top strip — renders `null` online, the dot+word line offline.                                                                                                                     |
| `src/components/__tests__/connectivity-banner.test.tsx` | Renders `null` when `isOffline` is `false`; renders the copy/testID when `true`.                                                                                                                 |
| `__mocks__/@react-native-community/netinfo.ts`          | Jest manual mock: `useNetInfo` as a `jest.fn()` tests set return values on — mirrors this repo's existing `__mocks__/<package>.ts` convention (e.g. `__mocks__/@react-native-firebase/auth.ts`). |

## Files Modified

| File                                                | Change                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `pnpm-lock.yaml`                   | Add `@react-native-community/netinfo`.                                                                                                                                                                                                                |
| `app.json`                                          | Add the NetInfo plugin entry **only if** implementation-time verification finds one is required (see Interfaces/API's verify note) — otherwise no change.                                                                                             |
| `src/app/_layout.tsx`                               | Add `useNetworkStatus()` and render `<ConnectivityBanner isOffline={isOffline} />` above `<Stack>`, per Interfaces/API.                                                                                                                               |
| `src/components/account-section.tsx`                | Add `isOffline` prop; gate the `signedOut`/`error` body copy and disable `GoogleSignInButton` when offline, per Interfaces/API.                                                                                                                       |
| `src/components/__tests__/account-section.test.tsx` | Add cases: offline + `signedOut` shows offline copy and a disabled, non-firing sign-in button; offline + `error` shows offline copy in place of the generic error copy; `isOffline=false` leaves every existing case byte-for-byte passing unchanged. |
| `src/app/profile.tsx`                               | Add `useNetworkStatus()`; pass `isOffline` to `AccountSection`. No other change.                                                                                                                                                                      |
| `src/app/__tests__/profile.test.tsx`                | Mock `useNetworkStatus` (new, alongside the existing hook mocks); assert `AccountSection` receives the mocked `isOffline` value.                                                                                                                      |
| `src/i18n/locales/en.json`                          | Add the `connectivity` namespace and `account.offline`, per Interfaces/API.                                                                                                                                                                           |

## Implementation Steps

1. Confirm `@react-native-community/netinfo`'s current release and exact
   `useNetInfo()` shape against its own docs, per `AGENTS.md` — see
   Interfaces/API's verify note. Run
   `npx expo install @react-native-community/netinfo`.
2. Create `__mocks__/@react-native-community/netinfo.ts`.
3. Create `src/hooks/use-network-status.ts` and its test: raw-signal cases
   (`isConnected:false`, `isInternetReachable:false`, both `null`, both
   `true`), the 2500ms debounce entering offline (via `jest.useFakeTimers()`
   / `jest.advanceTimersByTime`, mirroring `use-live-heart-rate.test.ts`'s
   existing pattern), immediate recovery on returning online, and a
   flap (`offline` then `online` before the debounce fires) never sets
   `isOffline`.
4. Create `src/components/connectivity-banner.tsx` and its test.
5. Get a design pass on `ConnectivityBanner`'s exact placement/treatment
   before or during this step, per Context's flagged `DESIGN.md` gap — the
   token choices above (`surfaceMuted`/`outlineSoft`/`onSurfaceMuted`/
   `actionSm`) are this spec's best-fit proposal, not a confirmed spec.
6. Wire `useNetworkStatus()` + `<ConnectivityBanner>` into
   `src/app/_layout.tsx`, per Interfaces/API.
7. Add `isOffline` to `AccountSection` (`src/components/account-section.tsx`)
   and its offline-gated branch; update its test.
8. Wire `useNetworkStatus()` into `src/app/profile.tsx`; pass `isOffline` to
   `AccountSection`; update its test.
9. Add the `connectivity` and `account.offline` keys to
   `src/i18n/locales/en.json`.
10. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` and fix any failures.
11. Manual, on-device verification (not automatable from this spec, per the
    ticket's own Notes/verify):
    - Airplane mode: banner appears within ~2.5s of toggling on, disappears
      immediately on toggling off.
    - A real captive-portal or dead-Wi-Fi network (associated, no
      working internet): banner appears (`isInternetReachable: false`)
      even though `isConnected` stays `true`.
    - Attempting sign-in in airplane mode shows the offline copy and a
      disabled button rather than launching the native account picker.
    - Recording, saving, and viewing a workout while offline: unaffected,
      per this ticket's Constraints (no code path in `src/ble/*`,
      `src/health/*`, or `src/workout/*` is touched).
    - Changing the units toggle in airplane mode: saves locally, shows no
      error (confirms the already-landed `cloud-settings-sync-firestore`
      behavior is intact); reconnecting and checking the Firestore console
      confirms the queued write lands.
    - A brief real-world Wi-Fi blip (e.g., toggling Wi-Fi off and back on
      within ~1s) does not flash the banner.

## Style & Conventions

- File naming: kebab-case (`use-network-status.ts`, `connectivity-banner.ts`),
  exported names camelCase/PascalCase, per `CLAUDE.md`.
- `connectivity-banner.tsx` is a composed component per `CLAUDE.md`'s
  `src/components/` vs. `src/components/ui/` split — it's feature-specific
  (reads app-wide connectivity, not a generic presentation primitive),
  matching `account-section.tsx`/`health-connect-section.tsx`'s placement,
  not `themed-text.tsx`/`themed-view.tsx`'s.
- Reuses `scan-status-bar.tsx`'s established "dot glyph + word, `actionSm`,
  one color" status-line grammar rather than inventing a second one — see
  Interfaces/API.
- Reuses `device-row.tsx`'s established `opacity: disabled ? 0.5 : 1`
  disabled-control convention for the offline-gated sign-in button, rather
  than a new disabled treatment.
- No new `DESIGN.md` color or spacing token — every token
  `ConnectivityBanner` uses (`surfaceMuted`, `outlineSoft`, `onSurfaceMuted`,
  `actionSm`) is already declared in `src/constants/theme.ts`. The
  **arrangement** (edge-to-edge top strip, not a floating card) is new and
  explicitly flagged in Context/Implementation Steps for a design pass —
  per `CLAUDE.md`'s "if something shared is missing, say so rather than
  creating it," this spec proposes rather than asserts that arrangement.
- Every new string renders via `t('connectivity.…')`/`t('account.offline.…')`,
  per `CLAUDE.md`'s i18n rule — no inline JSX string literals.
- Additive diffs on three already-working files (`_layout.tsx`,
  `account-section.tsx`, `profile.tsx`) — one new hook call and one new
  element/prop/branch each, no restructuring, per `CLAUDE.md`.
- `render()` is async under `@testing-library/react-native` v14+; every new
  or modified component test follows that pattern.
- Filed at `docs/specs/network-connectivity-indicator/SPEC.md`, matching
  this repo's established `docs/specs/<feature>/SPEC.md` convention (a
  deviation from `CLAUDE.md`'s literal flat `docs/*.md` text already noted
  by every prior spec in this repo, including both this ticket's cited
  predecessors).

## Acceptance Criteria

- [ ] Going offline (`isInternetReachable` or `isConnected` false for at
      least 2500ms) shows `ConnectivityBanner` on every screen; returning
      online removes it immediately — verified by
      `use-network-status.test.ts`'s debounce cases and
      `connectivity-banner.test.tsx`'s null/non-null render cases.
- [ ] A device connected to Wi-Fi with no working internet
      (`isConnected: true`, `isInternetReachable: false`) is treated as
      offline, not online — `use-network-status.test.ts` asserts this
      specific combination.
- [ ] A brief connectivity blip (offline signal for under 2500ms, then
      online again) never sets `isOffline` to `true` —
      `use-network-status.test.ts`'s flap case.
- [ ] Recording, saving, and viewing workouts all work normally while
      offline, with nothing blocked or disabled — verified by inspection:
      no file this ticket creates or modifies is imported by anything in
      `src/ble/*`, `src/health/*`, or `src/workout/*`, and no file in those
      folders imports anything this ticket adds.
- [ ] Attempting sign-in while offline shows `account.offline.body` and a
      disabled sign-in button, and does not call `onSignIn`/
      `signInWithGoogle` — `account-section.test.tsx`'s offline +
      `signedOut`/`error` cases, asserting a press on the disabled button
      fires no call.
- [ ] Changing the units preference offline saves locally, shows no error,
      and reaches Firestore once connectivity returns — this is
      **already true of landed code** per Context (`use-preferences-sync.ts`'s
      existing fire-and-forget push); this ticket only confirms it during
      manual verification (Implementation Steps), adding no new automated
      test for it beyond what `cloud-settings-sync-firestore/SPEC.md`
      already added.
- [ ] `isOffline={false}` leaves every existing `AccountSection` test case
      passing unchanged — no regression to the landed sign-in flow.
- [ ] No new string is inline in JSX — all render via `t('connectivity.…')`/
      `t('account.offline.…')`.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.

## Constraints

- **No retry logic anywhere.** Firestore's own native offline persistence
  is the entire "queues and syncs later" mechanism (unchanged from
  `cloud-settings-sync-firestore/SPEC.md`); sign-in stays exclusively
  user-tap-triggered, gated rather than auto-retried.
- **No local cache layer.** This ticket reads a live signal
  (`useNetInfo()`) each time; nothing about connectivity is persisted to
  AsyncStorage or any other store.
- **No change to any existing offline-working behavior.** Pairing,
  recording, saving, history, and Health Connect writes are untouched —
  enforced structurally (see Acceptance's import-boundary check), not just
  by convention.
- **No new color or spacing `DESIGN.md` token** — see Style & Conventions.
  The banner's specific arrangement is flagged as needing a design pass,
  not treated as pre-approved.
- **`isOffline` gates only the sign-in entry point**, not an already-
  in-flight `signingIn` attempt and not the already-`signedIn` state — see
  Interfaces/API's `AccountSection` note on why no mid-flight cancellation
  is added.
- **Two independent `useNetworkStatus()` call sites, not a shared store** —
  a deliberate simplicity choice with one documented, accepted transient
  edge case (Data Model). Revisit only if a future consumer actually needs
  millisecond-level cross-screen consistency, which neither current
  consumer does.
- **`@react-native-community/netinfo`'s exact version compatibility with
  this project's Expo SDK 57 / RN 0.86.2 toolchain, and whether it needs an
  `app.json` plugin entry, are unverified** — flagged in Interfaces/API and
  Implementation Steps for implementation-time confirmation, the same
  posture every prior spec in this repo takes for a new native dependency.
- Android only, per `CLAUDE.md` — this ticket does not attempt or verify iOS
  or web connectivity behavior.
