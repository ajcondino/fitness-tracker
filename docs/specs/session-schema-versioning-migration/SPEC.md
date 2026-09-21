# Feature: Session Schema Versioning and Migration

## Intent

A store holding sessions saved by any past version of this app — M1's bare
sample-only record, M2's `pauses`/`healthConnect` additions, or today's
current shape — loads through one versioned migration runner and reaches
every screen fully upgraded, so no screen ever needs its own null-check for
a field an older record predates, and a future ticket adds a field by
registering one migration step rather than touching a read path.

## Context

- **Problem statement:** [GitHub issue #61](https://github.com/ajcondino/fitness-tracker/issues/61)
  (milestone "Milestone 3: Optional Stretch"). `WorkoutRecord`
  (`src/workout/workout-record.ts:46-53`) already carries a `schemaVersion`
  field, currently `WORKOUT_RECORD_SCHEMA_VERSION = 2`
  (`workout-record.ts:9`), and `workout-store.ts` already tolerates one
  version gap: `parseWorkoutRecord` (`workout-store.ts:52-79`) requires
  `schemaVersion`/`id`/`startedAt`/`samples`/`pauses`/`device.id` to be
  present and correctly typed, then leniently defaults `healthConnect` via
  a private `parseHealthConnectWriteInfo` helper (`:33-47`) when it's
  missing (a real `schemaVersion: 1` record, saved before
  `health-connect-workout-sync` added the field) or malformed. This works
  today only because there has been exactly one field added since v1. It is
  not a runner: `schemaVersion` is read, type-checked as `number`, and
  otherwise never consulted — nothing branches on its value, and each field
  added since v1 has needed its own bespoke lenient-default helper
  hand-written into `parseWorkoutRecord` (confirmed by `git log -p --
src/workout/workout-record.ts`: `health-connect-workout-sync`'s spec,
  `docs/specs/health-connect-workout-sync/SPEC.md:277-283`, describes
  exactly this one-off). This ticket's own scope note is explicit that this
  ad hoc pattern does not scale: M3 is about to add `activityType`, `route`,
  `altitude`, `calories`, and a `source` field in short order, and "adding a
  new field in a later ticket requires no change to the runner itself" is
  this ticket's own third acceptance criterion — not satisfiable by hand-
  writing a fourth, fifth, and sixth `parseXWriteInfo`-shaped helper.
- **Current code:**
  - `src/workout/workout-record.ts` — `WORKOUT_RECORD_SCHEMA_VERSION = 2`;
    `WorkoutRecord` (`:46-53`: `schemaVersion`, `id`, `startedAt`, `samples`,
    `device`, `pauses`, `healthConnect`); `deriveWorkoutSummary`,
    `bucketHeartRateSamples`, `describeSessionTime`, `createWorkoutId`,
    `deriveWeeklyTotals` — all pure functions over an already-fully-shaped
    `WorkoutRecord`, none of which do their own defaulting.
  - `src/workout/workout-store.ts` — the sole read/write boundary.
    `saveWorkoutSession`, `loadWorkoutSession`, `loadWorkoutSessions` are the
    only three exports; `parseWorkoutRecord` and `parseHealthConnectWriteInfo`
    are private. Every read (`loadWorkoutSession`/`loadWorkoutSessions`)
    funnels through `parseWorkoutRecord` — there is exactly one choke point
    to migrate at, not one per screen.
  - **Every current consumer already reads a record assuming every field is
    present and well-formed — none has its own null-check:**
    `src/app/(tabs)/history.tsx`, `src/app/(tabs)/index.tsx`,
    `src/components/session-summary.tsx` (reads
    `record.healthConnect.status` directly, `session-summary.tsx:200`),
    `src/app/session/[id].tsx`, and `src/health/health-connect-sync.ts`
    (reads `record.healthConnect.status` at `:19`) all rely entirely on
    `parseWorkoutRecord` having already produced a complete, valid
    `WorkoutRecord` — confirmed by `health-connect-workout-sync`'s own spec,
    `docs/specs/health-connect-workout-sync/SPEC.md:259-264`: "A record
    loaded via `parseWorkoutRecord` always has a well-formed `healthConnect`
    field... No consumer of `loadWorkoutSession`/`loadWorkoutSessions` needs
    its own null/undefined check." This ticket's "audit every screen" scope
    item is satisfied by confirming and preserving that same invariant for
    the new `source` field, not by adding per-screen guards — see Style &
    Conventions.
  - `src/app/live-workout.tsx:139-152` — the only site that **constructs** a
    new `WorkoutRecord` (inside the `session.phase === 'ended'` effect).
    Already references `WORKOUT_RECORD_SCHEMA_VERSION` rather than a literal,
    so bumping the constant needs no change here beyond adding the new
    field.
  - Nothing in this repo today reads or writes `activityType`, `route`,
    `altitude`, `calories`, or an import flag — grepped `src/` for each; no
    matches outside this ticket's own issue text. Those four fields are
    explicitly out of scope for this ticket (see Constraints); only `source`
    is added now, per the issue's own instruction to add it "even if the
    import epic is deferred."
- **User impact:** None directly visible — this ticket adds no UI and no new
  copy. Its effect is that a person who saved sessions on an earlier build
  of this app, then upgrades, keeps seeing their full History list and can
  still open any old session's detail screen without a blank row, a crash,
  or a silently-dropped session.
- **Dependencies:** None new. Builds entirely on `save-and-view-workout-
sessions` (`WorkoutRecord`, `workout-store.ts`) and `health-connect-
workout-sync` (the `healthConnect` field and its lenient-default
  precedent, which this ticket formalizes rather than replaces).

## Data Model

```ts
// src/workout/workout-record.ts — modified

export const WORKOUT_RECORD_SCHEMA_VERSION = 3; // was 2; bumped for `source`

export type WorkoutSource = 'recorded' | 'imported';

export type WorkoutRecord = {
  schemaVersion: number;
  id: string;
  startedAt: number;
  samples: HeartRateSample[];
  device: WorkoutDevice;
  pauses: WorkoutPause[];
  healthConnect: HealthConnectWriteInfo;
  source: WorkoutSource; // new. 'recorded' for every session this app
  // records itself; 'imported' is not produced anywhere in this ticket —
  // reserved for the (deferred) import epic, exactly as the ticket asks.
};
```

```ts
// src/workout/workout-migrations.ts — new, framework-free (no BLE/Zustand/
// React/AsyncStorage import), mirroring workout-record.ts's "pure
// derivations only" layer.

// A record shape from any past schemaVersion, before migration — every
// field the runner itself touches is typed; anything else passes through
// via the index signature untouched.
type LegacyWorkoutRecord = Record<string, unknown> & { schemaVersion: number };

type MigrationStep = (record: Record<string, unknown>) => Record<string, unknown>;

// Keyed by the version a record is upgrading FROM. Each step both adds the
// field(s) introduced at the NEXT version (defaulted, for a record that
// predates them) and advances schemaVersion to that next version. Adding a
// field in a future ticket means: bump WORKOUT_RECORD_SCHEMA_VERSION and add
// one new entry here, keyed by the version that was CURRENT immediately
// before this one — migrateWorkoutRecord's own loop below never changes.
const MIGRATIONS: Record<number, MigrationStep> = {
  // 1 -> 2: health-connect-workout-sync added `healthConnect`. Formalizes
  // the lenient default `parseHealthConnectWriteInfo` already applied ad
  // hoc in workout-store.ts prior to this ticket.
  1: (record) => ({
    ...record,
    healthConnect: record.healthConnect ?? { status: 'notWritten', recordIds: [] },
    schemaVersion: 2,
  }),
  // 2 -> 3: this ticket adds `source`. Every session saved before this
  // ticket existed was, definitionally, locally recorded — the import epic
  // this field anticipates doesn't exist yet, so 'recorded' is not a guess,
  // it's the only value that could ever be true of a pre-existing record.
  2: (record) => ({
    ...record,
    source: record.source ?? 'recorded',
    schemaVersion: 3,
  }),
};

export function migrateWorkoutRecord(record: LegacyWorkoutRecord): Record<string, unknown> {
  let current: Record<string, unknown> = record;
  while (typeof current.schemaVersion === 'number' && MIGRATIONS[current.schemaVersion]) {
    current = MIGRATIONS[current.schemaVersion](current);
  }
  return current;
}
```

**Invariants:**

- `migrateWorkoutRecord` is a pure function — no I/O, no `AsyncStorage`, no
  React. It never reads or writes `WORKOUT_RECORD_SCHEMA_VERSION` directly;
  the version a record ends up at is simply whatever the last-applied step's
  `schemaVersion` says. Keeping the constant and the migration chain
  decoupled is what makes "no change to the runner" possible when a future
  ticket adds a step — see Style & Conventions.
- **Idempotent by construction, not by a separate check:** the loop's only
  continuation condition is "does a `MIGRATIONS` entry exist for this
  record's current `schemaVersion`." Once a record reaches
  `WORKOUT_RECORD_SCHEMA_VERSION` (3 today), no entry exists for `3`, so the
  loop exits immediately — running `migrateWorkoutRecord` again on its own
  output is a no-op that returns an equivalent object. This directly
  satisfies the ticket's second acceptance criterion with no extra logic.
- **Forward-only, no downgrade handling.** A record whose `schemaVersion` is
  already `>= WORKOUT_RECORD_SCHEMA_VERSION` (including one ahead of it, a
  theoretical downgrade scenario) passes through unchanged — there is no
  entry keyed by an unknown/future version. See Constraints.
- `migrateWorkoutRecord` only fills a field when it is **absent**
  (`record.healthConnect ?? default`, `record.source ?? default`). It does
  not sanitize a _present-but-malformed_ value (e.g. a corrupted
  `source: 123`) — that remains `parseWorkoutRecord`'s job in
  `workout-store.ts`, unchanged in kind from today's
  `parseHealthConnectWriteInfo`, just extended with one sibling helper. This
  keeps "record predates this field" (migration's concern) and "record's
  field is corrupt" (sanitization's concern) as two distinct, independently
  testable steps rather than one conflated function.

## Interfaces / API

### `src/workout/workout-migrations.ts` (new)

```ts
export function migrateWorkoutRecord(record: LegacyWorkoutRecord): Record<string, unknown>;
```

Per Data Model above. `LegacyWorkoutRecord` is exported alongside it so
`workout-store.ts` and this file's own tests share one name for "an object
we've confirmed has a numeric `schemaVersion` but nothing else yet."

### `src/workout/workout-store.ts` (modified)

```ts
// Private — unchanged responsibility, extended by one field.
function parseWorkoutSource(raw: unknown): WorkoutSource {
  return raw === 'recorded' || raw === 'imported' ? raw : 'recorded';
}
```

`parseWorkoutRecord` (`:52-79` today) changes shape but not contract
(`(raw: string | null) => WorkoutRecord | null`, still private, still never
throws):

1. `JSON.parse` and the "is it an object" check are unchanged.
2. The **envelope check** — the fields that have existed, unchanged in
   shape, since `schemaVersion: 1` — is unchanged: `schemaVersion` a
   `number`, `id` a `string`, `startedAt` a `number`, `samples`/`pauses`
   arrays, `device` an object with a string `id`. A record missing or
   mistyping any of _these_ still returns `null` (dropped), exactly as
   today — this ticket does not loosen that bar.
3. The envelope is passed through `migrateWorkoutRecord`, filling in
   whatever version-specific fields it predates.
4. The migrated result's version-specific fields are sanitized against
   corruption exactly as `healthConnect` is today:
   `healthConnect: parseHealthConnectWriteInfo(migrated.healthConnect)`,
   `source: parseWorkoutSource(migrated.source)`. The result is cast to
   `WorkoutRecord` and returned.

`saveWorkoutSession`/`loadWorkoutSession`/`loadWorkoutSessions` keep their
existing signatures — none of this is visible to their callers.

### `src/app/live-workout.tsx` (modified — one field, additive)

The `WorkoutRecord` literal built at `:141-149` gains one line:

```ts
return {
  schemaVersion: WORKOUT_RECORD_SCHEMA_VERSION,
  id: createWorkoutId(startedAt),
  startedAt,
  samples,
  device: { id: deviceId, name: device?.name ?? device?.lastKnownName ?? null },
  pauses,
  healthConnect: { status: 'notWritten', recordIds: [] },
  source: 'recorded', // new
};
```

No other line in this file changes — this is the only construction site
(see Context), and `WORKOUT_RECORD_SCHEMA_VERSION` is already referenced
rather than a literal `2`, so the version bump itself needs no edit here.

## Files Created

| File                                               | Purpose                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/workout/workout-migrations.ts`                | The versioned migration runner (`migrateWorkoutRecord`, the `MIGRATIONS` map).                                        |
| `src/workout/__tests__/workout-migrations.test.ts` | Unit tests for the runner: M1-shaped input, M2-shaped input, idempotency, pass-through for an unknown/future version. |

## Files Modified

| File                                                 | Change                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/workout/workout-record.ts`                      | Bump `WORKOUT_RECORD_SCHEMA_VERSION` to `3`; add `WorkoutSource`; add `source` to `WorkoutRecord`.                                                                                     |
| `src/workout/workout-store.ts`                       | `parseWorkoutRecord` routes through `migrateWorkoutRecord` before final sanitization; add private `parseWorkoutSource`, used alongside the existing `parseHealthConnectWriteInfo`.     |
| `src/app/live-workout.tsx`                           | Add `source: 'recorded'` to the one `WorkoutRecord` literal built at `:141-149`. No other line changes.                                                                                |
| `src/workout/__tests__/workout-record.test.ts`       | `WORKOUT_RECORD_SCHEMA_VERSION` assertion updates to `3`; `makeRecord()` fixture gains `source: 'recorded'`.                                                                           |
| `src/workout/__tests__/workout-store.test.ts`        | `makeRecord()` fixture gains `source: 'recorded'`; add legacy-record read tests (M1-shaped and M2-shaped raw JSON seeded directly via `AsyncStorage.setItem`) per Acceptance Criteria. |
| `src/app/__tests__/live-workout.test.tsx`            | The constructed-record assertion (`:315-320` today) gains `source: 'recorded'`.                                                                                                        |
| `src/app/(tabs)/__tests__/history.test.tsx`          | Local `makeRecord()` fixture gains `source: 'recorded'` (required field — TS fails otherwise).                                                                                         |
| `src/app/(tabs)/__tests__/index.test.tsx`            | Same.                                                                                                                                                                                  |
| `src/app/session/__tests__/[id].test.tsx`            | Same.                                                                                                                                                                                  |
| `src/components/__tests__/session-summary.test.tsx`  | Same.                                                                                                                                                                                  |
| `src/health/__tests__/health-connect-sync.test.ts`   | Same.                                                                                                                                                                                  |
| `src/health/__tests__/health-connect-writer.test.ts` | Same.                                                                                                                                                                                  |

## Implementation Steps

1. Create `src/workout/workout-migrations.ts` (`migrateWorkoutRecord`,
   `MIGRATIONS`) and its test — fully unit-testable in isolation, no
   dependency on storage or any screen.
2. In `src/workout/workout-record.ts`: bump `WORKOUT_RECORD_SCHEMA_VERSION`
   to `3`, add `WorkoutSource`, add `source` to `WorkoutRecord`.
3. In `src/workout/workout-store.ts`: add `parseWorkoutSource`; route
   `parseWorkoutRecord` through `migrateWorkoutRecord` per Interfaces/API.
4. In `src/app/live-workout.tsx`: add `source: 'recorded'` to the one
   record-construction literal.
5. Update every fixture listed in Files Modified (each file's own local
   `makeRecord()`/inline literal — this repo duplicates the fixture per
   test file rather than sharing one, see Style & Conventions) to include
   `source: 'recorded'`, and bump the two `schemaVersion: 2` literals
   referenced in Acceptance Criteria's fixtures.
6. Add the new legacy-record read tests to `workout-store.test.ts`.
7. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **The migration runner is the single choke point; screens get none of
  their own null-checks.** This directly extends
  `health-connect-workout-sync`'s own stated rule ("no consumer of
  `loadWorkoutSession`/`loadWorkoutSessions` needs its own null/undefined
  check") to the new field, rather than introducing a second pattern. The
  ticket's "audit every screen" scope item is satisfied by this
  architectural confirmation — `history.tsx`, `index.tsx`,
  `session-summary.tsx`, `session/[id].tsx`, and `health-connect-sync.ts`
  need no code change, because none of them reads `source` yet and every
  field they do read already arrives fully migrated.
- **Migration (fills an absent field) and sanitization (repairs a corrupt
  present field) stay two separate functions**, per the Data Model
  invariant — `migrateWorkoutRecord` never inspects a field's _validity_,
  only its _presence_; `parseHealthConnectWriteInfo`/`parseWorkoutSource`
  never care which schema version introduced the field they're sanitizing.
  Conflating the two would make a future migration step responsible for
  corruption it didn't create.
- **`workout-migrations.ts` is framework-free**, matching
  `workout-record.ts`'s own established "no BLE/Zustand/React/AsyncStorage
  import" rule for this layer.
- **Test fixtures stay duplicated per file, not extracted to a shared
  helper** — this repo already has eight independent `makeRecord()`-shaped
  fixtures across its test suite (per the Files Modified table) rather than
  one imported helper; this ticket's one-field addition follows that
  existing precedent rather than introducing a shared test util as a side
  effect.
- No new `en.json` key and no UI change — this ticket is invisible to a
  user by design (see Context's User impact).

## Acceptance Criteria

- [ ] `migrateWorkoutRecord` on an M1-shaped record (`schemaVersion: 1`, no
      `healthConnect`, no `source`) returns a record with `schemaVersion: 3`,
      `healthConnect: { status: 'notWritten', recordIds: [] }`, and
      `source: 'recorded'`.
- [ ] `migrateWorkoutRecord` on an M2-shaped record (`schemaVersion: 2`, a
      real `healthConnect` value already present, no `source`) returns
      `schemaVersion: 3`, the **original** `healthConnect` value untouched,
      and `source: 'recorded'`.
- [ ] `migrateWorkoutRecord` is idempotent: calling it a second time on its
      own output returns a deep-equal result, for both the M1-shaped and
      M2-shaped inputs above.
- [ ] `migrateWorkoutRecord` on a record whose `schemaVersion` has no
      registered `MIGRATIONS` entry (e.g. already `3`, or a hypothetical
      `4`) returns it unchanged.
- [ ] `loadWorkoutSession`/`loadWorkoutSessions`, given a raw M1-shaped JSON
      string written directly via `AsyncStorage.setItem` (no `healthConnect`,
      no `source` key at all), resolve a `WorkoutRecord` with `schemaVersion:
    3`, a well-formed `healthConnect`, and `source: 'recorded'` — no thrown
      error, no dropped record.
- [ ] Same, for a raw M2-shaped JSON string (`healthConnect` present,
      `source` absent) — resolves `schemaVersion: 3`, the original
      `healthConnect` preserved, `source: 'recorded'`.
- [ ] Every pre-existing `workout-store.test.ts` case (corrupt index,
      missing key, thrown `AsyncStorage` errors, most-recent-first ordering)
      still passes unmodified.
- [ ] `WORKOUT_RECORD_SCHEMA_VERSION === 3`.
- [ ] Live Workout's constructed `WorkoutRecord` includes `source:
    'recorded'` (existing assertion in `live-workout.test.tsx`, extended).
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: this ticket adds the migration runner and exactly one new
  field, `source`. It does **not** add `activityType`, `route`, `altitude`,
  or `calories` — those are explicitly later tickets' responsibility. Once
  this ticket lands, `WORKOUT_RECORD_SCHEMA_VERSION` is `3`, so each later
  ticket adds its own field by registering one new `MIGRATIONS[3]` entry
  (keyed by `3`, the version that was current immediately before that
  ticket's own bump) and bumping the constant — no change to
  `migrateWorkoutRecord` itself, per this ticket's own third acceptance
  criterion.
- **No actual import feature.** `WorkoutSource`'s `'imported'` value is
  defined but never produced anywhere in this codebase after this ticket —
  reserved solely so a future importer doesn't need a second migration, per
  the issue's explicit instruction.
- **Forward-only migration, no downgrade path.** A record at or above the
  current `schemaVersion` (including a value higher than any version this
  app build knows about) passes through unchanged rather than being
  repaired or rejected — not a concern this ticket's acceptance criteria
  raise, and out of proportion for a single-device local-training app with
  no server-side version negotiation.
- **No data-loss guard beyond what already exists.** `parseWorkoutRecord`'s
  envelope check (`schemaVersion`/`id`/`startedAt`/`samples`/`pauses`/
  `device.id`) is unchanged — a record missing one of _those_ still returns
  `null` and is silently dropped from `loadWorkoutSessions`, exactly as
  today. This ticket only removes the need for further bespoke leniency as
  new optional fields are added; it does not relax or revisit which fields
  are load-bearing.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
