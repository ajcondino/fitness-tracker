# Feature: Cloud Settings Sync (Firestore)

## Intent

A signed-in user's units preference follows their account across devices —
synced to Firestore on every local change and pulled down on sign-in — while
a signed-out user's units preference keeps working exactly as it does today,
entirely offline and untouched by any of this.

## Context

- **Problem statement:** `src/units/units-store.ts` persists the units
  preference to AsyncStorage only; `src/hooks/use-auth.ts` establishes a
  signed-in identity (`docs/specs/firebase-auth-google-sign-in/SPEC.md`,
  landed) but writes nothing to any backend beyond Auth's own session. The
  sign-in pitch already shown to users — `account.signedOut.body` in
  `src/i18n/locales/en.json`, _"Sign in to carry your units to another
  phone"_ — describes behavior that doesn't exist yet. This ticket makes it
  true.
- **Current code:**
  - `src/units/units-store.ts` / `src/hooks/use-units-preference.ts` — the
    landed units-preference infrastructure (`docs/specs/units-preference/SPEC.md`).
    `useUnitsPreference()` owns the only React state for `distance`/`weight`
    and exposes `setDistanceUnit`/`setWeightUnit`, each an optimistic,
    fire-and-forget setter that updates state and persists to AsyncStorage.
    It's called exactly once in the app, in `src/app/profile.tsx:36`. This
    spec does not change `units-store.ts` or `use-units-preference.ts` — see
    Style & Conventions for why the sync layer sits beside them instead of
    inside them.
  - `src/auth/auth-client.ts` / `src/hooks/use-auth.ts` — the landed auth
    infrastructure (`docs/specs/firebase-auth-google-sign-in/SPEC.md`).
    `useAuth()` exposes `status: AccountSectionStatus` (`'checking' |
'signedOut' | 'signingIn' | 'signedIn' | 'error'`) and `user: AuthUser |
null` (`{ uid, displayName, email }`), called in `src/app/profile.tsx:27`
    and `src/app/(tabs)/index.tsx:50`. `signOut()` is structurally guaranteed
    to touch nothing outside `src/auth/*` — no import of
    `@react-native-async-storage/async-storage` or any local-persistence
    module exists anywhere in `src/auth/*`. This spec's own sign-out
    guarantee (see Behaviour) reuses that same structural argument rather
    than adding a new one.
  - `src/auth/auth-client.ts`'s `getFirebaseAuth()` — a one-line
    `getAuth(getApp())` passthrough, the direct precedent this spec's
    `getFirebaseFirestore()` mirrors. Its header comment also records a
    **live correction**: the SPEC that introduced it assumed a
    `FirebaseAuthTypes` namespace (the older namespaced API's types); the
    actually-installed `@react-native-firebase/auth@26.3.2` only exposes the
    modular API's flat `Auth`/`User` types. This spec's own Firestore type
    references (`FirebaseFirestoreTypes`, below) carry the identical risk
    and must be verified the same way before being relied on — see
    Interfaces / API.
  - `package.json` has `@react-native-firebase/app@^26.3.2` and
    `@react-native-firebase/auth@^26.3.2` installed; no
    `@react-native-firebase/firestore` yet (confirmed: absent from
    `package.json`, no `firestore` import anywhere in `src/`). `app.json`'s
    `plugins` array already lists `@react-native-firebase/app` and
    `@react-native-firebase/auth` as bare string entries.
  - No Firestore security rules file exists anywhere in this repo (confirmed
    by search) — per the ticket, they're already deployed directly against
    the Firebase project this app's `google-services.json` points at, and
    out of this repo's control. This spec treats the rule
    (`match /users/{userId}/{document=**} { allow read, write: if
request.auth.uid == userId; }`) as a fixed external constraint to design
    the write path against, not something to add or change here.
  - `src/health/health-connect-sync.ts` — the established "framework-free,
    never throws" shape for a module that bridges a local store to an
    external system. This spec's `src/sync/preferences-store.ts` deliberately
    does **not** follow that "never throws" convention — see Interfaces / API
    for why the swallow point is pushed one layer up, into
    `use-preferences-sync.ts`, instead.
  - `__mocks__/@react-native-firebase/auth.ts` and
    `src/auth/__tests__/auth-client.test.ts` — the established Jest
    manual-mock and mocked-module-call-assertion pattern this spec's
    Firestore mock and tests copy exactly.
- **User impact:** No visible change for a signed-out user. For a signed-in
  user, changing a units toggle on one device is reflected — after signing
  in — on another device's Profile screen; nothing else in the app reads or
  displays units yet (per `docs/specs/units-preference/SPEC.md`'s own
  Constraints), so the only observable effect is the toggle's own position.
- **Dependencies:** `@react-native-firebase/firestore` (new). Depends on the
  landed `firebase-auth-google-sign-in` and `units-preference` tickets (both
  confirmed landed above). No new Firebase console setup — same project,
  same `google-services.json`, rules already deployed.

## Data Model

**Document path:** `users/{uid}/preferences/settings` — a single document in
a `preferences` subcollection beneath the user, not a field on `users/{uid}`
itself. Chosen over "fields on the user document" because there is no
`users/{uid}` document for anything else yet (this ticket doesn't create
one), and a dedicated `preferences` subcollection keeps this ticket's one
concern (settings that sync) structurally separate from anything a future
ticket might put directly on `users/{uid}` (e.g., a cached display name) —
without needing to predict what that future document will hold. Both shapes
satisfy the deployed rule: `{document=**}` matches any document at any depth
under `users/{userId}`, including this one.

```ts
// src/sync/preferences-store.ts

export type PreferencesDocument = {
  units: UnitsPreference; // reused from '@/units/units-store' — not redefined
  updatedAt: FirebaseFirestoreTypes.FieldValue; // serverTimestamp() on write
};
```

- **`units: UnitsPreference`** (`{ distance: UnitSystem; weight: UnitSystem
}`) is the only preference synced. **Extensibility for language, without a
  migration:** a future ticket adds a sibling top-level field —
  `language: LanguageDocument` or similar — read/written independently of
  `units`, via its own `set(..., { merge: true })` call. No placeholder field
  is added now (that would be exactly the speculative structure the units
  ticket already flagged as out of scope for itself).
- **`updatedAt`** is written via `serverTimestamp()` (a `FieldValue`, not a
  client-clock `Date`) on every write. It is **not read or compared by this
  ticket's own conflict rule** (see Behaviour — the rule is "remote wins,"
  not "most-recently-changed"); it's included so a future change to the
  conflict rule (or a debugging need — "when did this last sync") doesn't
  require a schema change, matching the ticket's "leave room" instruction.
- **Not synced:** workouts, sessions, heart rate data, the paired BLE device
  ID, and (per this ticket) language. None of `src/ble/*`, `src/health/*`,
  `src/workout/*` is imported by anything this spec adds — see Style &
  Conventions.
- **Relationship to existing models:** `PreferencesDocument.units` is
  structurally identical to `units-store.ts`'s own `UnitsPreference` type,
  reused via import rather than duplicated. No other existing type changes.

## Interfaces / API

### `src/sync/firestore-client.ts` (new)

Mirrors `src/auth/auth-client.ts`'s shape exactly — a thin, single shared
call site, not a place for business logic.

```ts
export function getFirebaseFirestore(): Firestore;
// getFirestore(getApp()). No settings()/enablePersistence() call — see
// Offline behaviour below for why none is needed.
```

**Verify at implementation time** (per `AGENTS.md`, and per
`auth-client.ts`'s own header-comment precedent for exactly this class of
mistake): confirm against the installed `@react-native-firebase/firestore`
version whether its modular API exports a plain `Firestore` type directly
(mirroring `auth-client.ts`'s corrected `Auth`/`User`) or requires the
`FirebaseFirestoreTypes` namespace this spec assumes below — update every
type reference in this file and `preferences-store.ts` to match whichever is
actually exported, the same correction `auth-client.ts` already had to make
for Auth's types.

### `src/sync/preferences-store.ts` (new)

The Firestore analog of `src/units/units-store.ts` — same "one module owns
this path's reads and writes" shape, but **deliberately does not swallow
errors internally**, unlike every AsyncStorage-backed store in this repo.
Reasoning: `use-preferences-sync.ts` (below) needs to tell "no document
exists yet" (`null`, a normal case — seed it) apart from "the read failed"
(an exception — skip this sync attempt entirely, don't seed over unknown
remote state) and needs a genuine rejection on a failed write so its own
`.catch()` is the single, visible place that decision is made. Swallowing
here would collapse both distinctions.

```ts
export type PreferencesDocument = {
  units: UnitsPreference;
  updatedAt: FirebaseFirestoreTypes.FieldValue;
};

export async function fetchRemotePreferences(uid: string): Promise<PreferencesDocument | null>;
// doc(getFirebaseFirestore(), 'users', uid, 'preferences', 'settings') ->
// getDoc(...). Returns null when the document doesn't exist (a
// never-synced account — not an error). Rejects if the read itself throws
// (e.g. no cache and no network) — does not catch.

export async function writeRemotePreferences(uid: string, units: UnitsPreference): Promise<void>;
// setDoc(docRef, { units, updatedAt: serverTimestamp() }, { merge: true }).
// `merge: true` so a future sibling field (e.g. language) written by a
// different call never gets clobbered by this one. Rejects if the write
// throws — does not catch.
```

**Verify at implementation time**: `DocumentSnapshot`'s exists check —
whether the installed version's modular API exposes `snapshot.exists()` (a
method, matching the firebase-js-sdk-compatible shape `google-sign-in.ts`'s
own header comment describes this package as targeting) or `snapshot.exists`
(a boolean property, the older namespaced API's shape) — confirm against the
actually-installed `@react-native-firebase/firestore` version rather than
assuming either.

### `src/hooks/use-preferences-sync.ts` (new)

The only place this ticket's auth-status-driven behavior lives. Takes
already-loaded units state and its setters as parameters — it does **not**
call `useUnitsPreference()` or `useAuth()` itself (see Style & Conventions
for why a second call to either would be wrong here).

```ts
export function usePreferencesSync(params: {
  authStatus: AccountSectionStatus;
  uid: string | null;
  distance: UnitSystem;
  weight: UnitSystem;
  setDistanceUnit: (system: UnitSystem) => void;
  setWeightUnit: (system: UnitSystem) => void;
}): void;
```

Two independent effects:

1. **Pull, once per transition into `'signedIn'`.** A ref tracks the
   previous `authStatus`; when it was anything else and becomes `'signedIn'`
   (covers a real sign-in **and** a cold-start/remount session restore that
   lands directly on `'signedIn'` — both are "this device just confirmed
   which account it is," and re-pulling on the latter is a deliberate,
   low-cost broadening: it keeps a device that's been signed in for a while
   reasonably fresh on every Profile visit without any realtime listener),
   calls `fetchRemotePreferences(uid)`:
   - Resolves non-null → calls `setDistanceUnit`/`setWeightUnit` with the
     remote values. This is the **conflict rule: remote wins.** Chosen over
     most-recently-changed because no local "last changed at" is tracked
     today (`units-store.ts` stores only the current value, per its own
     spec), and inventing one solely to compare against `updatedAt` would be
     new structure for a rule the ticket says to "pick one deliberately,"
     not "build the more sophisticated one." Remote-wins also matches the
     ticket's own first-listed suggestion.
   - Resolves `null` (never-synced account) → does nothing here; effect 2
     below pushes the current local values up as the seed, since it also
     fires on this same `authStatus` transition.
   - Rejects (offline, no cache, permission issue) → caught and ignored.
     Local values stand for this session; the next successful pull (a future
     sign-in, or a future Profile visit while still signed in) tries again.
2. **Push, on every `distance`/`weight`/`authStatus`/`uid` change.** No-ops
   unless `authStatus === 'signedIn' && uid != null`. Calls
   `writeRemotePreferences(uid, { distance, weight })`, **not awaited**, with
   `.catch(() => {})` at the call site — a failed write is invisible to the
   caller, matching `use-health-connect-settings.ts`'s `setWriteBackEnabled`
   fire-and-forget precedent. This is what makes "on change while signed in,
   write through" true, and — because it also fires on the very render where
   `authStatus` first becomes `'signedIn'` — is what performs the "seed a
   never-synced account" write with no separate branch needed.

**Known, accepted transient ordering effect:** on a sign-in transition where
a genuine remote document already exists with different values, effect 2's
push (using the still-stale local values) and effect 1's pull can both be in
flight at once; effect 2 may write stale values to Firestore microseconds
before effect 1's resolution calls `setDistanceUnit`/`setWeightUnit`, which
re-triggers effect 2 and overwrites that stale write with the correct
(remote) values. The **final** state — both locally and in Firestore — is
always correct; only a sub-second intermediate Firestore value can be wrong,
and nothing in this app reads that intermediate state (no realtime listener
exists anywhere, and the ticket's own Out of scope excludes "real-time
multi-device updates while both are open"). Documented here as a deliberate
trade-off, not an oversight — closing it would require a readiness flag
gating effect 2 until effect 1 resolves, which is unjustified complexity for
a window nothing observes.

### `src/app/profile.tsx` (modified)

One additive wiring block, after the existing `useAuth()` and
`useUnitsPreference()` calls:

```ts
usePreferencesSync({
  authStatus,
  uid: user?.uid ?? null,
  distance,
  weight,
  setDistanceUnit,
  setWeightUnit,
});
```

No render output changes — this hook returns `void`. Nothing else on the
screen is touched.

### Offline behaviour (verify, don't build)

`@react-native-firebase/firestore`'s native SDK has offline persistence
enabled by default on Android (unlike the JS SDK — see
`docs/specs/firebase-auth-google-sign-in/SPEC.md`'s Context, which already
established this distinction while choosing the native SDK for this exact
reason). No `firestore().settings({ persistence: … })` call is added.
Concretely, this means:

- A `setDoc()` call made while offline resolves once the write reaches the
  server — while offline, its promise stays pending rather than rejecting,
  and the native SDK queues the write internally and flushes it once
  connectivity returns. Because `use-preferences-sync.ts`'s push effect
  never awaits this promise, "stays pending" is invisible to this app: no
  UI ever blocks on it, and there is nothing for this ticket to build to
  handle that pending state — the native SDK's queue **is** the "write
  reaches Firestore once connectivity returns" mechanism the Acceptance
  criteria ask for.
- A `getDoc()` call made while offline (during the pull) returns cached data
  if any exists on-device, or rejects if none does — both cases are already
  handled by effect 1's resolve/reject branches above.

**Verify at implementation time**: confirm this default against the
installed `@react-native-firebase/firestore` version's own docs/changelog
before relying on it — the ticket explicitly asks to confirm rather than
assume.

### Security rules (verify, don't change)

The deployed rule this write path must satisfy:

```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth.uid == userId;
}
```

`fetchRemotePreferences`/`writeRemotePreferences` are only ever called with
`uid: user?.uid ?? null` from `useAuth()`'s own `user.uid` — the
authenticated caller's own uid — and `use-preferences-sync.ts` never accepts
a uid from any other source. There is no code path that could construct a
request for another user's document, so `request.auth.uid == userId` holds
by construction. Confirmed by inspection, not by an automated rules test —
this repo has no Firestore Rules emulator/test harness, and adding one is
out of scope; verify the "another user's preferences are unreadable" claim
manually against the Firebase console/emulator if a stronger guarantee is
needed later.

## Files Created

| File                                               | Purpose                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/sync/firestore-client.ts`                     | Thin `getFirebaseFirestore()` passthrough — mirrors `auth-client.ts`.                                                                                 |
| `src/sync/__tests__/firestore-client.test.ts`      | Asserts `getFirestore(getApp())` wiring, mirroring `auth-client.test.ts`.                                                                             |
| `src/sync/preferences-store.ts`                    | `PreferencesDocument` type, `fetchRemotePreferences`, `writeRemotePreferences` — non-swallowing.                                                      |
| `src/sync/__tests__/preferences-store.test.ts`     | Doc-path assertion, null-vs-error distinction on read, `merge:true`+`serverTimestamp()` on write.                                                     |
| `src/hooks/use-preferences-sync.ts`                | The two effects: pull-once-on-sign-in, push-on-change.                                                                                                |
| `src/hooks/__tests__/use-preferences-sync.test.ts` | Signed-out no-op, remote-exists pull, never-synced seed, pull-failure swallow, push-on-change, push-failure swallow, sign-out stops further calls.    |
| `__mocks__/@react-native-firebase/firestore.ts`    | Jest manual mock: `getFirestore`, `doc`, `getDoc`, `setDoc`, `serverTimestamp`, all `jest.fn()` — mirrors `__mocks__/@react-native-firebase/auth.ts`. |

## Files Modified

| File                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `pnpm-lock.yaml`    | Add `@react-native-firebase/firestore` (version matching the installed `@react-native-firebase/app`/`auth` line, `^26.3.2`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `app.json`                           | **No change.** `@react-native-firebase/firestore` ships no Expo config plugin (no `app.plugin.js`, no `plugin/` export) — unlike `app`/`auth`, which each have one. Adding it as a bare string plugin entry makes `expo prebuild` fall back to `require()`-ing the package's own ESM `main` entry as a plugin, which throws (`Cannot require() ES Module .../dist/module/types/internal.js`). Confirmed by inspecting the installed package: no additional native config is needed beyond `@react-native-firebase/app`'s own plugin, which is what links every `@react-native-firebase/*` package that has none of its own — the original assumption below was wrong, corrected at implementation time (the same class of "verify against the actually-installed package" issue as the `FirebaseFirestoreTypes` correction above). |
| `src/app/profile.tsx`                | Add the `usePreferencesSync(...)` wiring block per Interfaces/API. No other change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/app/__tests__/profile.test.tsx` | Mock `usePreferencesSync` (new, alongside the existing `useAuth`/`useHealthConnectSettings`/`useUnitsPreference` mocks); assert it's called with the values/setters derived from those mocks' return values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `README.md`                          | One line under the existing "Firebase / Google Sign-In setup" section noting Firestore is used for preference sync on the same project/config, with no additional console setup — the rules are already deployed and aren't tracked in this repo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Implementation Steps

1. Confirm `@react-native-firebase/firestore`'s current release and exact
   modular-API shape against its own docs, per `AGENTS.md` — see every
   "Verify at implementation time" note above (the `Firestore`/`FieldValue`
   type export shape, `DocumentSnapshot.exists`). Run `npx expo install
@react-native-firebase/firestore`.
2. Add the `@react-native-firebase/firestore` plugin entry to `app.json`.
3. Create `__mocks__/@react-native-firebase/firestore.ts`.
4. Create `src/sync/firestore-client.ts` and its test, mirroring
   `auth-client.ts`/`auth-client.test.ts`.
5. Create `src/sync/preferences-store.ts` and its test: doc-path assertion
   (`users/{uid}/preferences/settings`), `fetchRemotePreferences` resolving
   `null` on a non-existent doc and propagating a thrown read, and
   `writeRemotePreferences` calling `setDoc` with `{ merge: true }` and a
   `serverTimestamp()`-derived `updatedAt`, propagating a thrown write.
6. Create `src/hooks/use-preferences-sync.ts` and its test, covering: no
   Firestore call while `authStatus` is `'checking'`/`'signedOut'` even
   across a `distance`/`weight` change; a transition to `'signedIn'` with an
   existing remote document calls `setDistanceUnit`/`setWeightUnit` with the
   remote values; a transition to `'signedIn'` with no remote document calls
   `writeRemotePreferences` with the current local values and never calls
   `setDistanceUnit`/`setWeightUnit`; a rejected `fetchRemotePreferences`
   doesn't throw and still allows the push effect to run; a `distance`/
   `weight` change while already `'signedIn'` calls `writeRemotePreferences`
   again; a rejected `writeRemotePreferences` doesn't throw; a transition to
   `'signedOut'` triggers no further Firestore call.
7. Wire `usePreferencesSync(...)` into `src/app/profile.tsx` per
   Interfaces/API.
8. Update `src/app/__tests__/profile.test.tsx`: mock `usePreferencesSync`,
   assert the call args match the other mocked hooks' return values
   (`authStatus`, `uid`, `distance`, `weight`, and both setters).
9. Add the README line noted in Files Modified.
10. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` and fix any failures.
11. Manual, on-device verification (not automatable from this spec, per the
    ticket's own Notes/verify): sign in on device A, change a units toggle,
    sign in to the same account on device B, confirm the toggle's position
    matches; sign out on device A, confirm the local toggle position is
    unchanged; toggle a unit in airplane mode, confirm no error/blocking UI
    and that it appears in Firestore once connectivity returns; sign in to a
    brand-new account with no prior preferences and confirm the document is
    created with the device's current local values rather than erroring.

## Style & Conventions

- **`src/sync/` is a new top-level domain folder**, matching the existing
  one-folder-per-concern pattern (`src/auth/`, `src/ble/`, `src/health/`,
  `src/units/`, `src/workout/`). Justified because "sync preferences to the
  account" is a genuinely distinct concern this ticket introduces — it isn't
  owned by `src/auth/` (which knows nothing about preferences) or
  `src/units/` (which knows nothing about accounts) — not a place to fold
  into either existing folder.
- **`preferences-store.ts` imports only the `UnitsPreference` _type_** from
  `@/units/units-store` — never `loadUnitsPreference`/`saveDistanceUnit`/
  `saveWeightUnit`. **`use-preferences-sync.ts` imports neither
  `@/units/units-store` nor `@react-native-async-storage/async-storage` at
  all** — it receives `distance`/`weight` and their setters as parameters
  from `profile.tsx`, which already owns the one `useUnitsPreference()` call
  in the app. This preserves each store's single-owner boundary and avoids
  the real bug a second `useUnitsPreference()` call site would create: two
  independent `useState`s backed by the same AsyncStorage keys, with no
  mechanism to keep them in sync within one render tree. (`useAuth()` has no
  equivalent hazard — Firebase's own auth-state listener is a shared
  external source of truth every instance observes consistently — but this
  spec still passes `authStatus`/`uid` down from `profile.tsx`'s existing
  `useAuth()` call rather than adding a second one, for symmetry and to keep
  `use-preferences-sync.ts`'s dependencies to plain values, not hooks.)
- `src/sync/*` never imports `src/ble/*`, `src/health/*`, or `src/workout/*`
  — mirrors the auth ticket's identical, structurally-enforced boundary for
  "sign-out doesn't touch local data," extended here to "this sync layer
  only ever touches units."
- **`preferences-store.ts` deliberately does not follow this repo's
  "never throws" store convention** (`units-store.ts`, `health-connect-store.ts`,
  `saved-device.ts`) — see Interfaces/API for why the swallow point moves to
  `use-preferences-sync.ts` instead. This is a stated, deliberate deviation,
  not an inconsistency: it exists because this is the first store in the
  repo where "not found" and "failed" must be distinguishable by the caller,
  which "always resolve a safe default" would erase.
- File naming: kebab-case filenames (`firestore-client.ts`,
  `preferences-store.ts`, `use-preferences-sync.ts`), matching `CLAUDE.md`.
- `render()` is async under `@testing-library/react-native` v14+ — any new
  component-adjacent test follows that pattern; none of this ticket's new
  files render a component directly, so this applies only to the
  `profile.test.tsx` additions.
- Additive diff on `profile.tsx`: one new import group and one new hook call
  block, no restructuring, per `CLAUDE.md`'s "additive diffs on working
  screens."
- Filed at `docs/specs/cloud-settings-sync-firestore/SPEC.md`, matching this
  repo's established `docs/specs/<feature>/SPEC.md` convention (already
  noted as a deviation from `CLAUDE.md`'s literal flat-`docs/*.md` text in
  every prior spec, including both this ticket's direct dependencies).

## Acceptance Criteria

- [ ] A signed-out user's units preference persists locally and never
      touches the network — `use-preferences-sync.test.ts` asserts neither
      `fetchRemotePreferences` nor `writeRemotePreferences` is called for any
      `authStatus` other than `'signedIn'`, including across a `distance`/
      `weight` change.
- [ ] Changing the units preference while signed in persists it to
      `users/{uid}/preferences/settings` — `preferences-store.test.ts`
      asserts the doc-path call args; `use-preferences-sync.test.ts` asserts
      `writeRemotePreferences` is called with the new values on a `distance`/
      `weight` change while `authStatus === 'signedIn'`.
- [ ] Signing in on a second device applies the account's units preference
      per the remote-wins rule — `use-preferences-sync.test.ts`'s
      transition-to-`'signedIn'`-with-existing-remote-document case asserts
      `setDistanceUnit`/`setWeightUnit` are called with the remote values.
- [ ] Signing out leaves the preference intact on the device — verified
      structurally (`useAuth().signOut()` never imports `src/units/*` or
      `src/sync/*`) and by `use-preferences-sync.test.ts`'s
      transition-to-`'signedOut'` case asserting no further Firestore call
      and no setter call.
- [ ] Changing the preference while offline updates locally and does not
      error or block: the push is fire-and-forget with a swallowed
      rejection (`use-preferences-sync.test.ts`'s push-failure case); "the
      write reaches Firestore once connectivity returns" is native SDK
      behavior verified manually per Implementation Steps' step 11, not by
      an automated test.
- [ ] Security rules prevent reading another user's preferences — verified
      by inspection (Interfaces/API's Security rules section: `uid` always
      comes from the authenticated caller's own `user.uid`) and by the
      already-deployed rule itself; not exercised by an automated rules test
      in this repo (none exists).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.

## Constraints

- **Units only.** No language field is added or reserved beyond the document
  shape's natural extensibility (a new sibling top-level field). No
  workouts, sessions, heart rate data, or paired-device ID is synced —
  `src/sync/*` imports nothing from `src/ble/*`, `src/health/*`, or
  `src/workout/*`.
- **No write queue.** Reliance on `@react-native-firebase/firestore`'s
  default native offline persistence is the entire offline story — see
  Interfaces/API's Offline behaviour section. If implementation-time
  verification finds persistence is _not_ on by default for the installed
  version, that's a blocking finding to raise before proceeding, not a cue
  to build a queue.
- **No realtime multi-device sync.** Sync happens on sign-in (including a
  session-restore landing directly on `'signedIn'`) and on local change
  only. Two devices signed in simultaneously will not see each other's
  changes live — the documented transient-ordering effect in Interfaces/API
  is an accepted consequence of this same non-goal, not a separate gap.
- **No custom backend, no Cloud Functions.** Firestore's own client SDK,
  called directly, is the entire mechanism.
- **No Firestore Rules test harness added.** The "another user's
  preferences are unreadable" acceptance criterion is verified by
  inspection and against the already-deployed rules, not by an emulator
  test suite — adding one is out of scope for this ticket.
- **The offline/online indicator is not built here**, per the ticket. A
  future one has two natural hook points this spec creates but doesn't wire
  up: `writeRemotePreferences`'s rejection (a recent-write-failed signal) or
  Firestore's own network-state listeners — neither is read or exposed
  anywhere in this ticket's own code.
- **No change to `units-store.ts`, `use-units-preference.ts`, or
  `units-section.tsx`.** All three are reused as-is; every effect of this
  ticket is additive, composed one layer above them.
