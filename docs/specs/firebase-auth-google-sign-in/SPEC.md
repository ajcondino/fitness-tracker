# Feature: Firebase Auth with Google Sign-In

## Intent

A user can optionally sign in to Pulse with a Google account, see that
account reflected on the Profile screen, and sign out — all without any
existing pairing, workout, history, or Health Connect behavior changing for
signed-out users. This ticket establishes identity only: no data syncs to
any backend as a result of signing in.

## Context

- **Problem statement:** No auth dependency, provider, session, or UI exists
  anywhere in the repo (confirmed absent from `package.json`, `app.json`,
  `.env.example`'s referenced variables, and `src/`). Profile's identity
  block (`src/app/profile.tsx:15-20`) is explicitly mocked — `MOCK_USER_INITIAL`,
  `MOCK_USER_NAME`, `MOCK_USER_EMAIL` — with a comment pointing at this exact
  gap: "Source all three from the signed-in user once that feature lands."
  The sign-out control at `profile.tsx:76-94` (`testID="profile-sign-out"`)
  is a stubbed no-op `Pressable` with the comment "there's no auth feature to
  sign out of yet." Home's header avatar (`src/app/(tabs)/index.tsx:24-25`)
  has its own, separate `MOCK_USER_NAME`/`MOCK_USER_INITIAL` pair with an
  identical "mocked, no auth yet" comment — **out of scope here** (see
  Constraints): this ticket only wires the Profile screen, per the ticket's
  own "a sign-in entry point on the Profile screen."
- **SDK choice (verified 2026-09-01 against current Firebase/React Native
  Firebase docs) — `@react-native-firebase/app` + `@react-native-firebase/auth`,
  not the modular `firebase` JS SDK.** This project previously settled on
  `@react-native-firebase` as its Firebase SDK. An earlier draft of this
  spec used the JS SDK instead, reasoning scoped to this ticket alone
  (fewer native modules, no `google-services.json`). That reasoning didn't
  hold up once checked against the follow-up cloud-settings-sync ticket,
  which needs Firestore with offline persistence:
  1. **The JS SDK's Firestore has no working offline persistence in React
     Native.** Its persistent local cache
     (`enableIndexedDbPersistence`/`persistentLocalCache`) is built on
     IndexedDB, a browser-only API. Firebase's own docs state offline
     persistence is supported only on Android, iOS, and web — not React
     Native's JS runtime — and the JS SDK team tracks React
     Native/Expo persistence as an open feature request, not a shipped
     capability ([Access data offline | Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline);
     [firebase/firebase-js-sdk#7947](https://github.com/firebase/firebase-js-sdk/issues/7947);
     [rnfirebase.io/platforms](https://rnfirebase.io/platforms), which states
     persistence is "native... controlled by the iOS/Android Firestore SDK"
     and unavailable through the JS SDK's React Native build). The sync
     ticket's "a preference change while offline persists locally and syncs
     later without a hand-rolled queue" requirement is exactly what
     Firestore's native offline persistence already provides on
     Android — and exactly what the JS SDK cannot provide in this app,
     which would force that ticket to hand-roll the same queue Firestore
     already solves.
  2. **A JS-SDK `firebase/auth` session and `@react-native-firebase`'s
     native Auth/Firestore session don't interoperate.** They're two
     independent client implementations with separate local session
     persistence (the JS SDK's own `getReactNativePersistence(AsyncStorage)`
     vs. the native SDK's own secure native storage) and no documented
     bridge between them — several `firebase-js-sdk` web APIs are
     documented as throwing outright on React Native, underscoring that
     the two stacks aren't meant to be mixed. `@react-native-firebase`'s
     own modules, by contrast, share one native app/auth session by design
     ([`@react-native-firebase/app` usage](https://rnfirebase.io/app/usage)),
     which is exactly why `@react-native-firebase/auth` +
     `@react-native-firebase/firestore` resolve `request.auth` correctly
     together in security rules. A user authenticated only through the JS
     SDK would be unauthenticated (`request.auth == null`) to any
     `@react-native-firebase/firestore` call, since that native module has
     never seen the JS SDK's session.

  Together, these mean the Auth SDK choice **is** the Firestore SDK choice
  for the sync ticket, not an independent decision per ticket — picking the
  JS SDK for Auth here would force the sync ticket either onto the JS
  SDK's Firestore (re-inheriting point 1's offline-persistence gap) or
  into a second, redundant sign-in through `@react-native-firebase/auth`
  just to make native Firestore calls authenticate. Firebase's own
  guidance frames this as a single, app-wide SDK choice, not a per-service
  pick ([Which Firebase SDK do I pick for my React Native project?](https://firebase.blog/posts/2023/03/which-react-native-firebase-sdk-to-use/)).
  This spec therefore uses `@react-native-firebase` throughout — consistent
  with this project's prior decision — so the sync ticket can add
  `@react-native-firebase/firestore` on the same native session with
  working offline persistence and no rework of this ticket's auth layer.
  Every other design decision below (the `src/auth/` module boundary,
  `useAuth`'s status machine, `AccountSection`) is unchanged by this
  swap — see Interfaces/API for the two files it actually touches.

- **Current code:**
  - `src/components/health-connect-section.tsx` +
    `src/hooks/use-health-connect-settings.ts` — the direct structural model
    for this ticket's `AccountSection` + `useAuth`: a composed section
    component driven by a status enum a plain hook derives, `checking` as
    the not-yet-known initial state rendering `null`, explicit user-tap-only
    triggers for anything that shows a provider UI (`grantAccess` there,
    `signInWithGoogle` here), and copy driven entirely by `t()` keys per a
    status → copy/control table. This ticket's `AccountSection` reuses
    `HealthConnectSection`'s exact chrome (`label-caps` header above one
    `surface`/`outline`/`md`-radius container) so the two sections read as
    one consistent "settings section" list, per `device.tsx`'s established
    shape (cited by `health-connect-availability-permissions/SPEC.md`'s own
    Context) — both ticket's brief phrase "alongside the existing Health
    Connect section" and that established grammar point the same way.
  - `src/health/health-connect-sync.ts` — the established "never throws,
    translate every internal failure into a status" contract
    (`syncWorkoutSessionToHealthConnect` catches everything and resolves a
    `'failed'` record rather than rejecting). This ticket's
    `signInWithGoogle()` (in `src/auth/google-sign-in.ts`) follows the
    identical shape: it never rejects, always resolving a discriminated
    `SignInResult`.
  - `src/app/_layout.tsx:13-17` — the one existing precedent for an
    `EXPO_PUBLIC_`-prefixed env var (`EXPO_PUBLIC_SENTRY_DSN`) consumed at
    module scope. This ticket, unlike its earlier JS-SDK draft, adds **no**
    new `EXPO_PUBLIC_*` variable — `@react-native-firebase/app` configures
    itself from a native `google-services.json` instead (see Interfaces/API).
  - `src/ble/saved-device.ts` / `src/health/health-connect-store.ts` — this
    repo's established local-persistence shape (a framework-free
    AsyncStorage-backed module, one deliberate key per concern). This
    ticket **deliberately does not add a sibling `src/auth/auth-store.ts`,
    and never imports `@react-native-async-storage/async-storage`** — see
    Data Model for why the native Firebase SDK's own persistence already
    satisfies the "check the repo's existing local-persistence conventions"
    note in the ticket, without a second, competing source of truth for
    the same session.
  - `src/components/session-summary.tsx`'s sync control (`:208-222`,
    `sessionSummary.writeStatus.syncAction` / `.syncing`) — the precedent
    for a single control whose label swaps between an idle action and an
    in-flight `…` label while `disabled`, rather than a separate
    spinner/skeleton. `AccountSection`'s sign-in control follows this
    exact pattern for the `signingIn` state.
  - No dependency on `src/ble/*`, `src/health/*`, or `src/workout/*`
    anywhere in this ticket — auth is a new, independent domain folder
    (`src/auth/`) that happens to share this repo's module-shape
    conventions.
- **User impact:** The Profile screen's identity area becomes real: signed
  out, it explains what signing in does (and doesn't do) and offers a
  Google sign-in button; signed in, it shows the account and a sign-out
  action. Every other screen and flow (pairing, live workout, history,
  Health Connect) is completely unchanged for both signed-out and signed-in
  users.
- **Dependencies:**
  - **`@react-native-firebase/app` + `@react-native-firebase/auth`** (new)
    — the native Firebase SDK wrapper, per the SDK choice above.
    `@react-native-firebase/app` auto-initializes from a native
    `google-services.json` (Android; no iOS file, since this app doesn't
    build iOS) rather than a JS-side config object — no
    `EXPO_PUBLIC_FIREBASE_*` env vars are needed at all. Both ship Expo
    config plugins (auto-discovered by name, same convention
    `react-native-health-connect` already established in this repo's
    `app.json`). Adopted the firebase-js-sdk-compatible **modular** API
    (`getAuth`, `onAuthStateChanged`, `signInWithCredential`, `signOut` as
    named exports), available since `@react-native-firebase` v22
    ([Migrating to v22](https://rnfirebase.io/migrating-to-v22); [React
    Native Firebase v26 announcement](https://invertase.io/blog/react-native-firebase-v26-release))
    rather than the older namespaced `auth()` default-export form, so this
    code reads like the same-shaped `firebase/auth` calls a web developer
    would recognize. **Verify at implementation time** (per `AGENTS.md`):
    the installed release is v22+; exact Expo SDK 57 / RN 0.86.2
    compatibility; whether any Android Gradle/Google-Services-plugin
    version pin is required beyond what autolinking already provides.
  - **`@react-native-google-signin/google-signin`** (new) — native Google
    Sign-In with its own Expo config plugin, requiring a development-build
    rebuild like every other native module in this repo — already in
    place per the ticket. Configured with `androidGoogleServicesFile:
'./google-services.json'` (the same file `@react-native-firebase/app`
    already requires) so the plugin can read the OAuth web client ID out
    of that file at build time (`webClientId: 'autoDetect'`) instead of a
    separately maintained env var — one less place for the value to drift
    from the Firebase console
    ([Expo setup | React Native Google Sign In](https://react-native-google-signin.github.io/docs/setting-up/expo)).
    **Verify at implementation time**: the installed release's exact
    `autoDetect` support and runtime `GoogleSignin.configure()` call shape
    (some versions still expect an explicit `webClientId: 'autoDetect'`
    sentinel at the JS call site rather than inferring it silently), and
    the current `statusCodes`/`isErrorWithCode` export shape.
  - **A Firebase project with Google sign-in enabled**, an Android app
    registered in it (package `com.a.condino.fitnesstracker`, from
    `app.json`), and that app's downloaded `google-services.json` — a
    one-time console setup, not code. See Implementation Steps and
    Constraints.
  - **`@react-native-async-storage/async-storage`** — **not used by this
    ticket at all.** Unlike the JS-SDK draft (which needed
    `getReactNativePersistence(AsyncStorage)`), both Auth's session and
    Google Sign-in's own state are persisted natively here, with zero
    AsyncStorage involvement from this ticket's own code.

## Data Model

```ts
// src/auth/auth-types.ts (new, framework-free — no firebase/React import)

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
};
// A deliberately minimal projection of @react-native-firebase/auth's
// FirebaseAuthTypes.User — only the three fields any UI in this ticket
// reads. No photoURL: `Avatar` (components/ui/avatar.tsx) renders a single
// initial, never an image, and adding image support is exactly the kind of
// "profile editing/avatars" work the ticket lists as out of scope. Google
// accounts always populate `displayName`, but this type keeps it nullable
// to match the underlying type's own (unnarrowed) shape rather than
// asserting a guarantee this app can't verify.

export type AccountSectionStatus =
  | 'checking' // initial auth-restore in flight — mirrors
  // HealthConnectSectionStatus's identical 'checking' state and its
  // "renders nothing while loading" convention (see Interfaces/API).
  | 'signedOut'
  | 'signingIn'
  | 'signedIn'
  | 'error'; // a real signInWithGoogle() failure (network/unknown) —
// deliberately excludes user-cancelled, which resolves straight back to
// 'signedOut' with no error surfaced (see Interfaces/API and Acceptance).

export type SignInFailureReason = 'network' | 'unknown';

export type SignInResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; reason: SignInFailureReason };
```

- **No new AsyncStorage-backed store module, and no AsyncStorage
  involvement at all.** `@react-native-firebase/auth`'s native session
  persistence (backed by the platform's own secure storage, entirely
  outside this app's JS code) already restores the signed-in session
  before the first `onAuthStateChanged` callback fires on a cold start.
  Hand-rolling a second, parallel "is signed in" flag (in the shape of
  `saved-device.ts`/`health-connect-store.ts`) would duplicate the native
  SDK's own source of truth and risk drifting from it (e.g., a token the
  native SDK considers expired while this app's own flag still says
  "signed in"). This is the one deliberate deviation from this repo's
  usual "framework-free storage module per domain" shape, and it's a
  **reduction**, not an added mechanism — see Style & Conventions.
- **Nothing about pairing, workouts, or Health Connect settings changes
  shape.** `ble.savedDevice`, `healthConnect.writeBackEnabled`,
  `healthConnect.declineCount`, and the workout-session store are untouched
  by every function this ticket adds — `src/auth/*` never imports
  `@react-native-async-storage/async-storage`, `src/ble/*`, or
  `src/health/*`, and nothing in those modules imports `src/auth/*`. This
  is what makes "sign-out doesn't touch local data" true by construction
  rather than by a checklist (see Constraints).

## Interfaces / API

### `src/auth/auth-client.ts` (new)

Provider-agnostic Firebase Auth wrapper — the layer a future second
provider (e.g. Apple) would sit beside, not inside.

```ts
export function getFirebaseAuth(): FirebaseAuthTypes.Module;
// A thin passthrough: getAuth(getApp()). No initializeApp/initializeAuth
// call exists anywhere in this ticket's own code — @react-native-firebase/app
// initializes the native Firebase app automatically from google-services.json
// at native app startup, before any JS runs. This function exists so every
// other module in src/auth/ has one shared call site, not because there's
// any lazy setup left to memoize here.

export function onAuthStateChangedListener(
  callback: (user: FirebaseAuthTypes.User | null) => void,
): () => void;
// Wraps onAuthStateChanged(getFirebaseAuth(), callback) from
// @react-native-firebase/auth. Returns the unsubscribe function directly —
// the only consumer (use-auth.ts) returns it straight from its own
// useEffect.

export async function signOutOfFirebase(): Promise<void>;
// Wraps signOut(getFirebaseAuth()). Swallows a thrown error (matches
// health-connect-store.ts's "a failed write/action is not a user-facing
// failure" contract) — sign-out's own optimistic local status flip (see
// use-auth.ts below) already reflects the intended end state regardless of
// whether the network round-trip to invalidate the token server-side
// completes.
```

**Verify at implementation time**: the exact modular-API import shape above
(`getAuth`/`onAuthStateChanged`/`signOut` as named exports of
`@react-native-firebase/auth`, alongside the `FirebaseAuthTypes` namespace
for types) against the installed version — confirm it's v22+ and that the
older namespaced `auth().onAuthStateChanged(...)` default-export form isn't
required instead.

### `src/auth/google-sign-in.ts` (new)

The one provider-specific module — a future `src/auth/apple-sign-in.ts`
would be this file's sibling, not a change to it. No shared
`AuthProvider` interface/enum is introduced for a single provider — see
Style & Conventions.

```ts
export async function signInWithGoogle(): Promise<SignInResult>;
// Never rejects — every internal failure resolves a SignInResult, mirroring
// health-connect-sync.ts's "never throws" contract:
// 1. Lazily calls GoogleSignin.configure({ webClientId: 'autoDetect' })
//    exactly once (module-scope guard, same shape as ensureInitialized()) —
//    'autoDetect' resolves the web client ID from google-services.json at
//    build time, per Dependencies above.
// 2. GoogleSignin.hasPlayServices() — surfaces Play-Services-unavailable
//    the same way any other rejection here does (-> 'unknown'); this repo
//    already targets real Android hardware/emulators with Play Services
//    for Health Connect, so no dedicated status is added for this rare
//    case. **Verify at implementation time** against a Play-Services-less
//    emulator if one is in use.
// 3. GoogleSignin.signIn() -> { idToken }. A null idToken (the library's
//    documented possible-but-rare outcome) resolves { status: 'error',
//    reason: 'unknown' } rather than being passed to Firebase.
// 4. GoogleAuthProvider.credential(idToken) (from @react-native-firebase/auth),
//    then signInWithCredential(getFirebaseAuth(), credential).
// 5. Resolves { status: 'success' } — this function does NOT set any
//    signed-in state itself; step 4's success is what changes the native
//    Firebase app's own auth state, which use-auth.ts's
//    onAuthStateChangedListener subscription observes and translates into
//    'signedIn'. Kept as the single source of truth for "is signed in"
//    rather than a second call-site-driven one.
//
// Error mapping (catch-all around steps 1-4):
// - GoogleSignin's own cancellation code (statusCodes.SIGN_IN_CANCELLED,
//   checked via the library's isErrorWithCode helper) -> { status: 'cancelled' }.
// - GoogleSignin's own statusCodes.NETWORK_ERROR, OR a thrown error whose
//   `code` is Firebase's 'auth/network-request-failed' (signInWithCredential's
//   own network-failure shape — a different error shape than GoogleSignin's,
//   checked separately) -> { status: 'error', reason: 'network' }.
// - Anything else -> { status: 'error', reason: 'unknown' }.
// **Verify at implementation time**: the exact statusCodes/error-shape
// shown above against the actually-installed versions of both libraries,
// per AGENTS.md — this mapping is written from each library's published
// documentation, not a live device.
```

### `src/hooks/use-auth.ts` (new)

```ts
export function useAuth(): {
  status: AccountSectionStatus;
  user: AuthUser | null;
  signInError: SignInFailureReason | null;
  signInWithGoogle: () => void;
  signOut: () => void;
};
```

- **On mount**, subscribes via `onAuthStateChangedListener`. Firebase
  guarantees this fires at least once, synchronously after checking
  persisted state — the callback maps `null` -> `{status: 'signedOut', user:
null}`, a `FirebaseAuthTypes.User` -> `{status: 'signedIn', user: {uid,
displayName, email}, signInError: null}`. This is the **only** path that
  ever sets `'signedIn'` — `signInWithGoogle` below never sets it directly,
  so there is exactly one place status becomes `'signedIn'`. This listener
  fires again only on a genuine Firebase auth-state transition (a
  successful sign-in or a sign-out) — never on a failed/cancelled attempt,
  which is what makes the `'error'`/`'signedOut'`-on-cancel transitions
  below safe from being immediately clobbered by a stale callback.
- **`signInWithGoogle()`** — a no-op if `status === 'signingIn'` already
  (mirrors `use-device-pairing.ts`'s `connect()` "never issue a second
  concurrent attempt" guard). Otherwise sets `status = 'signingIn'`,
  `signInError = null`, calls the module-level `signInWithGoogle()` (from
  `google-sign-in.ts`), and on resolution:
  - `'success'` — no local state change; the mount-time listener above will
    (already has, in practice, by the time this promise resolves — Firebase
    fires `onAuthStateChanged` synchronously within the same call) land on
    `'signedIn'`.
  - `'cancelled'` — `status = 'signedOut'`. No error is recorded or shown —
    this is the ticket's explicit "cancelling returns to a clean signed-out
    state" requirement, distinct from a real failure.
  - `'error'` — `status = 'error'`, `signInError = result.reason`.
- **`signOut()`** — optimistically sets `status = 'signedOut'`, `user =
null` immediately (matches `use-health-connect-settings.ts`'s
  `setWriteBackEnabled`'s "optimistic, fire-and-forget" precedent), then
  calls `signOutOfFirebase()` without awaiting it. The mount-time listener
  will independently confirm the same end state once the native SDK's own
  auth state updates — both paths agree, so this is idempotent, not a race.
- This hook touches only `src/auth/*`. It imports nothing from `src/ble/*`,
  `src/health/*`, or `src/workout/*`, and nothing there imports it — see
  Constraints for why this is load-bearing for the sign-out guarantee.

### `src/components/account-section.tsx` (new, composed)

```ts
export type AccountSectionProps = {
  status: AccountSectionStatus;
  user: AuthUser | null;
  signInError: SignInFailureReason | null;
  onSignIn: () => void;
  onSignOut: () => void;
};
export function AccountSection(props: AccountSectionProps): React.JSX.Element | null;
```

Renders `null` for `'checking'` (identical convention to
`HealthConnectSection`, so a cold-start auth restore never flashes a
signed-out state before settling — this is what makes "auth state persists
across a cold start without re-prompting" visually true, not just
internally true). Otherwise: a `label-caps` header (`t('account.sectionHeader')`)
above one `surface`/`outline`/`md`-radius container (`HealthConnectSection`'s
exact chrome), whose body is one of:

| `status`    | Body copy                                                                                                                                                                                                                                                                                                        | Control                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signedOut` | `account.signedOut.title` + `account.signedOut.body`                                                                                                                                                                                                                                                             | filled primary button (`HealthConnectSection`'s `notGranted` button style) `account.signedOut.signInAction` -> `onSignIn`, `testID="account-sign-in-action"`                                                                                                                                                  |
| `signingIn` | same title/body as `signedOut` (unchanged, so the explanation doesn't flicker)                                                                                                                                                                                                                                   | same button, `disabled`, label swaps to `account.signingIn` — mirrors `session-summary.tsx`'s sync/syncing label swap, not a second layout                                                                                                                                                                    |
| `error`     | `account.signedOut.title` + `account.error.<signInError>.body` in `bodySm`/`color="danger"` (this app's only other status color, per `write-status-marker.tsx`'s precedent)                                                                                                                                      | same button, re-enabled, label `account.error.retryAction`, `onPress={onSignIn}` — retries the identical flow, `testID="account-sign-in-action"`                                                                                                                                                              |
| `signedIn`  | none — an identity row instead: `Avatar size="lg"` with `initial={(user.displayName ?? user.email ?? '?')[0]}`, `user.displayName ?? user.email` in `titleMd`, `user.email` in `dataSm`/`onSurfaceDim` beneath it (this is `profile.tsx`'s former mocked identity block, now real and moved inside this section) | text action (`ScanStatusBar`/`SavedDeviceRow`'s established `actionSm`/`color="primary"` link pattern — no new button component, matching `health-connect-availability-permissions/SPEC.md`'s explicit precedent) `account.signedIn.signOutAction`, `onPress={onSignOut}`, `testID="account-sign-out-action"` |

`user.email` is rendered only when non-null (a Google account always
supplies one in practice, but the type is nullable — see Data Model — so
the row degrades to name-only rather than rendering the literal string
`"null"`).

### `src/app/profile.tsx` (modified)

- Removes `MOCK_USER_INITIAL`/`MOCK_USER_NAME`/`MOCK_USER_EMAIL` and the
  identity `<View style={styles.identity}>` block (`:57-65`) and the
  stubbed `profile-sign-out` `Pressable` (`:76-94`) in their entirety.
- Adds `const { status, user, signInError, signInWithGoogle, signOut } =
useAuth();` and renders `<AccountSection status={status} user={user}
signInError={signInError} onSignIn={signInWithGoogle} onSignOut={signOut}
/>` where the identity block used to be — directly above the existing
  `<HealthConnectSection .../>`, unchanged.
- No other change to this screen: header, back chevron, and
  `HealthConnectSection`'s own wiring are untouched, per "additive diffs on
  working screens."

### `google-services.json` (new, not committed) / `.gitignore` / `README.md` (modified)

- `google-services.json`, downloaded from the Firebase console for the
  registered Android app, lives at the project root — the path both
  `app.json`'s `android.googleServicesFile` and the Google Sign-in
  plugin's `androidGoogleServicesFile` option point to (see below).
  **Not committed**: added to `.gitignore` alongside the existing
  `.env*.local` entry, treated as per-environment config the same way
  `.env.local` already is (even though, unlike a true secret, Google's own
  guidance is that its contents are safe to ship inside a compiled app —
  this repo simply doesn't check in machine/environment-specific config
  files, and this one is no exception). Distributed the same way this repo
  already separates "local dev has it manually" from "CI/EAS builds get it
  from an EAS Environment": a developer downloads their own copy locally,
  and the `preview` EAS Environment gets it as a **file-type** environment
  variable (`eas env:create --environment preview --name
GOOGLE_SERVICES_JSON --type file --value ./google-services.json`),
  mirroring the existing `preview` Environment's role for
  `EXPO_PUBLIC_SENTRY_DSN` but for a file instead of a string. **Verify at
  implementation time** the exact current `eas env:create` flag for a
  file-type variable.
- No `EXPO_PUBLIC_*` env vars are added by this ticket — a deliberate
  difference from the ticket's own "secrets and config: follow the repo's
  existing environment variable conventions" note, justified by the SDK
  choice in Context: the native SDK's config lives in a file, not env vars,
  and following the _spirit_ of "don't invent a new config mechanism" here
  means using EAS's existing file-secret mechanism rather than awkwardly
  base64-encoding the file into an `EXPO_PUBLIC_*` string.
- `README.md` gains a short "Firebase / Google Sign-In setup" note under
  its existing `## Setup` section: where to get `google-services.json`,
  that it's gitignored, the `eas env:create ... --type file` command above,
  and — per the ticket's own instruction — exactly which SHA-1
  fingerprints (debug **and** release keystores) were registered against
  the Android app in the Firebase console, so this survives a machine
  reformat.

### `app.json` (modified)

```json
{
  "android": {
    // ...existing entries unchanged...
    "googleServicesFile": "./google-services.json"
  },
  "plugins": [
    // ...existing entries unchanged...
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    [
      "@react-native-google-signin/google-signin",
      { "androidGoogleServicesFile": "./google-services.json" }
    ]
  ]
}
```

No `expo-build-properties` change expected — Health Connect's earlier
`minSdkVersion: 26` bump already exceeds both new libraries' own floors.
**Confirm at implementation time**: whether `@react-native-firebase/app`'s
plugin needs any explicit option, and whether it and
`react-native-health-connect`'s own plugin apply Android's Google Services
Gradle plugin without conflict (only one entry point should apply it per
build).

### `src/i18n/locales/en.json` (modified)

New top-level `account` namespace; `profile.signOut` is removed (superseded
by `account.signedIn.signOutAction` — grep confirms no other reference to
`profile.signOut` anywhere in `src/`):

```json
{
  "account": {
    "sectionHeader": "ACCOUNT",
    "signedOut": {
      "title": "Sign in to sync your settings",
      "body": "Sign in with Google to sync your settings across devices. Your workouts stay local and in Health Connect either way — signing in doesn't change that.",
      "signInAction": "SIGN IN WITH GOOGLE"
    },
    "signingIn": "SIGNING IN…",
    "error": {
      "network": { "body": "Couldn't sign in — check your connection and try again." },
      "unknown": { "body": "Sign-in failed. Try again." },
      "retryAction": "TRY AGAIN"
    },
    "signedIn": {
      "signOutAction": "SIGN OUT"
    }
  }
}
```

## Files Created

| File                                                     | Purpose                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auth/auth-types.ts`                                 | Framework-free shared types: `AuthUser`, `AccountSectionStatus`, `SignInFailureReason`, `SignInResult`.                                                                                                                                           |
| `src/auth/auth-client.ts`                                | Provider-agnostic Firebase Auth wrapper over `@react-native-firebase/auth`'s modular API: `getFirebaseAuth`, `onAuthStateChangedListener`, `signOutOfFirebase`.                                                                                   |
| `src/auth/__tests__/auth-client.test.ts`                 | `getFirebaseAuth()` returns the mocked module; listener wiring calls through to `onAuthStateChanged`; `signOutOfFirebase` swallows a thrown error.                                                                                                |
| `src/auth/google-sign-in.ts`                             | The Google-specific credential flow: configure, sign-in, map every outcome to a `SignInResult`, never rejecting.                                                                                                                                  |
| `src/auth/__tests__/google-sign-in.test.ts`              | Success, cancellation, network failure (both error shapes), unknown failure, and a null `idToken` — asserts `signInWithCredential` is never called on a null token.                                                                               |
| `src/hooks/use-auth.ts`                                  | Owns `AccountSectionStatus`: the mount-time listener, `signInWithGoogle`'s three outcomes, optimistic `signOut`.                                                                                                                                  |
| `src/hooks/__tests__/use-auth.test.ts`                   | Cold-start `'checking'` -> `'signedOut'`/`'signedIn'` from the listener; `signInWithGoogle`'s cancelled/error/success paths (success verified via the listener, not a direct status set); the concurrent-call guard; `signOut`'s optimistic flip. |
| `src/components/account-section.tsx`                     | Renders the four-state (plus `checking`) section per the copy/control table.                                                                                                                                                                      |
| `src/components/__tests__/account-section.test.tsx`      | Correct copy/control per status, including `null` for `checking`, the `signingIn` label swap + `disabled`, the `error` state's reason-specific body, and the `signedIn` identity row with a null `email`.                                         |
| `__mocks__/@react-native-google-signin/google-signin.ts` | Jest manual mock: `GoogleSignin` (`configure`, `hasPlayServices`, `signIn`, all `jest.fn()`), `statusCodes`, `isErrorWithCode` — mirrors `__mocks__/react-native-health-connect.ts`'s established shape.                                          |
| `__mocks__/@react-native-firebase/app.ts`                | Jest manual mock: `getApp`, `jest.fn()` — mirrors `__mocks__/@react-native-async-storage/async-storage.ts`'s nested-scoped-package convention.                                                                                                    |
| `__mocks__/@react-native-firebase/auth.ts`               | Jest manual mock: `getAuth`, `onAuthStateChanged`, `signOut`, `signInWithCredential`, `GoogleAuthProvider` (with a static `credential`), all `jest.fn()`.                                                                                         |
| `google-services.json`                                   | Native Firebase Android config, downloaded from the console. **Not committed** — see Interfaces/API.                                                                                                                                              |

## Files Modified

| File                                 | Change                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `pnpm-lock.yaml`    | Add `@react-native-firebase/app`, `@react-native-firebase/auth`, and `@react-native-google-signin/google-signin`.                                                                                                                                                                                                                               |
| `app.json`                           | Add `android.googleServicesFile`, the two `@react-native-firebase/*` plugin entries, and the Google Sign-in plugin's `androidGoogleServicesFile` option, per Interfaces/API.                                                                                                                                                                    |
| `.gitignore`                         | Add `google-services.json` alongside the existing `.env*.local` entry.                                                                                                                                                                                                                                                                          |
| `README.md`                          | Add a "Firebase / Google Sign-In setup" note under the existing `## Setup` section: where to get `google-services.json`, the `eas env:create ... --type file` command, and exactly which SHA-1 fingerprints (debug + release keystores) were registered in the Firebase console.                                                                |
| `src/app/profile.tsx`                | Replace the mocked identity block and stubbed sign-out `Pressable` with `useAuth()` + `AccountSection`, per Interfaces/API.                                                                                                                                                                                                                     |
| `src/app/__tests__/profile.test.tsx` | Mock `useAuth` (new, alongside the existing `useHealthConnectSettings` mock); add cases mirroring the existing Health Connect ones — status passthrough, `checking` renders nothing, `signInWithGoogle`/`signOut` wiring — and remove any assertion tied to the deleted mock constants (none currently exist beyond the removed markup itself). |
| `src/i18n/locales/en.json`           | Add the `account` namespace; remove `profile.signOut`.                                                                                                                                                                                                                                                                                          |

## Implementation Steps

1. One-time Firebase/Google Cloud console setup (not code, needs an
   interactive, authenticated session — the same caveat `CLAUDE.md` states
   for `eas env:create`/`eas channel:create`): create a Firebase project
   (or use an existing one), enable the Google sign-in provider under
   Authentication, add an Android app with this project's package name
   (`com.a.condino.fitnesstracker`), download its `google-services.json`
   into the project root, and register **both** the debug keystore's SHA-1
   (from `cd android && ./gradlew signingReport`, or the default
   `~/.android/debug.keystore` if `android/` hasn't been generated yet)
   and the release keystore's SHA-1 under that Android app's settings.
   Record both fingerprints in `README.md` per Files Modified.
2. Confirm `@react-native-firebase/app`/`@react-native-firebase/auth`'s and
   `@react-native-google-signin/google-signin`'s current releases and exact
   API shapes against their own docs, per `AGENTS.md` — see the verify
   notes under Dependencies and Interfaces/API. Run `npx expo install
@react-native-firebase/app @react-native-firebase/auth
@react-native-google-signin/google-signin`.
3. Add `google-services.json` to `.gitignore`; add the `app.json` entries
   (`android.googleServicesFile`, the three plugin entries) per
   Interfaces/API.
4. Create `__mocks__/@react-native-firebase/app.ts`,
   `__mocks__/@react-native-firebase/auth.ts`, and
   `__mocks__/@react-native-google-signin/google-signin.ts`.
5. Create `src/auth/auth-types.ts`.
6. Create `src/auth/auth-client.ts` and its test.
7. Create `src/auth/google-sign-in.ts` and its test, covering every branch
   of the error mapping in Interfaces/API.
8. Create `src/hooks/use-auth.ts` and its test, covering the listener-only
   `'signedIn'` transition, the concurrent-call guard, and each
   `signInWithGoogle()` outcome.
9. Create `src/components/account-section.tsx` and its test.
10. Add the `account` namespace to `src/i18n/locales/en.json`; remove
    `profile.signOut`.
11. Modify `src/app/profile.tsx` per Interfaces/API; update
    `src/app/__tests__/profile.test.tsx` per Files Modified.
12. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
13. Hand off to the developer for the manual native steps (clean prebuild +
    dev-client rebuild, and setting `google-services.json` as a file-type
    secret in the `preview` EAS Environment so CI-triggered builds have it)
    — not run as part of this implementation, per the existing
    `ble-runtime-setup`/`health-connect-availability-permissions` precedent
    for native/EAS steps.
14. On-device verification (not automatable from this spec, per Notes/verify
    in the ticket): a successful sign-in with a real Google account; airplane
    mode during sign-in resolves to the network error state rather than
    hanging; dismissing the Google account picker returns to a clean
    `'signedOut'` state; force-quitting and relaunching the app after a
    successful sign-in restores `'signedIn'` with no visible flash of
    `'signedOut'`; signing out and then re-checking pairing/Health
    Connect/history all behave exactly as before sign-in.

## Style & Conventions

- **This spec's SDK choice was verified, not assumed** — see Context's "SDK
  choice" note for the offline-persistence and auth-interoperability
  evidence behind using `@react-native-firebase` instead of the modular JS
  SDK an earlier draft used. Anyone revisiting this decision for the
  follow-up sync ticket should re-check that note first.
- `src/auth/` mirrors `src/health/`'s two-module-plus-types split (a
  provider-agnostic client + one provider-specific module), adapted for
  this ticket's explicit "structure for a second provider, don't build it"
  requirement: `google-sign-in.ts` is the one module a future
  `apple-sign-in.ts` would sit beside; `auth-client.ts` and `use-auth.ts`
  need no change to add it. No `AuthProvider` interface/enum/registry is
  introduced for a single provider — that would be exactly the kind of
  speculative, unused abstraction `CLAUDE.md`'s "don't invent cross-cutting
  structure" and this skill's own "avoid speculative abstractions" rule
  warn against. Adding Apple later means adding one sibling file and one
  sibling hook method, not refactoring this one.
- `checkX`/`requestX`-style read-vs-act split, and "never trigger a
  provider UI outside a user tap," directly reuse
  `ble-pairing-permissions`/`health-connect-availability-permissions`'s
  established pattern: `useAuth()`'s mount effect only ever _observes_
  auth state; `signInWithGoogle()` is the sole, always-user-tap-triggered
  path that can show the Google account picker.
- `AccountSection` reuses `HealthConnectSection`'s container chrome and
  copy/control table shape exactly, and its `signedIn` row's text-link
  sign-out reuses `ScanStatusBar`/`SavedDeviceRow`'s established
  `actionSm`/`primary` link pattern rather than introducing a second button
  component — both are explicit precedents already recorded in
  `health-connect-availability-permissions/SPEC.md`'s own Style &
  Conventions.
- No new `DESIGN.md` token: `danger` (already used by
  `write-status-marker.tsx`'s `'failed'` state) is this app's only
  "something went wrong" color and is reused as-is for the `error` state's
  body text.
- Every new string renders via `t('account.…')`, per `CLAUDE.md`'s i18n
  rule — no inline JSX string literals.
- Component/module files are kebab-case, exported names PascalCase/camelCase
  per `CLAUDE.md` (`account-section.tsx` -> `AccountSection`,
  `google-sign-in.ts` -> `signInWithGoogle`).
- Filed at `docs/specs/firebase-auth-google-sign-in/SPEC.md`, per this
  skill's default and the only real convention in this repo (every existing
  spec lives at `docs/specs/<feature>/SPEC.md`), over `CLAUDE.md`'s literal
  (but unused) flat `docs/*.md` text — the same deviation every prior spec
  in this repo already notes for itself.

## Acceptance Criteria

- [ ] A signed-out user can pair a device, record, save, and view workouts
      exactly as before — no code path in `src/ble/*`, `src/health/*`, or
      `src/workout/*` reads anything from `src/auth/*` (verified by
      inspection: no such import exists).
- [ ] Tapping `account-sign-in-action` while `status === 'signedOut'` calls
      `signInWithGoogle()` and, on a mocked success, ends with `status ===
'signedIn'` and `user` populated from the mocked native `User` — driven
      through the `onAuthStateChangedListener` mock, not a direct status
      set from the sign-in call.
- [ ] A mocked cancellation (`statusCodes.SIGN_IN_CANCELLED`) resolves
      `status` to `'signedOut'` with `signInError === null` — no error
      copy is shown.
- [ ] A mocked network failure (both the `GoogleSignin` `NETWORK_ERROR`
      shape and the Firebase `auth/network-request-failed` shape) resolves
      `status === 'error'`, `signInError === 'network'`, and
      `AccountSection` renders `account.error.network.body` — never left
      on `'signingIn'`.
- [ ] `AccountSection` renders `null` for `'checking'`; `Profile`'s test
      confirms no account copy or the Health Connect section's copy leaks
      into that render.
- [ ] Force-quitting and relaunching (simulated in tests by mounting
      `useAuth()` with the listener mock invoking its callback with a
      non-null user on the very first call) reaches `'signedIn'` without
      ever passing through a `'signedOut'` render.
- [ ] Calling `signOut()` sets `status` to `'signedOut'` and `user` to
      `null` immediately (before the mocked `signOutOfFirebase` promise
      resolves), and never calls anything exported from
      `@react-native-async-storage/async-storage`, `src/ble/saved-device.ts`,
      or `src/health/health-connect-store.ts`.
- [ ] `getFirebaseAuth()`, `onAuthStateChangedListener`, and
      `signOutOfFirebase` call only `@react-native-firebase/auth`'s modular
      functions — no `initializeApp`/`initializeAuth` call exists anywhere
      in `src/auth/*` (native `@react-native-firebase/app` owns
      initialization from `google-services.json`).
- [ ] No new string is inline in JSX — all render via `t('account.…')`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Identity only — no Firestore, no preference sync, no cloud data of any
  kind.** Nothing in this ticket writes to any Firebase product other than
  Auth's own session; `@react-native-firebase/firestore` is not installed,
  imported, or referenced anywhere. This is explicitly the follow-up
  ticket's scope — see Context's SDK choice note for how this ticket's SDK
  pick was verified against that follow-up's Firestore/offline-persistence
  needs specifically, so that ticket doesn't inherit a mismatched Auth
  layer.
- **Sign-out never touches local data.** `signOutOfFirebase()` calls only
  `@react-native-firebase/auth`'s `signOut`, which clears its own native
  session and nothing else. Paired device, workout sessions, and Health
  Connect settings are untouched — enforced structurally (see Data Model /
  `useAuth`'s import boundary), not just by convention.
- **Sign in with Apple is deferred, not stubbed.** No `apple-sign-in.ts`,
  no disabled UI affordance, no `AuthProvider` abstraction anticipating it
  — per the ticket's own "do not build or stub it." The only preparation
  is `google-sign-in.ts`/`auth-client.ts`'s module boundary described in
  Style & Conventions.
- **No custom backend.** Firebase Auth (its hosted identity service) is the
  entire server-side surface this ticket introduces.
- **Home's own mocked greeting (`src/app/(tabs)/index.tsx:24-25`,
  `MOCK_USER_NAME`) is intentionally untouched.** The ticket's "a sign-in
  entry point on the Profile screen" scopes this work to Profile; wiring
  Home's greeting to the same `useAuth()` state is a plausible follow-up
  but would be additive scope this ticket doesn't ask for, per `CLAUDE.md`'s
  "additive diffs on working screens" applied to a screen this ticket
  doesn't otherwise touch.
- **Play Services availability, real-device cancellation behavior, and the
  exact `@react-native-firebase`/Android-Gradle version compatibility are
  design intent here, not verified against a real device** — flagged
  throughout Dependencies and Interfaces/API for implementation-time
  confirmation, the same "verify at implementation time" posture
  `health-connect-availability-permissions/SPEC.md` used for its own
  third-party-library uncertainties.
- **`google-services.json` must be provisioned before a CI-triggered build
  will work**, identical in shape to `CLAUDE.md`'s existing `eas
env:create`/`eas channel:create` callouts: it must be added as a
  file-type secret in the `preview` EAS Environment (see Interfaces/API)
  before a build has it, or Google Sign-In/Firebase Auth will silently fail
  in a built app while working in local dev — exactly the class of "works
  locally, fails in a build" mistake the ticket's SHA-1 note separately
  warns about.
- Android only, per `CLAUDE.md` — this ticket does not attempt or verify iOS
  or web behavior for `@react-native-firebase` or
  `@react-native-google-signin/google-signin`; both may or may not degrade
  gracefully on `pnpm web`, which is unconfirmed (see Dependencies).
