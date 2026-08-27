# Feature: Health Connect Workout Sync

## Intent

Saving a workout writes it to Health Connect automatically when write-back is
enabled and permission is granted, and every session — old or new, freshly
saved or previously failed — carries a status any screen can show and a
single retry path any screen can call, so a user always knows whether a
session made it and can always get it there.

## Context

- **Problem statement:** Health Connect capability and consent already exist
  (`health-connect-availability-permissions`), but nothing ever calls
  `insertRecords` — grepped `src/`: no reference anywhere. `WorkoutRecord`
  (`src/workout/workout-record.ts:32-40`) has no field to hold a write
  outcome, `saveWorkoutSession`/`loadWorkoutSession`/`loadWorkoutSessions`
  (`src/workout/workout-store.ts`) never touch Health Connect, and no UI
  anywhere shows sync status or offers a retry. This ticket is the write
  path the settings ticket's toggle and permission were built for.
- **Current code:**
  - `src/health/health-connect-client.ts` — `checkHealthConnectPermission()`
    (read-only, no dialog, safe to call anywhere) and
    `requestHealthConnectPermission()` (dialog-showing, reserved for
    Profile's explicit `grantAccess()`) already exist and are reused as-is;
    this ticket adds no new function here and never calls
    `requestHealthConnectPermission()` — a revoked/ungranted permission at
    write time is a fact this ticket reacts to, never a prompt it triggers.
  - `src/health/health-connect-store.ts` — `loadWriteBackEnabled()` (defaults
    `true`) is the toggle this ticket's automatic path gates on. Reused
    as-is.
  - `react-native-health-connect@4.1.3` (`package.json:38`) is already
    installed — confirmed against the package's own shipped type
    declarations (`node_modules/react-native-health-connect/lib/typescript/`):
    `insertRecords(records: HealthConnectRecord[]): Promise<string[]>`
    (`index.d.ts:60`), `ExerciseSessionRecord` (`recordType: 'ExerciseSession'`,
    required `exerciseType: number`, `startTime`/`endTime` as ISO 8601
    strings via `IntervalRecord`) and `HeartRateRecord` (`recordType:
'HeartRate'`, `samples: { time: string; beatsPerMinute: number }[]`, also an
    `IntervalRecord`) in `types/records.types.d.ts:59-77`, and the
    `ExerciseType` numeric-constant map (`OTHER_WORKOUT: 0`, among ~80
    named activities) in `constants.d.ts:76+`. **No new package.**
  - `src/hooks/use-workout-session.ts:73-79` — the hook's only sample-append
    path fires exclusively while `phase === 'running'`, gated on a fresh
    `lastReadingAt`; the staleness check (`use-live-heart-rate.ts`) only ever
    flips a status flag, never appends. **Confirmed: no stale or paused
    sample can ever enter `session.samples`, and therefore never
    `WorkoutRecord.samples`** — this ticket's writer maps `record.samples`
    verbatim, with no re-filtering, per the ticket's own instruction to
    verify rather than re-implement this guarantee.
  - `src/workout/workout-record.ts` — `WORKOUT_RECORD_SCHEMA_VERSION = 1`
    (`:9`) is the version field the ticket says already exists and asks to
    be bumped. `WorkoutRecord` (`:32-40`) has no write-status field yet.
  - `src/workout/workout-store.ts` — one `AsyncStorage` key per record
    (`workout.session.<id>`) plus an id index (`:15-16`); `saveWorkoutSession`
    (`:67-77`) unconditionally overwrites by id (an upsert, not an
    insert-only), which is exactly the primitive a re-sync's status update
    needs — no new storage layout, just a new field inside the existing
    record shape. `parseWorkoutRecord` (`:31-60`) is the single point where
    a persisted record is validated back into a `WorkoutRecord`; this is
    where backward-compatible defaulting for the new field belongs.
  - `src/app/live-workout.tsx:127-150` — the `ended`-phase effect already
    builds the exact `WorkoutRecord` this ticket's writer consumes, once,
    the moment the session ends (before Save is even tapped) — a stable
    `id` for the lifetime of the ended phase. `save()` (`:231-238`) is a
    fire-and-forget `void saveWorkoutSession(record)` immediately followed
    by `router.back()` — Save never awaits persistence today, which is
    exactly the "writing must not block saving" shape this ticket's
    automatic write reuses: attach after, still don't await.
  - `src/components/session-summary.tsx` — `mode: 'detail'` (`:229-267`,
    used only by `src/app/session/[id].tsx` for an already-saved session) is
    where the ticket's "one row, states the status in words" and manual
    Sync action both belong; `mode: 'review'` (`:179-227`, the just-ended,
    not-yet-saved session on Live Workout) shows nothing about write status
    — there is nothing to report yet, and Save is that screen's only
    write-triggering action.
  - `src/app/session/[id].tsx` — already owns `record` as local state
    (`useState<WorkoutRecord | null | undefined>`, `:29-38`), loaded once by
    `id` via `loadWorkoutSession`. This ticket adds a second piece of local
    state (`isSyncing`) and a handler that replaces `record` with
    `syncWorkoutSessionToHealthConnect`'s resolved value — the existing
    `WorkoutRecord | null | undefined` shape doesn't change.
  - `src/components/session-row.tsx` — presentational, every label
    caller-formatted (`:16-27`); rendered from `src/app/(tabs)/history.tsx`
    (`:177-190`) and `src/app/(tabs)/index.tsx` (`:177-191`, Home's "recent"
    list — already tappable via `onPress`, contrary to
    `session-summary/SPEC.md`'s original "Home stays non-interactive"
    constraint, which a later change evidently revised; this ticket doesn't
    revisit that). Both call sites already have the full `WorkoutRecord` in
    hand.
  - `src/components/health-connect-section.tsx` — already establishes this
    app's filled-dot/hollow-dot visual language for a two-state on/off
    condition (`statusDot`/`statusDotHollow`, `:248-257`: filled `success`
    circle vs. a hollow `outlineEmphasis`-bordered circle). This ticket's
    three-state marker (written/not written/failed) extends that exact
    language with a third shape rather than inventing a new one.
  - `DESIGN.md`'s Shapes section (`:518-520`) sets status dots at 7-9px
    circles; its Status colors (`:384`) are exactly two — `success` (live/
    positive) and `danger` (broken/negative) — with no third "warning"
    token. `notWritten` is deliberately **not** `danger`: it's a neutral,
    expected default (the same "informative, not error" treatment
    `health-connect-availability-permissions/SPEC.md` gave four of its six
    settings states), so it reuses the existing hollow-neutral treatment,
    not a new color.
  - No triangle shape exists in `DESIGN.md`'s component vocabulary, but the
    technique this ticket needs (a filled triangle via zero-size
    `border*Width`/`border*Color` tricks) is already established twice in
    this codebase — `live-workout.tsx`'s `playTriangle` (`:634-641`) and
    `index.tsx`'s `heroTriangle` (`:227-235`) — so the marker's failed-state
    shape is new content, not a new technique.
- **User impact:** Ending a workout with write-back on and permission
  granted means it's in Health Connect by the time the app returns to Home —
  nothing to tap, nothing to wait for. History and Home's recent list gain a
  small shape next to each row (no added text) showing whether that session
  made it. Opening any saved session's summary states its Health Connect
  status in a sentence, and — only when it isn't written yet, or the last
  attempt failed — offers a one-tap Sync that works identically whether the
  session is a minute old or predates this feature entirely.
- **Dependencies:** `health-connect-availability-permissions` (permission +
  toggle, landed). No new package — `react-native-health-connect` is already
  installed and already used for permission/availability. Builds on
  `WorkoutRecord`/`workout-store.ts` (`save-and-view-workout-sessions`) and
  `SessionSummary`/`session/[id].tsx` (`session-summary`).

### Design decision: one function, two call sites, per the ticket's own "build it once"

`syncWorkoutSessionToHealthConnect(record)` (below) is the entire write
path: idempotent on an already-`written` record (returns it unchanged, no
Health Connect call), otherwise attempts the write and persists whatever
happened. Both consumers call it identically:

- **Automatic**, from `live-workout.tsx`'s `save()`, wrapped in a small gate
  (`autoSyncWorkoutSessionToHealthConnect`, below) that checks
  `loadWriteBackEnabled()` and `checkHealthConnectPermission()` **first** and
  does nothing at all — not even a `'failed'` write — when either is false.
  This is what keeps "write-back off" and "permission not currently granted"
  indistinguishable from "never attempted" (`notWritten`), matching the
  ticket's own wording: "written ... if write-back is enabled **and**
  permission is granted." A gate that instead let a not-granted permission
  fall through into `syncWorkoutSessionToHealthConnect` would show `'failed'`
  for a session nobody asked to sync, which is not what happened.
- **Manual**, from the session summary's Sync action
  (`src/app/session/[id].tsx`), calling
  `syncWorkoutSessionToHealthConnect` **directly**, with no toggle gate — an
  explicit tap isn't subject to the automatic path's opt-out. Here, no
  permission does map to `'failed'`: the user asked for an outcome and
  didn't get one, which is exactly what the failed marker + retry action are
  for. This is the one deliberate asymmetry between the two call sites, and
  it exists because "automatic, gated by a toggle" and "manual, explicitly
  requested" are genuinely different actions, not two paths that happen to
  share code by accident.

### Design decision: `insertRecords` is a single atomic call, not a partial-failure case to reconcile

**Superseded — see correction below.** Originally: confirmed against the
library's own documented behavior (its docs describe multi-record insertion
as executing in a single transaction — "if one fails, none is inserted"),
not assumed. This resolved the ticket's own "Notes/verify" question
directly: `writeWorkoutSessionToHealthConnect` issued exactly one
`insertRecords([exerciseRecord, ...heartRateRecords])` call per sync
attempt. A resolved promise meant every record — the exercise session and
every heart-rate chunk — landed; a rejected one meant none did. There was
no in-between state for the caller to inspect or the stored status to
approximate — `'written'` and `'failed'` were meant to be the only two
outcomes a real attempt could produce, matching the two-branch `try`/`catch`
in `syncWorkoutSessionToHealthConnect` below.

**Correction (post-implementation, confirmed on a real device):** a single
mixed-type `insertRecords` call rejects with `"All records must have the
same type"` — the library's docs' "single transaction" framing describes
behavior _within_ one record type, not across an `ExerciseSessionRecord`
and `HeartRateRecord`s in the same call. `writeWorkoutSessionToHealthConnect`
now issues **two** calls — `insertRecords([exerciseRecord])` then
`insertRecords(heartRateRecords)` — combining both resolved id arrays. This
reopens the partial-failure case this decision originally ruled out: the
exercise session can land while the heart-rate insert then fails (or vice
versa). `syncWorkoutSessionToHealthConnect` still marks the whole record
`'failed'` in that case (no finer-grained status was added), so a retry
re-attempts both calls — which can leave a duplicate exercise session in
Health Connect if the first call had actually succeeded before the second
failed. This residual risk is accepted for now rather than adding partial-
state tracking; revisit if duplicate exercise sessions turn out to matter
in practice.

### Design decision: chunk `HeartRateRecord`s at 1000 samples, one `ExerciseSessionRecord` per session

Google's own Health Connect write-data guidance (Android Developers docs)
recommends batching writes into a single `insertRecords` call of up to
~1000 records rather than one call per data point — already this ticket's
shape, one call per sync. The library's shipped type declarations don't
state a hard per-`HeartRateRecord` sample cap, so **this figure is a
defensive design choice, not a confirmed platform limit — verify against a
real device at implementation time**, per `AGENTS.md`. At this app's ~1 Hz
sampling, 1000 samples is >16 minutes of workout per `HeartRateRecord`, so
even a multi-hour session produces a handful of `HeartRateRecord`s — the
single `insertRecords` call's total record count (1 exercise session + a
few heart-rate chunks) stays far under the ~1000-record batch guidance for
any realistic session length. This answers the ticket's own "whether a very
long session produces a record volume worth batching" — yes, defensively,
at negligible cost, not because a real session is expected to need it.

### Design decision: write-status defaulting is lenient, unlike the rest of `parseWorkoutRecord`

Every other field `parseWorkoutRecord` validates is load-bearing for
reconstructing the session itself (`samples`, `device.id`, etc.) — a
malformed one invalidates the whole record, per `save-and-view-workout-
sessions/SPEC.md`'s existing "one corrupt entry never breaks the rest of the
list" contract. The new `healthConnect` field is different: it's metadata
_about_ the record, not part of what makes the session real. A missing
field (every session saved before this change) or a malformed one (a
hypothetical future bug in this ticket's own write path) both resolve to
the same safe default (`{ status: 'notWritten', recordIds: [] }`) rather
than dropping the entire session — a corrupted sync status must never cost
a user their workout, the same principle the ticket's own "writing must not
block saving" states for the live write path, applied here to the read
path.

## Data Model

```ts
// src/workout/workout-record.ts (modified)

export const WORKOUT_RECORD_SCHEMA_VERSION = 2; // bumped from 1

export type HealthConnectWriteStatus = 'notWritten' | 'written' | 'failed';

export type HealthConnectWriteInfo = {
  status: HealthConnectWriteStatus;
  // Health Connect's own returned record ids (one exercise-session id plus
  // one per HeartRateRecord chunk) — only ever non-empty when
  // status === 'written'. Not read by anything in this app today; kept so
  // a record's Health Connect identity is recoverable without a second
  // read-back, and so a future "open in Health Connect" deep link (out of
  // scope here) has something to point at.
  recordIds: string[];
};

export type WorkoutRecord = {
  schemaVersion: number;
  id: string;
  startedAt: number;
  samples: HeartRateSample[];
  device: WorkoutDevice;
  pauses: WorkoutPause[];
  healthConnect: HealthConnectWriteInfo; // NEW
};
```

**Invariants:**

- Every `WorkoutRecord` this app ever constructs (Live Workout's `ended`-
  phase effect — the only construction site) starts with `healthConnect: {
status: 'notWritten', recordIds: [] }`. Nothing sets `'written'`/`'failed'`
  except `syncWorkoutSessionToHealthConnect` persisting its own outcome.
- `healthConnect.status === 'written'` is a terminal, idempotent state for
  `syncWorkoutSessionToHealthConnect`'s purposes: once set, that function
  never calls Health Connect again for that record — see the Sync model.
  `'failed'` is not terminal — a later sync attempt (manual, or a future
  automatic retry, out of scope here) can still transition it to
  `'written'`.
- A record loaded via `parseWorkoutRecord` always has a well-formed
  `healthConnect` field, even if the persisted JSON has none (schema
  version 1) or a corrupted one — see the Design decision above. No
  consumer of `loadWorkoutSession`/`loadWorkoutSessions` needs its own
  null/undefined check on `record.healthConnect`.
- `WorkoutRecord.samples` is written to Health Connect **verbatim** — no
  filtering step exists or is added anywhere in this ticket's write path,
  per the confirmed guarantee in Context that no stale/paused sample can
  reach `samples` in the first place.

## Interfaces / API

### `src/workout/workout-record.ts` (modified)

Adds `HealthConnectWriteStatus`/`HealthConnectWriteInfo` and the
`healthConnect` field per Data Model; bumps
`WORKOUT_RECORD_SCHEMA_VERSION` to `2`. No existing export's signature
changes — `deriveWorkoutSummary`, `bucketHeartRateSamples`,
`describeSessionTime`, `createWorkoutId`, `deriveWeeklyTotals` are all
untouched (none of them read or need the new field).

### `src/workout/workout-store.ts` (modified)

```ts
// Private — not exported, mirrors parseWorkoutRecord's own visibility.
function parseHealthConnectWriteInfo(raw: unknown): HealthConnectWriteInfo;
```

Returns `{ status: 'notWritten', recordIds: [] }` when `raw` is not an
object; otherwise reads `status` (must be exactly `'notWritten'` |
`'written'` | `'failed'`, else falls back to `'notWritten'`) and
`recordIds` (must be a string array, else `[]`, with any non-string entry
filtered out rather than invalidating the whole array) — never throws,
matching every other private parse helper in this file.

`parseWorkoutRecord` (`:31-60`, unchanged signature) gains one line: the
destructure picks up `healthConnect` alongside the existing fields, and the
returned object's `healthConnect` is
`parseHealthConnectWriteInfo(parsed.healthConnect)` instead of a raw
pass-through. Every existing required-field check (`schemaVersion`, `id`,
`startedAt`, `samples`, `pauses`, `device.id`) is unchanged — a record
missing any of _those_ still returns `null` (dropped), exactly as today;
only `healthConnect` gets the lenient defaulting described in the Design
decision above. `saveWorkoutSession`/`loadWorkoutSession`/
`loadWorkoutSessions` signatures are unchanged — they already serialize/
deserialize whatever `WorkoutRecord` shape exists.

### `src/health/health-connect-writer.ts` (new)

Framework-free (no React import) — mirrors `health-connect-client.ts`'s
"thin wrapper" shape, but owns the write side rather than the permission
side, kept in its own file since the two have no reason to share call
sites or tests.

```ts
export async function writeWorkoutSessionToHealthConnect(record: WorkoutRecord): Promise<string[]>;
```

Maps `record` to exactly one `ExerciseSessionRecord` (`exerciseType:
ExerciseType.OTHER_WORKOUT` — this app has no per-sport exercise-type
concept, so every session is written as this one generic type; `startTime`/
`endTime` from `record.startedAt`/the last sample's `timestamp`, ISO
8601-encoded via `new Date(ms).toISOString()`) and one or more
`HeartRateRecord`s (chunked at 1000 samples each per the Design decision
above; each chunk's `startTime`/`endTime` from its own first/last sample;
each `samples[]` entry `{ time: <ISO>, beatsPerMinute: sample.bpm }`), then
calls `insertRecords([exerciseRecord, ...heartRateRecords])` exactly once
and returns its resolved `string[]` of ids. **All timestamps come from the
record's own `startedAt`/`samples[].timestamp` — never `Date.now()`** — this
is what makes a session synced long after the fact land at the correct
point in the user's Health Connect timeline, per the ticket's own note.

A private `nonZeroInterval(startMs, endMs)` helper bumps `endMs` to
`startMs + 1` whenever `endMs <= startMs` before ISO-encoding both — Health
Connect's `IntervalRecord`s are not expected to accept a zero-length
interval (a one-sample session, or a single-sample chunk landing on
identical timestamps, would otherwise produce `startTime === endTime`).
**Verify this tolerance against a real device at implementation time.**

Throws (never catches) on any failure — `insertRecords` rejecting,
`initialize()` never having been confirmed, a malformed response — every
failure mode here is the caller's (`syncWorkoutSessionToHealthConnect`'s)
to translate into the persisted `'failed'` status. This function is called
only for a record with `samples.length >= 1`: Save on Live Workout is
already disabled at zero samples (`save-and-view-workout-sessions/SPEC.md`),
so a zero-sample `WorkoutRecord` can never exist to reach either sync call
site.

### `src/health/health-connect-sync.ts` (new)

Framework-free (no React import). The single write-and-persist path both
call sites share — see the Design decision above.

```ts
export async function syncWorkoutSessionToHealthConnect(
  record: WorkoutRecord,
): Promise<WorkoutRecord>;
```

1. `record.healthConnect.status === 'written'` → returns `record`
   unchanged. No Health Connect call, no `saveWorkoutSession` call — this
   is the guard that makes re-tapping Sync on an already-written session
   (or a duplicate automatic call, however unlikely) a true no-op rather
   than a second `insertRecords`.
2. Otherwise, checks `checkHealthConnectPermission()` (wrapped in its own
   `try`/`catch` defaulting to `false` — a thrown check must not skip the
   "not permitted" branch below). Not permitted → persists and returns
   `{ ...record, healthConnect: { status: 'failed', recordIds: [] } }` via
   `saveWorkoutSession`, with **no** call to
   `writeWorkoutSessionToHealthConnect`.
3. Permitted → calls `writeWorkoutSessionToHealthConnect(record)` inside a
   `try`/`catch`. On success: persists and returns `{ ...record,
healthConnect: { status: 'written', recordIds: <the resolved ids> } }`. On
   a thrown error: persists and returns `{ ...record, healthConnect: {
status: 'failed', recordIds: [] } }`.

Every branch calls `saveWorkoutSession` (the existing upsert-by-id) before
returning, so the persisted record and the value handed back to the caller
are always the same object — a caller that immediately re-renders from the
return value is never out of sync with what a later `loadWorkoutSession`
would read. Never throws — every internal failure is caught and turned
into a `'failed'` status, not a rejected promise, matching this repo's
"never let a Health Connect failure surface as an unhandled rejection"
posture (mirrors `health-connect-store.ts`'s own "never throws" contract).

```ts
export async function autoSyncWorkoutSessionToHealthConnect(record: WorkoutRecord): Promise<void>;
```

The automatic path's gate — see the Design decision above. Loads
`loadWriteBackEnabled()` and `checkHealthConnectPermission()` (in
parallel), and returns immediately, calling nothing else, unless **both**
are true. When both are true, calls and awaits
`syncWorkoutSessionToHealthConnect(record)`, discarding its return value
(the caller, `live-workout.tsx`, has already navigated away by the time
this resolves — see Design decision — so there's nothing to hand the
result to). Wrapped in its own outer `try`/`catch` that swallows anything,
including a hypothetical bug in `syncWorkoutSessionToHealthConnect` itself:
this function's contract is "never throws," full stop, because its only
caller invokes it fire-and-forget after a save that has already succeeded.

### `src/app/live-workout.tsx` (modified — additive)

The `ended`-phase record-construction effect (`:133-150`) gains
`healthConnect: { status: 'notWritten', recordIds: [] }` in the object it
builds — the one and only place a `WorkoutRecord` is ever constructed from
scratch. `save()` (`:231-238`) changes from a bare fire-and-forget
`void saveWorkoutSession(record)` to:

```ts
const save = () => {
  if (record == null) return;
  setDecided(true);
  void saveWorkoutSession(record).then(() => {
    void autoSyncWorkoutSessionToHealthConnect(record);
  });
  router.back();
};
```

Chained, not parallel — `autoSyncWorkoutSessionToHealthConnect`'s own
`saveWorkoutSession` call (inside `syncWorkoutSessionToHealthConnect`,
same `id` key) must not race the initial save and risk being overwritten
by it. `router.back()` still fires immediately, before either promise
settles — Save's navigation timing is completely unchanged; this is
strictly additive. No other line in this file changes.

### `src/components/ui/write-status-marker.tsx` (new, primitive)

```ts
export type WriteStatusMarkerProps = {
  status: HealthConnectWriteStatus;
  // Omitted marks the marker purely decorative (importantForAccessibility
  // = 'no') — used where adjacent text already states the status in
  // words (session-summary.tsx's own row). Provided wherever the marker is
  // the only indicator (SessionRow, which carries no status text).
  accessibilityLabel?: string;
  size?: number; // default 9 — DESIGN.md's status-dot range is 7-9px
};
export function WriteStatusMarker(props: WriteStatusMarkerProps): JSX.Element;
```

Primitive, presentation-only — goes under `src/components/ui/`, per
`CLAUDE.md`'s split, alongside `toggle.tsx` (the only other status-bearing
primitive in this app, whose `accessibilityLabel`-from-caller shape this
mirrors exactly). Three plain-`View` renders, no SVG, no icon font, no new
color token:

- `'written'` — filled circle, `size`×`size`, `rounded.full`,
  `theme.colors.success` fill. `testID="write-status-marker-written"`.
- `'notWritten'` — hollow circle, same size, transparent fill, 1.5px
  `theme.colors.outlineEmphasis` border — the exact treatment
  `health-connect-section.tsx`'s existing `statusDotHollow` already
  establishes for "off, not broken." `testID="write-status-marker-not-
written"`.
- `'failed'` — filled triangle via the zero-size-`View`-plus-border
  technique already used by `playTriangle`/`heroTriangle`, `theme.colors
.danger` fill, sized to roughly match the two circles' footprint.
  `testID="write-status-marker-failed"`.

No animation (`DESIGN.md`'s motion restriction — live dot, BPM ring,
scan-bar sweep only).

### `src/components/session-row.tsx` (modified — additive)

```ts
export type SessionRowProps = {
  // ...every existing field unchanged...
  writeStatus: HealthConnectWriteStatus; // NEW, required
};
```

Required, not optional: every real caller has a `WorkoutRecord` (which
always has a `healthConnect` field, per the Data Model invariant), so
there's no meaningful "omitted" state to default — unlike `onPress`, which
genuinely has a real non-interactive default. Renders
`<WriteStatusMarker status={writeStatus} accessibilityLabel={t(
'history.writeStatus.' + writeStatus)} />` as a new sibling between
`content` and the trailing chevron (the row's existing `gap: 14` already
spaces every child, including this new one, with no extra style needed).
Every other part of the row — date column, divider, title, meta line,
chevron, pressed-state styling — is unchanged. `SessionRow` already makes
one `t(...)` call of its own (`history.sessionRow.avgSuffix`, `:39/:85`)
despite being otherwise caller-formatted — this is the same established
exception, not a new one.

### `src/components/session-summary.tsx` (modified — additive, `mode: 'detail'` only)

```ts
export type SessionSummaryProps =
  | { mode: 'review'; record: WorkoutRecord; onSave: () => void; onDiscard: () => void }
  | {
      mode: 'detail';
      record: WorkoutRecord;
      onBack: () => void;
      onDone: () => void;
      onSync: () => void; // NEW
      isSyncing: boolean; // NEW
    };
```

`mode: 'review'` is completely untouched — the just-ended, not-yet-saved
session has no write status to report yet (Save is that screen's only
write-triggering action, and it's already visible). Only `mode: 'detail'`
gains a new row, placed between the existing stat grid (`statRow`) and the
detail footer (Back/Done), styled as a `surface`/`outline`/`md`-radius card
matching the trace/stat cards' existing chrome:

- `<WriteStatusMarker status={record.healthConnect.status} size={11} />`
  with no `accessibilityLabel` (decorative — the text beside it already
  says everything a screen reader needs).
- A title/caption pair —
  `t('sessionSummary.writeStatus.' + status + '.title')` (`bodyMd`/
  `onSurface`) over `.caption` (`dataSm`/`onSurfaceMuted`) — "states the
  status in words," per the ticket.
- **Only when `status` is `'notWritten'` or `'failed'`**: a trailing text
  action, `testID="session-summary-sync"`, `disabled={props.isSyncing}`,
  `onPress={props.onSync}`, label `t('sessionSummary.writeStatus.
syncAction')` normally, `t('sessionSummary.writeStatus.syncing')` while
  `isSyncing` — same `Pressable` + `ThemedText variant="actionSm"
color="primary"` text-action pattern already used throughout this app
  (Discard/Save's sibling ghost/primary buttons aside, this specific
  "text link inside a status row" shape matches `health-connect-section
.tsx`'s `InfoCard` actions exactly). `'written'` renders no action.

### `src/app/session/[id].tsx` (modified — additive)

```ts
const [isSyncing, setIsSyncing] = useState(false);

const handleSync = () => {
  if (record == null || isSyncing) return;
  setIsSyncing(true);
  syncWorkoutSessionToHealthConnect(record)
    .then(setRecord)
    .finally(() => setIsSyncing(false));
};
```

`<SessionSummary mode="detail" .../>`'s call gains `onSync={handleSync}
isSyncing={isSyncing}`. This route already owns `record` as local state
(`:29`, per Context) — `handleSync`'s `.then(setRecord)` is the same
"replace local state with the freshly loaded/derived value" shape the
route's own load effect already uses, just fed by
`syncWorkoutSessionToHealthConnect`'s return value instead of
`loadWorkoutSession`. No other line in this file changes.

### `src/app/(tabs)/history.tsx` / `src/app/(tabs)/index.tsx` (modified — additive)

Both existing `<SessionRow .../>` call sites (`history.tsx:177-190`,
`index.tsx:177-191`) gain `writeStatus={record.healthConnect.status}` —
one line each, no other change. `SessionRow` reads
`history.writeStatus.<status>` for its marker's `accessibilityLabel`
regardless of which screen renders it — the same shared-namespace
precedent `history.sessionRow.avgSuffix` already establishes for Home's
identical reuse of this component.

### `src/i18n/locales/en.json` (modified)

```json
{
  "sessionSummary": {
    "writeStatus": {
      "written": {
        "title": "Saved to Health Connect",
        "caption": "This workout is in your Health Connect history."
      },
      "notWritten": {
        "title": "Not synced to Health Connect",
        "caption": "This workout hasn't been saved to Health Connect yet."
      },
      "failed": {
        "title": "Sync failed",
        "caption": "Pulse couldn't save this workout to Health Connect."
      },
      "syncAction": "SYNC",
      "syncing": "SYNCING…"
    }
  },
  "history": {
    "writeStatus": {
      "written": "Written to Health Connect",
      "notWritten": "Not written to Health Connect",
      "failed": "Health Connect sync failed"
    }
  }
}
```

Every other existing key is unchanged.

### `__mocks__/react-native-health-connect.ts` (modified)

Adds `export const insertRecords = jest.fn();` and
`export const ExerciseType = { OTHER_WORKOUT: 0 } as const;` (only the one
value this app ever uses — mirrors the existing mock's "real constant
values, jest.fn() functions" shape; no need to mirror the library's full
~80-entry map).

## Files Created

| File                                                       | Purpose                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/health/health-connect-writer.ts`                      | Maps a `WorkoutRecord` to `ExerciseSessionRecord`/`HeartRateRecord`s and calls `insertRecords` once.                                                                                                             |
| `src/health/__tests__/health-connect-writer.test.ts`       | Record mapping (exercise type, ISO timestamps, chunking at 1000 samples, zero-duration guard), single `insertRecords` call, error propagation.                                                                   |
| `src/health/health-connect-sync.ts`                        | `syncWorkoutSessionToHealthConnect` (shared write-and-persist path) and `autoSyncWorkoutSessionToHealthConnect` (automatic gate).                                                                                |
| `src/health/__tests__/health-connect-sync.test.ts`         | Idempotent-on-`written` guard, not-permitted → `failed`+persisted, success → `written`+recordIds+persisted, write failure → `failed`+persisted, auto-gate's toggle/permission branches, "never throws" contract. |
| `src/components/ui/write-status-marker.tsx`                | Filled-circle/hollow-circle/triangle status primitive.                                                                                                                                                           |
| `src/components/ui/__tests__/write-status-marker.test.tsx` | Correct shape testID per status; `accessibilityLabel` vs. decorative (`importantForAccessibility`) behavior.                                                                                                     |

## Files Modified

| File                                                | Change                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/workout/workout-record.ts`                     | Bump `WORKOUT_RECORD_SCHEMA_VERSION` to `2`; add `HealthConnectWriteStatus`/`HealthConnectWriteInfo`; add `healthConnect` to `WorkoutRecord`.                                                                                                                                                           |
| `src/workout/__tests__/workout-record.test.ts`      | Assert `WORKOUT_RECORD_SCHEMA_VERSION === 2`; every fixture gains a `healthConnect` field.                                                                                                                                                                                                              |
| `src/workout/workout-store.ts`                      | `parseWorkoutRecord` gains lenient `healthConnect` defaulting via a new private `parseHealthConnectWriteInfo`.                                                                                                                                                                                          |
| `src/workout/__tests__/workout-store.test.ts`       | Add: a schema-version-1 fixture with no `healthConnect` field loads with `{ status: 'notWritten', recordIds: [] }`; a malformed `healthConnect` value defaults the same way without dropping the record; round-trip preserves a non-default `healthConnect` as-is.                                      |
| `src/app/live-workout.tsx`                          | `ended`-phase record construction gains the default `healthConnect` field; `save()` chains `autoSyncWorkoutSessionToHealthConnect` after the initial `saveWorkoutSession`.                                                                                                                              |
| `src/app/__tests__/live-workout.test.tsx`           | Mock `@/health/health-connect-sync`. Add: Save calls `saveWorkoutSession` then `autoSyncWorkoutSessionToHealthConnect` with the same record (including its default `healthConnect`); `router.back()` fires before either promise resolves, unchanged from today. Every existing case passes unmodified. |
| `src/components/session-row.tsx`                    | Add required `writeStatus` prop; render `WriteStatusMarker` between content and chevron.                                                                                                                                                                                                                |
| `src/components/__tests__/session-row.test.tsx`     | Every existing case's `<SessionRow>` render gains a `writeStatus` prop. Add: correct marker testID per `writeStatus` value; the marker's `accessibilityLabel` matches `history.writeStatus.<status>`.                                                                                                   |
| `src/components/session-summary.tsx`                | `mode: 'detail'` gains the write-status row (marker + title/caption + conditional Sync action) between the stat grid and the footer. `mode: 'review'` unchanged.                                                                                                                                        |
| `src/components/__tests__/session-summary.test.tsx` | Add, `mode: 'detail'` only: correct title/caption per `healthConnect.status`; Sync action visible only for `notWritten`/`failed`, absent for `written`; tapping Sync calls `onSync`; `isSyncing` disables the action and swaps its label. `mode: 'review'` cases confirm no write-status row renders.   |
| `src/app/session/[id].tsx`                          | Add `isSyncing` state and `handleSync`; wire `onSync`/`isSyncing` into `<SessionSummary mode="detail" .../>`.                                                                                                                                                                                           |
| `src/app/session/__tests__/[id].test.tsx`           | Mock `@/health/health-connect-sync`. Add: tapping the summary's Sync action calls `syncWorkoutSessionToHealthConnect` with the loaded record and re-renders with its resolved status; the action is disabled while the call is in flight.                                                               |
| `src/app/(tabs)/history.tsx`                        | Each `SessionRow` gains `writeStatus={record.healthConnect.status}`.                                                                                                                                                                                                                                    |
| `src/app/(tabs)/__tests__/history.test.tsx`         | Existing session-list fixtures gain a `healthConnect` field; add an assertion that each row's marker reflects its record's status.                                                                                                                                                                      |
| `src/app/(tabs)/index.tsx`                          | Each `SessionRow` (Home's recent list) gains `writeStatus={record.healthConnect.status}`.                                                                                                                                                                                                               |
| `src/app/(tabs)/__tests__/index.test.tsx`           | Existing session-list fixtures gain a `healthConnect` field.                                                                                                                                                                                                                                            |
| `src/i18n/locales/en.json`                          | Add `sessionSummary.writeStatus` and `history.writeStatus` namespaces, per Interfaces/API.                                                                                                                                                                                                              |
| `__mocks__/react-native-health-connect.ts`          | Add `insertRecords` (`jest.fn()`) and the `ExerciseType.OTHER_WORKOUT` constant.                                                                                                                                                                                                                        |

## Implementation Steps

1. Bump `WORKOUT_RECORD_SCHEMA_VERSION` and add the `HealthConnectWriteStatus`/
   `HealthConnectWriteInfo`/`healthConnect` types to
   `src/workout/workout-record.ts`; update its test's fixtures.
2. Add `parseHealthConnectWriteInfo` and wire it into `parseWorkoutRecord`
   in `src/workout/workout-store.ts`; extend its test per Files Modified —
   fully testable in isolation, no dependency on anything else in this
   ticket.
3. Extend `__mocks__/react-native-health-connect.ts` with `insertRecords`
   and `ExerciseType`.
4. Create `src/health/health-connect-writer.ts` and its test, confirming
   the exact `ExerciseSessionRecord`/`HeartRateRecord` field names and
   `IntervalRecord` string-timestamp format against the installed
   library's own type declarations (already done in Context — re-confirm
   at implementation time per `AGENTS.md`/`CLAUDE.md`'s "read the versioned
   docs" discipline, since this is the first ticket to actually construct
   these record shapes).
5. Create `src/health/health-connect-sync.ts` and its test, covering the
   idempotent guard, both `syncWorkoutSessionToHealthConnect` failure
   branches, and the automatic gate's toggle/permission logic.
6. Create `src/components/ui/write-status-marker.tsx` and its test.
7. Add the `sessionSummary.writeStatus`/`history.writeStatus` keys to
   `src/i18n/locales/en.json`.
8. Modify `src/components/session-row.tsx` (required `writeStatus` prop +
   marker) and extend its test; update the two real call sites
   (`history.tsx`, `index.tsx`) and their tests.
9. Modify `src/components/session-summary.tsx` (`mode: 'detail'`'s new
   write-status row + Sync action) and extend its test.
10. Modify `src/app/session/[id].tsx` (`isSyncing`/`handleSync`) and extend
    its test.
11. Modify `src/app/live-workout.tsx` (default `healthConnect` field on
    construction; `save()` chains the automatic sync) and extend its test.
12. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
13. Manually verify on a dev-client build (`pnpm android`), with write-back
    enabled and permission granted: complete a short workout, Save, open
    the Health Connect app and confirm the exercise session and heart-rate
    data both appear at the correct time. Toggle write-back off, save a
    second workout, confirm nothing appears and the summary/History both
    show `notWritten`. Revoke Health Connect permission from Android
    Settings, save a third workout, confirm it saves locally with
    `notWritten` (not `failed` — the automatic gate, not an attempted-and-
    failed write) and doesn't crash. Re-grant permission via Profile, open
    that third session's summary, tap Sync, confirm it now appears in
    Health Connect and the marker updates to filled/written without a
    screen reload. Tap Sync again on the same now-written session and
    confirm Health Connect shows no duplicate.

## Style & Conventions

- **`health-connect-writer.ts` and `health-connect-sync.ts` are both
  framework-free** (no React import), matching `health-connect-client.ts`/
  `health-connect-store.ts`'s established split for this domain — a native-
  wrapper layer and a persistence-adjacent orchestration layer, kept
  separate so the writer stays unit-testable against hand-built
  `WorkoutRecord` fixtures with no `AsyncStorage` involved at all.
- **One function serves both call sites, per the ticket's explicit "same
  action, same code path — build it once."** The only branch between
  automatic and manual is the toggle gate, and it lives entirely in
  `autoSyncWorkoutSessionToHealthConnect`, a thin wrapper the manual path
  never touches — not a parameter threaded through
  `syncWorkoutSessionToHealthConnect` itself.
- **`WriteStatusMarker` follows `Toggle`'s exact primitive shape**
  (`src/components/ui/`, caller-supplied `accessibilityLabel`, no internal
  i18n, no animation) — the second status-bearing primitive in this app,
  reusing rather than reinventing that precedent.
- **No new color token.** `written`/`notWritten` reuse `success`/
  `outlineEmphasis` exactly as `health-connect-section.tsx`'s existing
  dot convention does; `failed` reuses `danger`, this app's only other
  status color. `DESIGN.md` is not modified — the marker composes the same
  tokens documented there for a different component.
- **`SessionRow`'s `writeStatus` is required, not optional** — deliberately
  different from `onPress`'s optional-with-inert-default shape, because
  every real `WorkoutRecord` always has a `healthConnect` field (the schema
  guarantees it, including for legacy records via lenient parsing), so
  there is no meaningful omitted state to default to.
- Every new user-facing string renders via `t('sessionSummary.…')` /
  `t('history.…')`, per `CLAUDE.md`'s i18n rule.
- Component files are kebab-case, component names PascalCase
  (`write-status-marker.tsx` → `WriteStatusMarker`), per `CLAUDE.md`.
- New tests colocated under each module's own `__tests__/`, matching every
  existing precedent in this repo.

## Acceptance Criteria

- [ ] `WORKOUT_RECORD_SCHEMA_VERSION === 2`.
- [ ] A record with `schemaVersion: 1` and no `healthConnect` field, loaded
      via `loadWorkoutSession`/`loadWorkoutSessions`, resolves with
      `healthConnect: { status: 'notWritten', recordIds: [] }` and every
      other field intact.
- [ ] A record with a malformed `healthConnect` value (wrong shape, invalid
      `status` string) still loads successfully, with `healthConnect`
      defaulted to `{ status: 'notWritten', recordIds: [] }` — not dropped
      from the result the way a malformed `samples`/`device` would be.
- [ ] `writeWorkoutSessionToHealthConnect` calls `insertRecords` exactly
      once per invocation, with one `ExerciseSessionRecord`
      (`exerciseType: ExerciseType.OTHER_WORKOUT`, `startTime`/`endTime`
      derived from `record.startedAt`/the last sample's timestamp) followed
      by one or more `HeartRateRecord`s whose combined samples equal
      `record.samples` exactly, each sample mapped to `{ time, beatsPerMinute
}` with no filtering applied.
- [ ] A session with more than 1000 samples produces more than one
      `HeartRateRecord`, each capped at 1000 samples, still passed to a
      single `insertRecords` call.
- [ ] A one-sample session (zero-duration interval) does not throw and
      produces a well-formed, non-zero-length `startTime`/`endTime` pair.
- [ ] `syncWorkoutSessionToHealthConnect` on a record already `'written'`
      calls neither `checkHealthConnectPermission` nor
      `writeWorkoutSessionToHealthConnect` nor `saveWorkoutSession`, and
      resolves the same record unchanged.
- [ ] `syncWorkoutSessionToHealthConnect` on a `'notWritten'`/`'failed'`
      record with permission not granted resolves
      `{ ...record, healthConnect: { status: 'failed', recordIds: [] } }`
      and persists it via `saveWorkoutSession`, without calling
      `writeWorkoutSessionToHealthConnect`.
- [ ] `syncWorkoutSessionToHealthConnect` with permission granted and a
      successful write resolves `{ ...record, healthConnect: { status:
'written', recordIds: <insertRecords's resolved ids> } }` and persists it.
- [ ] `syncWorkoutSessionToHealthConnect` with permission granted and
      `writeWorkoutSessionToHealthConnect` rejecting resolves
      `{ ...record, healthConnect: { status: 'failed', recordIds: [] } }`
      and persists it — the promise itself never rejects.
- [ ] `autoSyncWorkoutSessionToHealthConnect` calls
      `syncWorkoutSessionToHealthConnect` only when both
      `loadWriteBackEnabled()` and `checkHealthConnectPermission()` resolve
      `true`; with either `false`, it calls neither
      `syncWorkoutSessionToHealthConnect` nor
      `writeWorkoutSessionToHealthConnect`, and the record's status is left
      as whatever it already was (never forced to `'failed'`).
- [ ] `autoSyncWorkoutSessionToHealthConnect` never rejects, even when
      `syncWorkoutSessionToHealthConnect` itself throws.
- [ ] Live Workout: tapping Save (with samples present) calls
      `saveWorkoutSession` and then `autoSyncWorkoutSessionToHealthConnect`
      with a record whose `healthConnect` is `{ status: 'notWritten',
recordIds: [] }`; `router.back()` is called before either promise
      settles, matching today's fire-and-forget timing exactly.
- [ ] `WriteStatusMarker` renders a distinct `testID` per `status`
      (`write-status-marker-written` / `-not-written` / `-failed`); with
      `accessibilityLabel` provided, the rendered node is accessible with
      that label; with it omitted, the node is
      `importantForAccessibility="no"`.
- [ ] `SessionRow` renders a `WriteStatusMarker` reflecting its
      `writeStatus` prop, with `accessibilityLabel` equal to
      `t('history.writeStatus.<status>')`, for all three statuses.
- [ ] History and Home's recent list each pass `writeStatus={record
.healthConnect.status}` into every rendered `SessionRow`.
- [ ] `SessionSummary` `mode: 'detail'` renders the correct
      `sessionSummary.writeStatus.<status>.title`/`.caption` pair for each
      of the three statuses, with a visible, enabled Sync action only for
      `'notWritten'`/`'failed'` — absent entirely for `'written'`.
- [ ] `SessionSummary` `mode: 'detail'`: tapping Sync calls `props.onSync`
      exactly once; while `props.isSyncing` is `true`, the Sync action is
      disabled and shows the syncing label instead.
- [ ] `SessionSummary` `mode: 'review'` renders no write-status row and no
      Sync action, for any `healthConnect.status` value.
- [ ] `src/app/session/[id].tsx`: tapping Sync calls
      `syncWorkoutSessionToHealthConnect` with the currently loaded record
      and re-renders the screen with the resolved record's updated
      `healthConnect` status once the call settles; the action is disabled
      for the duration of the call.
- [ ] Tapping Sync twice in quick succession on the same record (before the
      first call resolves) does not issue a second
      `syncWorkoutSessionToHealthConnect` call.
- [ ] No new string is inline in JSX — all new copy renders via `t(...)`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: automatic write-on-save plus a single manual per-session sync
  action, exactly as the ticket describes. No bulk backfill (no "sync all"
  action, no progress UI, no partial-failure UI beyond the existing
  per-session marker), no iOS/HealthKit, no reading anything back from
  Health Connect, no change to the settings section beyond the two existing
  reads (`loadWriteBackEnabled`, `checkHealthConnectPermission`) this
  ticket already relies on — the toggle and permission UI themselves are
  untouched.
- **`ExerciseType.OTHER_WORKOUT` is the only exercise type this app ever
  writes.** There is no per-sport selection anywhere in the app (no field
  on `WorkoutRecord`, no UI), so a more specific type (e.g. `RUNNING`,
  `BIKING`) is never available to choose correctly — writing a specific
  type this app cannot actually verify would be a worse default than the
  honestly-generic one.
- **No `ExerciseSessionRecord` `title`, `segments`, or `laps` are written.**
  The record carries only the required `exerciseType` and interval —
  mapping `pauses` into `ExerciseSegment`s, or the session's derived
  time-of-day title into the record's own `title` field, are both
  plausible follow-ups this ticket deliberately leaves out, to keep the
  written shape to exactly what the ticket asks for ("map the session's
  samples to heart rate records and the session itself to an exercise
  session").
- **The 1000-sample-per-`HeartRateRecord` chunk size is a defensive design
  choice, not a confirmed Health Connect limit** — see the Design decision
  above. If a real device rejects a different threshold, only
  `health-connect-writer.ts`'s one constant needs to change; no other file
  is affected.
- **A permission revoked between saving and writing produces `'notWritten'`
  via the automatic path's gate, not `'failed'`** — a deliberate distinction
  from the manual path's behavior in the same situation (see the Design
  decision on the one asymmetry between the two call sites). This is a
  design decision recorded here, not something verified against a real
  device permission-revocation flow; **verify at implementation time**,
  per the ticket's own "Notes/verify" list.
- **No retry backoff, queueing, or background retry of a `'failed'` write.**
  A failed session stays `'failed'` until a human taps Sync again — there
  is no automatic re-attempt on next app launch, next save, or any timer.
  This matches the ticket's explicit scope (manual per-session retry only)
  and this app's existing level of resilience engineering (no retry logic
  exists anywhere else in the codebase either).
- **`recordIds` is written but never read anywhere in this ticket.** It
  exists so a record's Health Connect identity survives a sync, in case a
  future ticket needs it (e.g. to support an eventual delete/edit flow, or
  a "view in Health Connect" link) — not because anything here consumes it.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
