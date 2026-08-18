# Feature: Save and View Workout Sessions

## Intent

Tapping Save on Live Workout persists the just-finished session (raw samples,
not just its summary) to local storage and returns to the previous screen;
the History tab lists every saved session, most-recent first, with each
row's duration and average BPM derived from its samples at render time — so
a save is verifiable without debug logs, and the stored shape needs no
migration when pause/resume or a trace graph land later.

## Context

- **Problem statement:** `src/app/live-workout.tsx`'s Save button
  (`:224-231` today) is an intentional, documented no-op — a code comment
  notes "Workout persistence is a separate future ticket." Discard
  (`router.back()`) is the only way off the screen that does anything, so
  every workout, saved or not, currently ends the same way: gone. The
  History tab (`src/app/(tabs)/history.tsx`) is a static stub rendering only
  `t('tabs.history')` / `t('tabs.historySubtitle')` — there is no list, no
  empty state, and nothing in the repo reads or writes any workout data.
  `useWorkoutSession` (`src/hooks/use-workout-session.ts`, added by
  `live-workout-session-stats`) already accumulates exactly the raw
  `{ bpm, timestamp }[]` this ticket needs to persist
  (`WorkoutSessionSnapshot.samples`) and already derives `elapsedMs`/
  `averageBpm`/`maxBpm` from it at render time rather than tracking them as
  separate state — this ticket's stored-record shape and its
  read-time-derivation rule both extend that exact precedent to persistence,
  per the ticket's own "same principle the live screen already uses."
- **Current code:**
  - `src/app/live-workout.tsx:39-276` — the full screen. `deviceId` is
    captured once at mount via a lazy `useState` initializer (`:52-55`) and
    is `string` for the remainder of the render once the guard branch
    (`:72-102`) has returned; `device` (`:56`, a `DiscoveredDevice | null`)
    is looked up from `usePairingStore`'s `devices` array by that id, the
    same lookup the device chip (`:104-106`) already uses via
    `selectDeviceDisplayName`. `session` (`:68`) is a
    `WorkoutSessionSnapshot` from `useWorkoutSession(bpm, lastReadingAt)`.
    Discard (`:204-222`) calls only `router.back()` — no `bleManager`, no
    store action. Save (`:224-246`) is the no-op this ticket replaces.
  - `src/hooks/use-workout-session.ts` — exports `HeartRateSample`
    (`{ bpm: number; timestamp: number }`) and `WorkoutSessionSnapshot`
    (`{ startedAt, samples, elapsedMs, averageBpm, maxBpm }`), the latter
    computed fresh every render from `samples`/`startedAt`, never stored via
    its own `setState`. This ticket's persisted record reuses
    `HeartRateSample` directly (no duplicate type) and its own summary
    derivation deliberately mirrors — but, per Style & Conventions, does not
    import — this file's average/max math.
  - **No stale sample ever enters `session.samples` today**, which is what
    lets this ticket satisfy the ticket's disconnect-safety acceptance
    criterion with no new code: `useWorkoutSession`'s only append path
    (`:49-54`) fires exclusively on a **new** `lastReadingAt` value, and
    `lastReadingAt` (`use-live-heart-rate.ts:64-73`) is set only inside the
    HR monitor's listener on a **freshly arrived, successfully parsed**
    notification — never by the staleness-check interval, which only ever
    flips a boolean (`use-live-heart-rate.ts:84-89`). A disconnect (or a
    disconnect + auto-reconnect, per `ble-connection-loss-detection`/
    `auto-reconnect-after-drop`) simply stops `lastReadingAt` from changing;
    it cannot cause a stale/frozen BPM to be appended. Saving
    `session.samples` verbatim after any disconnect therefore already
    reflects only real readings.
  - `src/ble/saved-device.ts` — this app's only existing local-persistence
    module and its established convention, reused directly by this ticket:
    a thin `AsyncStorage`-backed module with zero BLE/Zustand/React import,
    every read/write wrapped in `try`/`catch` so a storage failure is
    "nothing saved," never a thrown error; a raw persisted value never
    contains a translated placeholder string (`SavedDevice.name` is the
    resolved name or `null` — never `"Unknown device"` baked in). This
    ticket's storage module (`src/workout/workout-store.ts`) and record
    type (`src/workout/workout-record.ts`) follow both rules exactly, and
    `@react-native-async-storage/async-storage` (already a dependency,
    already mocked at `__mocks__/@react-native-async-storage/async-storage.ts`)
    is reused as-is — no new package, no dev-client rebuild needed.
  - `src/app/(tabs)/history.tsx` — currently a centered stub
    (`alignItems`/`justifyContent: 'center'`), unlike `index.tsx`/`device.tsx`,
    which both use a top-aligned `flex: 1, padding: spacing.xl` container
    with real content below the header. This ticket changes History from a
    stub to a real screen, which is why its container layout changes too —
    not a "restructure a working screen" case, since History has never had
    working list behavior to preserve.
  - `<Tabs>`'s default `unmountOnBlur: false` (confirmed by
    `live-workout-screen`'s spec, relied on for `usePairingStore` staying
    mounted across a DEVICE tab blur) means History, once visited, **stays
    mounted** for the rest of the app session. A session saved from Live
    Workout while History is mounted-but-blurred would never appear without
    an explicit refetch-on-refocus — this ticket adds one via
    `useIsFocused()` (already imported from `expo-router` elsewhere, e.g.
    `use-device-pairing.ts:1`), the same dependency this repo already uses
    for focus-gated effects.
  - `DESIGN.md`'s `row-session` / `row-session-meta` tokens (`:215-224`) and
    "Session row" component spec (`:541-546`) already name this exact
    surface: `surface` on `outline`, `md` radius, a 44px date column
    (`label-micro` month over `stat-sm` day), a 1px × 34px divider, title in
    `title-sm`, a meta line of `data-md` (duration muted, average BPM
    yellow, separated by a 3px dot), and a trailing chevron. This ticket
    reuses every part of that token **except the trailing chevron** — see
    the UI decision below.
  - No UUID/id-generation utility exists anywhere in this repo (`expo-crypto`
    is not a dependency; grepped `src/` and `package.json` for `randomUUID`/
    `uuid`/`nanoid` — no matches). See Dependencies for why this ticket adds
    a small local helper instead of a new package.
- **User impact:** Tapping Save on Live Workout ends the session, writes it
  to local storage, and returns to the previous screen exactly as Discard
  already does navigation-wise — the only visible difference is that the
  session now exists afterward. Save is disabled with a hint when the
  device never delivered a single reading (nothing meaningful to save).
  History shows a real list — one row per saved session, most recent first,
  each showing when it happened, how long it lasted, and its average BPM —
  or a one-line empty state on a fresh install. Live Workout's staleness
  indicator, reconnect handling, and live stats are all otherwise untouched.
- **Dependencies:** No new package.
  `@react-native-async-storage/async-storage` (already installed, per
  `persist-last-connected-device`) is reused for this ticket's storage too.
  Builds on `useWorkoutSession` (`live-workout-session-stats`),
  `usePairingStore`/`DiscoveredDevice` (`ble-device-scanning`), and
  `selectDeviceDisplayName` (`ble-device-scanning`). **Session ids are a
  small local helper (`createWorkoutId`), not `expo-crypto`'s
  `Crypto.randomUUID()`:** `expo-crypto` would be this app's first new
  native module since `saved-device`'s own
  `@react-native-async-storage/async-storage` addition, requiring another
  Android dev-client rebuild for a need fully met by `` `${startedAt}-
${Math.random().toString(36).slice(2, 10)}` `` — a timestamp plus a random
  suffix is more than sufficient uniqueness for a single-device, one-user-
  at-a-time local app, and mirrors this repo's existing bias toward a small
  dependency-free helper over a package for a narrow need (`heart-rate.ts`'s
  own base64 decoder, per its spec's Style & Conventions).

### UI decision: reuse `row-session` without its trailing chevron

`DESIGN.md`'s "Session row" component description includes a trailing `›`
chevron, which implies tapping through to a detail screen. This ticket's own
"Out of scope" list is explicit that rows are not tappable yet — the detail
screen is a future ticket's home. Rather than add a chevron that visually
promises a tap nothing currently honors, `SessionRow` (this ticket's new
component) renders every other part of the token (date column, divider,
title, meta line) and omits the chevron and any `onPress`/`Pressable`
wrapper — a plain `View`. This is flagged here as a deliberate, narrow
deviation from `DESIGN.md`'s literal component text, not an oversight; the
future detail-view ticket adding tap-through can add the chevron and wrap
the row in a `Pressable` without changing anything else about this
component.

### Design decision: Save is blocked at zero samples, allowed at one or more

The ticket asks this spec to decide what happens when a session has "very
few or zero samples." Zero samples is the only case that can actually
produce `NaN`/`undefined` stats — `WorkoutSummary`'s average is a division
by `samples.length`, so `samples.length === 0` is precisely the boundary
that matters, not some smaller arbitrary threshold. This spec blocks Save
only at exactly zero samples (the device never delivered a single reading)
and allows it from one sample upward: a one-sample session yields a
zero-duration, well-defined average/max (that single BPM value) — a
legitimate, if trivial, "the user saved immediately" session, not an error
case. Save's `Pressable` gains `disabled={!canSave}` (`canSave =
session.samples.length > 0`) plus a hint line rendered only while disabled,
mirroring the exact disabled-with-hint pattern `live-workout-screen`
established for Home's Start Workout control
(`src/app/(tabs)/index.tsx:70-95`) — this app already has one precedented
way to say "this action isn't available yet, here's why," and this ticket
reuses it rather than inventing a second (e.g. a toast or an `Alert`).

## Data Model

```ts
// src/workout/workout-record.ts — framework-free (no BLE/Zustand/React/
// AsyncStorage import): types and pure derivation only, mirroring
// pairing-types.ts's "framework-free, pure derivations" layer.

import type { HeartRateSample } from '@/hooks/use-workout-session';

export const WORKOUT_RECORD_SCHEMA_VERSION = 1;

export type WorkoutDevice = {
  id: string;
  // Mirrors SavedDevice.name's rule exactly: the resolved display name at
  // save time, or null — never a translated placeholder. Screens re-derive
  // the "Unknown device" fallback at render time, same as SavedDevice.
  name: string | null;
};

/**
 * Placeholder shape for a closed pause interval. Nothing in this ticket
 * ever writes an entry — `pauses` is always `[]` on every record this
 * ticket saves. Reserved purely so pause/resume (the next ticket) has a
 * field to write into without migrating already-saved records; its exact
 * shape may still be revised by that ticket (WORKOUT_RECORD_SCHEMA_VERSION
 * exists for exactly that eventuality).
 */
export type WorkoutPause = { startedAt: number; endedAt: number };

/**
 * The full persisted record — enough to reconstruct the session, not just
 * its summary. Deliberately has NO averageBpm/maxBpm/durationMs field: per
 * the ticket, those are derived from `samples`/`startedAt` at read time via
 * `deriveWorkoutSummary` below, exactly once, on every read — never stored,
 * so a future time-in-zone feature or trace graph reads `samples` with no
 * migration and no re-recording.
 */
export type WorkoutRecord = {
  schemaVersion: number;
  id: string;
  startedAt: number;
  samples: HeartRateSample[];
  device: WorkoutDevice;
  pauses: WorkoutPause[];
};

export type WorkoutSummary = {
  durationMs: number;
  averageBpm: number | null;
  maxBpm: number | null;
};
```

**Invariants:**

- `WorkoutRecord` is written once and never mutated or re-saved under the
  same `id` — there is no edit/delete in this ticket (separate future
  ticket, per Out of scope), so a record's `samples` never changes after
  `saveWorkoutSession` returns.
- `deriveWorkoutSummary` is a pure function of its `WorkoutRecord` argument
  alone — no I/O, no BLE, no store.
- Every record this ticket ever saves has `samples.length >= 1` (see the
  Save-is-blocked-at-zero-samples decision above) — `deriveWorkoutSummary`'s
  `samples.length === 0` branch exists only to be safe against a
  hypothetical corrupt/legacy record, not because this ticket's own Save
  path can produce one.

## Interfaces / API

### `src/workout/workout-record.ts` (new)

```ts
export function deriveWorkoutSummary(record: WorkoutRecord): WorkoutSummary;
```

- `samples.length === 0` → `{ durationMs: 0, averageBpm: null, maxBpm: null }`
  (never `NaN` — the reduce/`Math.max` that would otherwise run on an empty
  array is short-circuited by this branch).
- Otherwise: `durationMs = samples[samples.length - 1].timestamp -
startedAt` (the session's own last real reading, not `Date.now()` — there
  is no "now" for a finished, persisted session, so duration is derived
  purely from `samples`/`startedAt`, per the ticket); `averageBpm` = the
  arithmetic mean of `samples[].bpm`; `maxBpm` = their maximum. This
  intentionally re-implements — rather than imports —
  `useWorkoutSession`'s two-line average/max math; see Style & Conventions
  for why.

```ts
export function createWorkoutId(startedAt: number): string;
```

Returns `` `${startedAt}-${Math.random().toString(36).slice(2, 10)}` ``. Not
cryptographically unique, but collision-proof enough for a single-device,
sequential-saves app — see Dependencies.

### `src/workout/workout-store.ts` (new)

```ts
export async function saveWorkoutSession(record: WorkoutRecord): Promise<void>;
export async function loadWorkoutSessions(): Promise<WorkoutRecord[]>;
```

Storage layout — **one `AsyncStorage` key per session record, plus one
small index key** holding only ids, not a single ever-growing array of full
records:

- `workout.session.<id>` → one JSON-serialized `WorkoutRecord`.
- `workout.sessionIndex` → one JSON-serialized `string[]` of ids, ordered
  most-recent-saved-first.

This is the ticket's own "one key per session versus a single array under
one key" trade-off, decided in favor of one-key-per-session: appending a
new session is a single small-index read/write plus one new record write,
independent of how much history already exists — a single-array-under-one-
key design would instead require reading, parsing, and rewriting **every**
past session's full sample array on every single save, an ever-growing cost
and a single-point-of-corruption risk (one bad write corrupts all history
at once, not just the newest session). `loadWorkoutSessions` still reads
each session's own full record to derive its row's stats (see Constraints
for the honest limit this leaves in place, and why it's acceptable for this
app's realistic session count).

- `saveWorkoutSession(record)`: `setItem`s `workout.session.<id>` with
  `JSON.stringify(record)`, then reads/parses `workout.sessionIndex`
  (tolerantly — a missing key or unparseable value is treated as `[]`,
  never thrown), and writes back `[record.id, ...ids.filter((existing) =>
existing !== record.id)]` — new ids are prepended, so the index is always
  most-recent-first without a separate sort step anywhere. Every step is
  wrapped in `try`/`catch`; a thrown error is swallowed (matches
  `saveDevice`'s "a failed write just means it doesn't show up later, not a
  user-facing failure" contract) — never thrown back to the caller.
- `loadWorkoutSessions()`: reads `workout.sessionIndex` (`[]` for a missing
  or unparseable value, never thrown); if empty, resolves `[]` immediately
  (no further reads). Otherwise calls `AsyncStorage.multiGet` with each id's
  `workout.session.<id>` key (`multiGet` preserves input-array order, so
  the result is already most-recent-first, matching the index — no extra
  sort). Each returned value is parsed and validated by a private
  `parseWorkoutRecord` (shape-checks `schemaVersion`/`id`/`startedAt` as the
  right primitive types, `samples`/`pauses` as arrays, `device.id` as a
  string — mirrors `loadSavedDevice`'s validation depth); a `null` value
  (key missing) or a failed validation is skipped, not thrown and not
  included in the result — one corrupt or missing entry never breaks the
  rest of the list. Any thrown error anywhere in this function resolves
  `[]`, never rejects.

### `src/app/live-workout.tsx` (modified — additive except Save's body)

```ts
const canSave = session.samples.length > 0;

const save = () => {
  if (!canSave) return; // Pressable is already `disabled`; defensive, matches
  // the same double-guard `home.tsx`'s goToLiveWorkout already uses.
  const record: WorkoutRecord = {
    schemaVersion: WORKOUT_RECORD_SCHEMA_VERSION,
    id: createWorkoutId(session.startedAt),
    startedAt: session.startedAt,
    samples: session.samples,
    device: { id: deviceId, name: device?.name ?? device?.lastKnownName ?? null },
    pauses: [],
  };
  void saveWorkoutSession(record); // fire-and-forget — same contract as
  // use-device-pairing.ts's `void saveDevice(saved)`; the write is not
  // awaited before navigating back.
  router.back();
};
```

Save's `Pressable` gains `disabled={!canSave}` and
`accessibilityState={{ disabled: !canSave }}` (mirroring
`index.tsx:73-74`'s Start Workout control exactly); its `onPress` becomes
`save` (was an inline empty-comment no-op). A new hint line, rendered only
when `!canSave`, sits below the existing action row (additive — the
Discard/Save row's own layout is untouched):

```tsx
{
  !canSave && (
    <ThemedText variant="bodySm" color="onSurfaceMuted" style={styles.saveDisabledHint}>
      {t('liveWorkout.saveDisabledHint')}
    </ThemedText>
  );
}
```

No other line in this file changes: the guard branch, status line,
reconnecting line, BPM readout, stats row, Discard, and the `__DEV__`
trigger are all untouched.

### `src/components/session-row.tsx` (new)

```ts
export type SessionRowProps = {
  monthLabel: string; // e.g. "AUG" — caller-formatted, already uppercase
  dayLabel: string; // e.g. "17"
  timeLabel: string; // e.g. "6:42 PM" — this row's title line
  durationLabel: string; // e.g. "42:10" — mm:ss, same convention as Live Workout
  averageBpmLabel: string; // e.g. "134", or "--" for a null average
};

export function SessionRow(props: SessionRowProps): JSX.Element;
```

Purely presentational — no date math, no `Intl`, no i18n lookups inside the
component itself; every label arrives pre-formatted from the caller (History
computes them), the same division of labor `SavedDeviceRow` already uses
(caller resolves the fallback/formatting, the row only renders strings).
`row-session`/`row-session-meta` tokens per DESIGN.md: `surface` background,
`outline` border, `md` radius, 16px padding; a 44px-wide date column
(`labelMicro`/`onSurfaceDim` month over `statSm`/`onSurface` day); a 1×34px
`outline`-colored divider; then `timeLabel` in `titleSm`/`onSurface`, and a
meta row below it — `durationLabel` in `dataMd`/`onSurfaceMuted`, a 3px dot,
`averageBpmLabel` in `dataMd`/`primary`. No chevron, no `Pressable` — see
the UI decision above.

### `src/app/(tabs)/history.tsx` (modified — full implementation, replacing the stub)

```ts
const { t, i18n } = useTranslation();
const isFocused = useIsFocused();
const [sessions, setSessions] = useState<WorkoutRecord[] | undefined>(undefined);
// undefined = not yet loaded this focus; WorkoutRecord[] (possibly []) =
// loaded — mirrors use-device-pairing.ts's savedDevice undefined/null/value
// three-state pattern, applied to a list instead of a single value.

useEffect(() => {
  if (!isFocused) return;
  let cancelled = false;
  loadWorkoutSessions().then((records) => {
    if (!cancelled) setSessions(records);
  });
  return () => {
    cancelled = true;
  };
}, [isFocused]);
```

Refetches every time the tab regains focus — including the first time it's
ever focused — not just on mount, because `<Tabs>`'s `unmountOnBlur: false`
(per Context) means a session saved from Live Workout while History is
mounted-but-blurred needs a refetch on refocus to appear; a plain `useEffect(
() => {...}, [])` would only ever run once per app session and would miss
every save after the first visit.

Render: existing header (`t('tabs.history')` / `t('tabs.historySubtitle')`)
unchanged, then:

- `sessions === undefined` (not yet loaded this focus): renders nothing
  further below the header — the read is a local `AsyncStorage` read,
  expected to resolve well within a frame; no spinner convention exists
  elsewhere in this app for a read this fast (see Constraints).
- `sessions.length === 0`: one line, `t('history.sessions.empty')`,
  matching the existing `pairing.nearbyDevices.empty` / `previouslyPaired.
emptyGranted` empty-line convention (not a title+subtitle treatment — that
  pattern is reserved for a full-screen guard branch like Live Workout's,
  not an inline section).
- `sessions.length > 0`: a `FlatList` (`data={sessions}`, `keyExtractor={
(record) => record.id}`), each row rendering `deriveWorkoutSummary(record)`
  and formatting it plus `record.startedAt` into `SessionRow`'s props via
  two small, screen-local helpers colocated in this file — the same
  "screen-local presentation logic, not extracted to a shared module"
  treatment `live-workout.tsx`'s own `formatElapsed`/`selectStatusCopy`
  already get:

  ```ts
  function formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatMonth(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).toUpperCase();
  }

  function formatTime(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  ```

  `formatDuration` intentionally duplicates `live-workout.tsx`'s
  `formatElapsed` (same mm:ss, no-hour-rollover math, different name because
  its input is a finished session's duration, not a live-ticking elapsed
  value) rather than extracting a shared util — see Style & Conventions.
  `formatMonth`/`formatTime` use `i18n.language` as the `Intl` locale
  (this app supports only `'en'` today per `src/i18n/index.ts`, but this
  keeps the row's date formatting locale-correct with no change needed if a
  second locale is ever added) and are **not** run through `t(...)` — this
  mirrors `device-row.tsx`'s existing `formatRssi`'s "formatted primitive,
  not translated copy" treatment, not a new deviation from `CLAUDE.md`'s
  i18n rule (which governs user-facing string _copy_, not locale-aware
  number/date formatting).

  Average BPM label: `summary.averageBpm == null ? '--' : String(Math.round(
summary.averageBpm))` — the same `'--'` convention Live Workout already
  uses, defensively kept even though every record this ticket's own Save
  path produces has `averageBpm !== null` (see Data Model's invariant).

Container layout changes from the stub's centered `alignItems`/
`justifyContent: 'center'` to `flex: 1, padding: spacing.xl` (top-aligned,
matching `index.tsx`/`device.tsx`) — necessary because a real list cannot be
vertically centered the way a static two-line stub was.

### `src/i18n/locales/en.json` (modified)

```json
{
  "liveWorkout": {
    "saveDisabledHint": "Wait for a reading before saving"
  },
  "history": {
    "sessions": {
      "empty": "No workouts saved yet."
    }
  }
}
```

Every other existing key is unchanged.

## Files Created

| File                                            | Purpose                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/workout/workout-record.ts`                 | Framework-free `WorkoutRecord`/`WorkoutDevice`/`WorkoutPause`/`WorkoutSummary` types, `deriveWorkoutSummary`, `createWorkoutId`. |
| `src/workout/__tests__/workout-record.test.ts`  | Unit tests for the derivation and id helper above.                                                                               |
| `src/workout/workout-store.ts`                  | `saveWorkoutSession`/`loadWorkoutSessions`, the `AsyncStorage`-backed I/O layer.                                                 |
| `src/workout/__tests__/workout-store.test.ts`   | Unit tests for the storage module above.                                                                                         |
| `src/components/session-row.tsx`                | Presentational History row per `DESIGN.md`'s `row-session` token (minus the chevron — see UI decision).                          |
| `src/components/__tests__/session-row.test.tsx` | Render tests for the component above.                                                                                            |

## Files Modified

| File                                        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/live-workout.tsx`                  | Save's `onPress` builds and persists a `WorkoutRecord` then calls `router.back()`; Save's `Pressable` gains `disabled`/`accessibilityState` from a new `canSave` check; a new hint line renders only while disabled. No other line changes.                                                                                                                                                                                                                                                                                        |
| `src/app/__tests__/live-workout.test.tsx`   | Mock `@/workout/workout-store`. Replace the existing "Save is present, tappable, triggers no navigation" case with: (a) samples present → Save calls `saveWorkoutSession` with the expected record shape and calls `router.back()`; (b) samples empty → Save is disabled, hint text visible, tap is a no-op (`saveWorkoutSession` never called, `back` never called). Every other existing case (guard branch, live/stale, Discard, dev-trigger, `connectionLost`/`reconnecting`/`reconnectFailed` regressions) passes unmodified. |
| `src/app/(tabs)/history.tsx`                | Replaces the stub body with the load-on-focus/list/empty-state implementation per Interfaces/API. Container layout changes from centered to top-aligned.                                                                                                                                                                                                                                                                                                                                                                           |
| `src/app/(tabs)/__tests__/history.test.tsx` | New file (none exists today). Cases per Acceptance Criteria below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/i18n/locales/en.json`                  | Add `liveWorkout.saveDisabledHint` and the new `history.sessions.empty` namespace. Existing keys untouched.                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Implementation Steps

1. Create `src/workout/workout-record.ts` (types, `deriveWorkoutSummary`,
   `createWorkoutId`) and its test — fully unit-testable in isolation, no
   dependency on anything else created in this ticket.
2. Create `src/workout/workout-store.ts` (`saveWorkoutSession`,
   `loadWorkoutSessions`) and its test, using the existing
   `__mocks__/@react-native-async-storage/async-storage.ts` mock (no new
   mock needed — already picked up automatically by Jest, per
   `persist-last-connected-device`).
3. Add the `liveWorkout.saveDisabledHint` / `history.sessions.empty` keys to
   `src/i18n/locales/en.json`.
4. Modify `src/app/live-workout.tsx`: add `canSave`/`save`, wire Save's
   `Pressable`, add the disabled hint line. Update
   `src/app/__tests__/live-workout.test.tsx` per Files Modified.
5. Create `src/components/session-row.tsx` and its test, following
   `device-row.tsx`/`saved-device-row.tsx`'s existing file shape (named
   export, `StyleSheet.create` at the bottom, `useTheme()` for tokens).
6. Rewrite `src/app/(tabs)/history.tsx` per Interfaces/API and create
   `src/app/(tabs)/__tests__/history.test.tsx`.
7. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
8. Manually verify on a dev-client build (`pnpm android`): start a workout,
   let a few real (or simulated-dropout) readings arrive, tap Save, confirm
   History shows the row; force-quit and relaunch the app, confirm the
   session is still there (the cold-start acceptance criterion needs a real
   process restart, not just a JS reload).

## Style & Conventions

- **Storage stays a thin, framework-free I/O module, mirroring
  `saved-device.ts`.** `workout-store.ts` imports only `AsyncStorage` and
  `workout-record.ts`'s types — no BLE, no Zustand, no React. Every
  read/write is `try`/`catch`-wrapped and never throws, matching
  `saved-device.ts`'s "a stale/failed save must never block or confuse the
  normal path" rule applied to a list instead of a single value.
- **`deriveWorkoutSummary` deliberately does not import
  `useWorkoutSession`'s average/max math**, even though the arithmetic is
  identical. `useWorkoutSession` is a hook (stateful, effect-driven,
  already tested against live BPM/timing behavior); `deriveWorkoutSummary`
  is a pure function over a finished, immutable record. Extracting a shared
  two-line helper to avoid this small duplication would mean either
  changing the tested, working hook's internals (against `CLAUDE.md`'s
  "additive diffs on working screens," applied here to working hooks) or
  adding a third file whose only job is "hold two lines of math" — out of
  proportion to the duplication it would remove. The one-source-of-truth
  principle the ticket asks for is about the **persisted record's shape**
  (no baked-in stat fields) — see the Data Model comment — not about a
  single shared implementation of `Math.max`/`reduce`.
- **One `AsyncStorage` key per session, not a single growing array.** See
  Interfaces/API's storage-layout note for the full trade-off; this is the
  ticket's own explicit "consider this" resolved in code.
- **`SessionRow` takes only pre-formatted strings**, no dates/numbers/i18n
  inside it — matches `SavedDeviceRow`'s division of labor (the row renders,
  the screen resolves).
- Component file is kebab-case (`session-row.tsx`), component name is
  PascalCase (`SessionRow`), per `CLAUDE.md`.
- Every user-facing string is a new `en.json` key rendered via `t(...)`; the
  `Intl`-formatted date/duration/BPM figures are formatted primitives (the
  same category as `device-row.tsx`'s `formatRssi` and `live-workout.tsx`'s
  `bpm ?? '--'`), not copy, and are not run through `t(...)`.
- New tests colocated under each module's own `__tests__/`, matching every
  existing precedent in this repo.

## Acceptance Criteria

- [ ] `deriveWorkoutSummary` on a record with 0 samples returns
      `{ durationMs: 0, averageBpm: null, maxBpm: null }` — never `NaN`.
- [ ] `deriveWorkoutSummary` on a record with 1 sample returns
      `durationMs: 0` and `averageBpm`/`maxBpm` both equal to that sample's
      `bpm`.
- [ ] `deriveWorkoutSummary` on a multi-sample record returns the correct
      arithmetic mean, the correct maximum, and `durationMs` equal to the
      last sample's `timestamp` minus `startedAt`.
- [ ] `createWorkoutId` returns a string containing the given `startedAt`;
      two calls with the same `startedAt` return different ids.
- [ ] `saveWorkoutSession` then `loadWorkoutSessions` round-trips a record
      unchanged (deep-equal, including `samples`, `device`, `pauses: []`,
      `schemaVersion`).
- [ ] Saving three sessions in sequence and then calling
      `loadWorkoutSessions` returns them most-recent-first.
- [ ] `loadWorkoutSessions` resolves `[]` (never throws) when nothing has
      been saved, when the index key holds corrupt JSON, and when
      `AsyncStorage.getItem`/`multiGet` rejects.
- [ ] A session index entry whose backing record key is missing or holds
      invalid JSON is skipped by `loadWorkoutSessions`, without affecting
      any other returned record.
- [ ] `saveWorkoutSession` swallows a thrown `AsyncStorage` error rather
      than rejecting.
- [ ] Live Workout: with `session.samples.length === 0`, Save is disabled
      (`accessibilityState.disabled === true`), the hint text is visible,
      and tapping it calls neither `saveWorkoutSession` nor `router.back()`.
- [ ] Live Workout: with `session.samples.length > 0`, tapping Save calls
      `saveWorkoutSession` once with a record whose `samples` equals
      `session.samples`, `startedAt` equals `session.startedAt`, `device.id`
      equals the connected device's id, `pauses` equals `[]`, and
      `schemaVersion` equals `WORKOUT_RECORD_SCHEMA_VERSION`; and calls
      `router.back()` exactly once.
- [ ] Live Workout: Discard still calls only `router.back()` — never
      `saveWorkoutSession`, never any `bleManager`/pairing-store call.
- [ ] Live Workout's pre-existing cases (guard branch, live/stale status,
      elapsed/avg/max stats rendering, `connectionLost`/`reconnecting`/
      `reconnectFailed` regressions, the `__DEV__` trigger) all pass
      unmodified.
- [ ] History renders `t('history.sessions.empty')` and no `SessionRow` when
      `loadWorkoutSessions` resolves `[]`.
- [ ] History renders one `SessionRow` per returned record, in the order
      `loadWorkoutSessions` returned them (most-recent-first), with
      `durationLabel`/`averageBpmLabel` matching `deriveWorkoutSummary`'s
      output for that record.
- [ ] History calls `loadWorkoutSessions` again when the tab regains focus
      after having lost it (simulated via toggling a mocked `useIsFocused`),
      not only on first mount.
- [ ] No new string is inline in JSX — all new copy renders via `t(...)`;
      date/duration/BPM figures are formatted, not translated, matching the
      existing `formatRssi`/`bpm ?? '--'` precedent.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: Save + History list only. No history detail view (rows are not
  tappable — no chevron, no `Pressable`, no navigation), no delete/edit/
  rename, no pause/resume behavior (only the empty `pauses: []` field and
  `schemaVersion` are reserved), no zones/%-of-max/max-HR config/live trace
  graph, and no sync/export/backend — all per the ticket's own Out of scope
  list. `WorkoutPause`'s shape is provisional; the pause/resume ticket may
  revise it, which is exactly what `schemaVersion` exists to make safe.
- **No cap on the number of stored sessions, and `loadWorkoutSessions` reads
  every saved session's full record (including its `samples`) on every
  History focus.** The one-key-per-session layout avoids the worse
  single-ever-growing-array anti-pattern (see Interfaces/API), but does not
  eliminate the fact that rendering N summary rows today means parsing N
  full sample arrays. This is judged proportionate for a personal fitness
  app's realistic session count (dozens to low hundreds over the app's
  life) and is the same "accepted, unlikely-to-matter at this scale" call
  `live-workout-session-stats` made for unbounded live sample growth. If
  session count or per-session sample count ever makes this a real cost, a
  future ticket could cache each record's derived summary in the index
  itself — deliberately not done here, to keep this ticket's record shape
  free of any stored, potentially-stale derived field.
- **Save's write is fire-and-forget, not awaited before navigating back.**
  If the app is force-killed in the brief window between tapping Save and
  the `AsyncStorage.setItem` calls completing, the session can be lost.
  This mirrors `saveDevice`'s identical existing risk profile in
  `use-device-pairing.ts`'s `connect()` success path — not a new risk this
  ticket introduces, and out of proportion to guard against for a local
  training app.
- **No double-tap guard on Save beyond the `disabled` prop.** A double tap
  in the instant before `router.back()` unmounts the screen could in theory
  fire `save()` twice, producing two saved records with different
  `createWorkoutId` outputs for what was really one session. Not otherwise
  guarded — matches this codebase's existing level of tap-debounce care
  (`cancelConnect`/`retryScan` are similarly unguarded), and no acceptance
  criterion requires it.
- **`Intl` is assumed fully available in this app's Hermes runtime with no
  polyfill** (`android/gradle.properties`'s `hermesEnabled=true`, default
  ICU-inclusive Hermes build, no `jsEngine`/Intl-stripping flag found in
  `app.json` or Gradle config) — re-verify this holds at implementation
  time per `AGENTS.md`'s "Expo has changed" instruction, the same
  re-verification `live-workout-screen`'s spec asked for on the
  `react-native-ble-plx` API surface.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
