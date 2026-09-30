# Feature: Session Activity Type

## Intent

Every session started from this point forward carries a small, closed
`activityType` (run/walk/cycle/strength/other), chosen on a picker at session
start that defaults to whatever was last picked; that type is visible on the
live workout screen, the session summary, and every history row; and it drives
the exercise type Health Connect receives — while a session saved before this
ticket existed shows a distinct "not recorded" state rather than being
silently relabeled as any of the five.

## Context

- **Problem statement:** [GitHub issue #62](https://github.com/ajcondino/fitness-tracker/issues/62)
  (milestone "Milestone 3: Optional Stretch"). `WorkoutRecord`
  (`src/workout/workout-record.ts:50-59`) has no notion of what kind of
  activity a session was — every session, past or future, is currently
  indistinguishable strength/run/walk/cycle, which blocks calorie estimation,
  a correct Health Connect `ExerciseSessionRecord.exerciseType` (today
  hardcoded to `ExerciseType.OTHER_WORKOUT` at
  `src/health/health-connect-writer.ts:69`), and any future export. The issue
  also asks that this be the first real field added through the migration
  runner landed by `session-schema-versioning-migration`
  (`docs/specs/session-schema-versioning-migration/SPEC.md`), to confirm that
  runner scales past its own first field (`source`).
- **Current code:**
  - `src/workout/workout-record.ts` — `WORKOUT_RECORD_SCHEMA_VERSION = 3`;
    `WorkoutRecord` has no activity-related field. `WorkoutSource` (`:40`) is
    the direct precedent for adding a small closed string union alongside it.
  - `src/workout/workout-migrations.ts` — `MIGRATIONS` keyed by the
    from-version, per its own doc comment "adding a field in a future ticket
    means: bump `WORKOUT_RECORD_SCHEMA_VERSION` and add one new entry here...
    `migrateWorkoutRecord`'s own loop below never changes." This ticket is
    the first to exercise that promise; today only `MIGRATIONS[1]` and
    `MIGRATIONS[2]` exist (adding `healthConnect` and `source` respectively).
  - `src/workout/workout-store.ts` — `parseWorkoutRecord` (`:66-100`) routes
    every read through `migrateWorkoutRecord` and then sanitizes each
    version-specific field with its own private parser
    (`parseHealthConnectWriteInfo`, `parseWorkoutSource`), per that spec's
    "migration fills an absent field, sanitization repairs a corrupt one, two
    separate steps" rule.
  - `src/app/live-workout.tsx:141-153` — the sole `WorkoutRecord`
    construction site (inside the `session.phase === 'ended'` effect); already
    references `WORKOUT_RECORD_SCHEMA_VERSION` rather than a literal.
    `session.phase === 'idle'`'s action row (`:399-440`) is the sole
    pre-Start UI — a back button and the `START` button, nothing else.
  - `src/health/health-connect-writer.ts` — `writeWorkoutSessionToHealthConnect`
    hardcodes `exerciseType: ExerciseType.OTHER_WORKOUT` (`:69`) when building
    the `ExerciseSessionRecord`. `ExerciseType` (from
    `react-native-health-connect`) is a numeric constant map already imported
    here; `RUNNING` (56), `WALKING` (79), `BIKING` (8),
    `STRENGTH_TRAINING` (70), and `OTHER_WORKOUT` (0) are the five values this
    ticket needs (confirmed against
    `node_modules/react-native-health-connect/lib/typescript/constants.d.ts`).
  - `src/components/session-summary.tsx` and `src/components/session-row.tsx`
    are the two presentational surfaces the ticket names ("session summary,"
    "history list"); `session-row.tsx` is also reused by
    `src/app/(tabs)/index.tsx`'s "Recent" list, not only
    `src/app/(tabs)/history.tsx` — both call sites need the same new prop.
    `SessionRow`'s own doc comment states its convention: "every label
    arrives pre-formatted from the caller, no date math, no `Intl`" — this
    ticket's activity-type label follows that same rule rather than teaching
    `SessionRow` about the enum or i18n.
  - No `Picker`/`SegmentedControl`-shaped component exists anywhere in
    `src/` today (`grep -rl "Picker\|SegmentedControl" src` returns nothing
    outside `use-auth.ts`, an unrelated `AuthSessionResult` type). The nearest
    precedent for a small set of mutually-exclusive, tappable pill options is
    `SessionRow`'s own pressed/selected treatment
    (`surfaceRaised` fill, border shifted to `theme.colors.primaryWash`) and
    `DeviceChip`'s `reconnecting` variant (`primary` border + `primary` text
    on an otherwise unfilled chip) — used below instead of a solid yellow
    fill, since DESIGN.md's Overview reserves solid `primary` fill for "the
    one action that matters on each screen" (already the `START` button on
    this exact screen).
- **User impact:** Starting a session now shows a row of five activity pills
  before `START` is pressed, pre-selected to whatever was chosen last time (or
  `Run` on first-ever use). The chosen type is visible while the session runs,
  on its summary afterward, and in every history/recent row. Every session
  saved before this ticket reads as "Not recorded" wherever a type would
  otherwise show, rather than silently becoming e.g. "Run."
- **Dependencies:** Builds directly on `session-schema-versioning-migration`'s
  `migrateWorkoutRecord`/`MIGRATIONS` runner (this ticket adds exactly one new
  entry, keyed `3`, per that spec's Constraints) and on
  `health-connect-workout-sync`'s existing write path
  (`writeWorkoutSessionToHealthConnect`). No new package.

## Data Model

```ts
// src/workout/workout-record.ts — modified

export const WORKOUT_RECORD_SCHEMA_VERSION = 4; // was 3; bumped for `activityType`

export type ActivityType = 'run' | 'walk' | 'cycle' | 'strength' | 'other';

// Canonical display/iteration order — shared by the picker (button order)
// and any future screen that needs to enumerate the five values, so the
// order is defined once rather than re-declared per consumer.
export const ACTIVITY_TYPES: ActivityType[] = ['run', 'walk', 'cycle', 'strength', 'other'];

export type WorkoutRecord = {
  schemaVersion: number;
  id: string;
  startedAt: number;
  samples: HeartRateSample[];
  device: WorkoutDevice;
  pauses: WorkoutPause[];
  healthConnect: HealthConnectWriteInfo;
  source: WorkoutSource;
  // null exclusively means "recorded before this field existed" — never
  // produced by any code path this ticket adds. Every session Live Workout
  // constructs from here on has a concrete ActivityType, because the picker
  // always has a selection (defaulted, never empty). See Style &
  // Conventions for why this is `| null` rather than folding "unknown" into
  // the `'other'` member.
  activityType: ActivityType | null;
};
```

```ts
// src/workout/workout-migrations.ts — modified: one new MIGRATIONS entry

const MIGRATIONS: Record<number, MigrationStep> = {
  1: (record) => ({/* unchanged */}),
  2: (record) => ({/* unchanged */}),
  // 3 -> 4: this ticket adds `activityType`. A record that predates this
  // field could have been any activity — unlike `source`, there is no
  // single value that's "definitionally" correct for every prior session,
  // so it's left `null` ("not recorded") rather than guessed as any of the
  // five, per the issue's explicit "do not silently label old sessions as
  // runs."
  3: (record) => ({
    ...record,
    activityType: record.activityType ?? null,
    schemaVersion: 4,
  }),
};
```

**Invariants** (extending `migrateWorkoutRecord`'s existing ones — see
`session-schema-versioning-migration`'s SPEC.md, unchanged by this ticket):
this migration only fills an _absent_ `activityType`; a present-but-corrupt
value (e.g. `activityType: 123`) remains `workout-store.ts`'s sanitization
job, not the migration's, per that spec's "two separate steps" rule.

**Persistence — last-used activity type:**

- One new AsyncStorage key, `workout.lastActivityType`, holding one of the
  five literal strings — mirrors `units-store.ts`'s "one key per concern, not
  a JSON blob" choice and `workout-store.ts`'s own `workout.*` key namespace.
- **Default: `'run'`**, when nothing is persisted yet or the stored value
  fails to parse. `ACTIVITY_TYPES[0]`, so the picker's first-ever render
  matches its own leftmost, first-listed option — a plain "no prior choice"
  default, not a claim about most users' actual activity. Recorded here as a
  design decision so a reviewer can override it before implementation; it has
  no bearing on migrated (`null`) legacy records, which are a separate code
  path entirely (see above).
- This preference is unrelated to `record.activityType` — it only seeds the
  picker's initial selection for a _new_ session and is overwritten every
  time the picker's selection changes (see Interfaces/API). It is never
  read or written by `workout-store.ts` or the migration runner.

## Interfaces / API

### `src/workout/workout-migrations.ts` (modified)

Per Data Model — one new `MIGRATIONS[3]` entry. No change to
`migrateWorkoutRecord`'s loop itself, confirming
`session-schema-versioning-migration`'s own third acceptance criterion.

### `src/workout/workout-store.ts` (modified)

```ts
// Private — same shape as the existing parseWorkoutSource.
function parseActivityType(raw: unknown): ActivityType | null {
  return raw === 'run' || raw === 'walk' || raw === 'cycle' || raw === 'strength' || raw === 'other'
    ? raw
    : null;
}
```

`parseWorkoutRecord`'s final construction gains one line:
`activityType: parseActivityType(migrated.activityType)`. A missing key
(migrated by `migrateWorkoutRecord` to `null` already) and a corrupt key
both resolve to `null` — indistinguishable, and correctly so, since both
mean "this record's activity type isn't a trustworthy one of the five."

### `src/workout/activity-type-store.ts` (new)

Framework-free (no BLE/Zustand/React import), mirroring `units-store.ts`'s
shape exactly:

```ts
export async function loadLastActivityType(): Promise<ActivityType>; // 'run' on unset/corrupt/thrown read
export async function saveLastActivityType(type: ActivityType): Promise<void>; // best-effort, never throws
```

### `src/hooks/use-last-activity-type.ts` (new)

Thin hook, mirrors `use-units-preference.ts`'s shape:

```ts
export function useLastActivityType(): {
  activityType: ActivityType;
  setActivityType: (type: ActivityType) => void;
};
```

State initializes synchronously to `'run'` (a legitimate value, not a
sentinel — same reasoning as `useUnitsPreference`'s synchronous `'metric'`
default) and is overwritten once `loadLastActivityType()` resolves, on mount
only. `setActivityType` is optimistic: updates state immediately and calls
`saveLastActivityType` without awaiting it.

### `src/components/activity-type-picker.tsx` (new)

Presentational, feature-composed (owns Activity-specific copy and layout;
same tier as `units-section.tsx`, not a `ui/` primitive).

```ts
export type ActivityTypePickerProps = {
  value: ActivityType;
  onChange: (type: ActivityType) => void;
};
```

Renders a `label-caps`/`onSurfaceFaint` header (`liveWorkout.activityPicker.header`,
"ACTIVITY") above a `flexDirection: row`, wrapping (`flexWrap: 'wrap'`),
`gap: spacing.sm` group of five pills, one per `ACTIVITY_TYPES` entry, each an
`accessibilityRole="button"` `Pressable` with `accessibilityState={{ selected:
type === value }}` and `testID={`activity-type-picker-${type}`}`:

- **Unselected:** `backgroundColor: surface`, `borderColor: outline`, label
  color `onSurfaceChip`.
- **Selected:** `backgroundColor: surfaceRaised`, `borderColor: primary`,
  label color `primary` — the same "border + text shift to primary, no solid
  fill" treatment `DeviceChip`'s `reconnecting` variant already uses, chosen
  so this screen doesn't gain a second solid-yellow element alongside its
  `START` button (see DESIGN.md's "when a screen has two yellow things on it,
  one of them is wrong").

Label text is `t(\`activityType.${type}\`)` (`data-md`, uppercase — matches
every other button-like label on this screen). Pressing an unselected pill
calls `onChange(type)`; pressing the already-selected pill is a no-op (still
calls `onChange` with the same value — harmless, keeps the component free of
an internal "is this already selected" branch).

### `src/app/live-workout.tsx` (modified — additive)

- `const { activityType: selectedActivityType, setActivityType } = useLastActivityType();`
- New block, gated `session.phase === 'idle'`, rendered directly above the
  existing idle `actionRow` (`:399-440`): `<ActivityTypePicker value={selectedActivityType} onChange={setActivityType} />`.
  Because this block only exists while `phase === 'idle'`, `selectedActivityType`
  cannot change again once `START` is pressed — no separate "freeze" state is
  needed, mirroring how `deviceId`'s `useState(() => ...)` initializer already
  freezes itself by construction elsewhere in this file.
- New line inside `sessionHeading`, gated `session.phase === 'running' ||
session.phase === 'paused'` (i.e. visible whenever the title row itself is,
  minus idle — the picker already shows the selection then, so a second badge
  would be redundant): a `dataSm`/`primary` `ThemedText` reading
  `t(\`activityType.${selectedActivityType}\`)`, `testID="live-workout-activity-type"`.
- The `WorkoutRecord` literal (`:141-152`) gains one line:
  `activityType: selectedActivityType`.

### `src/components/session-summary.tsx` (modified — additive)

New `ThemedText` between the existing `statusRow` and `heroBlock`:
`labelCaps`/`onSurfaceDim`, `testID="session-summary-activity-type"`,
content `t(record.activityType != null ? \`activityType.${record.activityType}\` : 'activityType.notRecorded')`.
No prop-shape change — `record`already carries`activityType`.

### `src/components/session-row.tsx` (modified)

`SessionRowProps` gains one required field, following the file's existing
"every label arrives pre-formatted from the caller" rule (same as
`durationLabel`/`averageBpmLabel`):

```ts
export type SessionRowProps = {
  // ...existing fields unchanged
  activityTypeLabel: string; // e.g. "Run", or the notRecorded string — caller
  // resolves record.activityType through t() before this component ever sees it
};
```

Rendered as one more `dataMd`/`onSurfaceMuted` segment in the existing `meta`
row, inserted between `durationLabel` and `averageBpmLabel` with the same
`dot` divider either side (extends the existing time · duration · avg pattern
to time · duration · type · avg).

### `src/app/(tabs)/history.tsx` and `src/app/(tabs)/index.tsx` (modified)

Both `<SessionRow>` call sites gain:

```ts
activityTypeLabel={t(
  record.activityType != null ? `activityType.${record.activityType}` : 'activityType.notRecorded',
)}
```

### `src/health/health-connect-writer.ts` (modified)

```ts
// New, exported for direct unit testing per the ticket's own acceptance
// criterion — no hook, no store, pure mapping.
export function mapActivityTypeToExerciseType(activityType: ActivityType | null): number {
  switch (activityType) {
    case 'run':
      return ExerciseType.RUNNING;
    case 'walk':
      return ExerciseType.WALKING;
    case 'cycle':
      return ExerciseType.BIKING;
    case 'strength':
      return ExerciseType.STRENGTH_TRAINING;
    case 'other':
    case null:
      return ExerciseType.OTHER_WORKOUT;
  }
}
```

`writeWorkoutSessionToHealthConnect`'s `exerciseRecord` literal changes
`exerciseType: ExerciseType.OTHER_WORKOUT` to
`exerciseType: mapActivityTypeToExerciseType(record.activityType)`. Nothing
else in this file changes — the two-call, chunked-write structure the file's
own JSDoc already documents is untouched.

## Files Created

| File                                                     | Purpose                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/workout/activity-type-store.ts`                     | AsyncStorage persistence for the last-used activity type.                                     |
| `src/hooks/use-last-activity-type.ts`                    | Thin hook: loads the last-used type on mount, exposes an optimistic setter.                   |
| `src/components/activity-type-picker.tsx`                | The five-pill selector shown on Live Workout before Start.                                    |
| `src/workout/__tests__/activity-type-store.test.ts`      | Default/corrupt/round-trip/error-swallowing cases, mirroring `units-store.test.ts`.           |
| `src/hooks/__tests__/use-last-activity-type.test.ts`     | Initial default, post-load value, optimistic setter behavior.                                 |
| `src/components/__tests__/activity-type-picker.test.tsx` | Renders five pills, asserts selected styling/`accessibilityState`, press → `onChange` wiring. |

## Files Modified

| File                                                 | Change                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/workout/workout-record.ts`                      | Bump `WORKOUT_RECORD_SCHEMA_VERSION` to `4`; add `ActivityType`, `ACTIVITY_TYPES`; add `activityType` to `WorkoutRecord`.                                                                                                                          |
| `src/workout/workout-migrations.ts`                  | Add `MIGRATIONS[3]` entry per Data Model.                                                                                                                                                                                                          |
| `src/workout/workout-store.ts`                       | Add private `parseActivityType`; wire into `parseWorkoutRecord`.                                                                                                                                                                                   |
| `src/app/live-workout.tsx`                           | Wire `useLastActivityType()`; render `<ActivityTypePicker>` while idle; render the running/paused activity-type badge; add `activityType` to the constructed `WorkoutRecord`.                                                                      |
| `src/components/session-summary.tsx`                 | Render the activity-type (or "not recorded") label.                                                                                                                                                                                                |
| `src/components/session-row.tsx`                     | Add `activityTypeLabel` prop; render it in the meta row.                                                                                                                                                                                           |
| `src/app/(tabs)/history.tsx`                         | Pass `activityTypeLabel` to `<SessionRow>`.                                                                                                                                                                                                        |
| `src/app/(tabs)/index.tsx`                           | Same, for the Recent list's `<SessionRow>`.                                                                                                                                                                                                        |
| `src/health/health-connect-writer.ts`                | Add `mapActivityTypeToExerciseType`; use it instead of the hardcoded `ExerciseType.OTHER_WORKOUT`.                                                                                                                                                 |
| `src/i18n/locales/en.json`                           | Add `activityType` namespace (five labels + `notRecorded`); add `liveWorkout.activityPicker.header`.                                                                                                                                               |
| `src/workout/__tests__/workout-record.test.ts`       | `WORKOUT_RECORD_SCHEMA_VERSION` assertion updates to `4`; `makeRecord()` fixture gains `activityType: 'run'`.                                                                                                                                      |
| `src/workout/__tests__/workout-migrations.test.ts`   | Add schemaVersion-3-shaped-input case (per `session-schema-versioning-migration`'s own test pattern).                                                                                                                                              |
| `src/workout/__tests__/workout-store.test.ts`        | `makeRecord()` fixture gains `activityType: 'run'`; add a schemaVersion-3 legacy-record read test asserting `activityType: null`.                                                                                                                  |
| `src/app/__tests__/live-workout.test.tsx`            | Constructed-record assertion gains `activityType`; add idle-phase picker render/selection/persistence tests; add running/paused badge test.                                                                                                        |
| `src/app/(tabs)/__tests__/history.test.tsx`          | Local `makeRecord()` fixture gains `activityType: 'run'` (required field); assert the new meta segment.                                                                                                                                            |
| `src/app/(tabs)/__tests__/index.test.tsx`            | Same.                                                                                                                                                                                                                                              |
| `src/app/session/__tests__/[id].test.tsx`            | Same fixture update.                                                                                                                                                                                                                               |
| `src/components/__tests__/session-summary.test.tsx`  | Fixture update; add a rendered-label test and a `activityType: null` → "Not recorded" test.                                                                                                                                                        |
| `src/components/__tests__/session-row.test.tsx`      | Fixture/props update; add a rendered `activityTypeLabel` test.                                                                                                                                                                                     |
| `src/health/__tests__/health-connect-writer.test.ts` | Fixture gains `activityType`; add `mapActivityTypeToExerciseType` unit tests (all five inputs + `null` → `OTHER_WORKOUT`); update the existing `exerciseType` assertion to reflect the record's own type instead of the old hardcoded expectation. |
| `src/health/__tests__/health-connect-sync.test.ts`   | Fixture gains `activityType: 'run'`.                                                                                                                                                                                                               |

## Implementation Steps

1. `src/workout/workout-record.ts`: bump `WORKOUT_RECORD_SCHEMA_VERSION` to
   `4`, add `ActivityType`, `ACTIVITY_TYPES`, add `activityType` to
   `WorkoutRecord`.
2. `src/workout/workout-migrations.ts`: add the `MIGRATIONS[3]` entry; extend
   its test with a schemaVersion-3-shaped input (no `activityType` key) and
   confirm idempotency and pass-through-when-current still hold.
3. `src/workout/workout-store.ts`: add `parseActivityType`; wire into
   `parseWorkoutRecord`; add the legacy-record read test.
4. Create `src/workout/activity-type-store.ts` and its test, mirroring
   `units-store.ts`/`units-store.test.ts`.
5. Create `src/hooks/use-last-activity-type.ts` and its test, mirroring
   `use-units-preference.ts`/its test.
6. Add the `activityType` and `liveWorkout.activityPicker` keys to
   `src/i18n/locales/en.json`.
7. Create `src/components/activity-type-picker.tsx` and its test, per
   Interfaces/API.
8. Wire `<ActivityTypePicker>`, the running/paused badge, and
   `activityType` on the constructed record into `src/app/live-workout.tsx`;
   extend `live-workout.test.tsx`.
9. Add the activity-type label to `src/components/session-summary.tsx`;
   extend its test with a present-type case and a `null` → "Not recorded"
   case.
10. Add `activityTypeLabel` to `SessionRowProps` and render it in
    `src/components/session-row.tsx`; extend its test.
11. Wire the new `SessionRow` prop at both call sites
    (`src/app/(tabs)/history.tsx`, `src/app/(tabs)/index.tsx`); extend both
    tests plus `src/app/session/__tests__/[id].test.tsx`'s fixture.
12. Add `mapActivityTypeToExerciseType` to
    `src/health/health-connect-writer.ts` and use it in place of the
    hardcoded `ExerciseType.OTHER_WORKOUT`; extend
    `health-connect-writer.test.ts` with the mapping's own unit tests and
    update its existing `exerciseType` assertion; bump the
    `health-connect-sync.test.ts` fixture.
13. Update every remaining fixture listed in Files Modified
    (`workout-record.test.ts`, `workout-store.test.ts`).
14. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **`activityType: ActivityType | null`, not a sixth `'unrecorded'` enum
  member.** The issue frames this as a choice between `'other'` and
  `null` + a distinct display; `null` is used here so a person who
  _deliberately_ picks "Other" for a real M3+ session is never
  indistinguishable, in data or in display copy, from a session that simply
  predates this feature. `null` is produced by exactly one place
  (`MIGRATIONS[3]`, and by extension `parseActivityType`'s corrupt-value
  fallback) and nowhere else — every code path that constructs a new
  `WorkoutRecord` (only `live-workout.tsx`) always supplies a concrete
  `ActivityType`, per `ActivityTypePicker` always having a selection.
- **Migration (fills an absent field) and sanitization (repairs a corrupt
  one) stay separate**, exactly as `session-schema-versioning-migration`'s
  spec establishes for `source`/`healthConnect` — `MIGRATIONS[3]` only checks
  presence; `parseActivityType` only checks validity.
- **No new DESIGN.md token.** The picker's selected/unselected states reuse
  `surface`/`surfaceRaised`/`outline`/`primary`/`onSurfaceChip`, already
  established by `SessionRow` and `DeviceChip`; per CLAUDE.md's Theming
  section, a new token would need to land in DESIGN.md first, and none is
  needed here.
- **`SessionRow` stays caller-formatted.** It gains a plain `string` prop,
  not `ActivityType | null` — consistent with every other label on that
  component, and keeping i18n lookups out of a presentation-only component.
- **Every user-facing string goes through `t()`** against a new
  `activityType` namespace, shared verbatim by Live Workout, Session Summary,
  and both `SessionRow` call sites — one definition of each label's copy, per
  CLAUDE.md's i18n section.
- **Additive diffs.** `live-workout.tsx`, `session-summary.tsx`,
  `session-row.tsx`, `history.tsx`, and `index.tsx` are all working screens;
  each change here is a new block, a new prop, or one new line in an existing
  object literal — no restructuring of surrounding layout or logic, per
  CLAUDE.md's "additive diffs on working screens."
- **No shared cross-cutting component invented.** `ActivityTypePicker` is
  feature-specific to session start, not a `ui/` primitive — mirrors
  `units-section.tsx`'s precedent for a new feature-level component, not a
  new addition to `src/components/ui/`.

## Acceptance Criteria

- [ ] `WORKOUT_RECORD_SCHEMA_VERSION === 4`.
- [ ] `migrateWorkoutRecord` on a schemaVersion-3-shaped record (no
      `activityType` key) returns `schemaVersion: 4` and `activityType: null`;
      idempotent on its own output.
- [ ] `loadWorkoutSession`/`loadWorkoutSessions`, given a raw schemaVersion-3
      JSON string with no `activityType` key, resolve a record with
      `activityType: null` — no thrown error, no dropped record.
- [ ] A raw record with a corrupt `activityType` (e.g. `"jogging"`) also
      resolves to `activityType: null`, not a thrown error or a passed-through
      invalid value.
- [ ] Live Workout, while `phase === 'idle'`, shows all five activity pills;
      the one matching the last-persisted choice (or `Run`, on first-ever
      launch) is visually and semantically (`accessibilityState.selected`)
      selected; tapping a different pill updates the selection and persists
      it via `saveLastActivityType`.
- [ ] The `WorkoutRecord` Live Workout constructs on Stop carries whichever
      `ActivityType` was selected at the moment `START` was pressed.
- [ ] The chosen activity type is visible while a session is running or
      paused, on its post-session summary (both `mode="review"` and
      `mode="detail"`), and in its History row and Home's Recent row.
- [ ] A session with `activityType: null` (any record saved before this
      ticket) displays a distinct "Not recorded" state everywhere a type
      would otherwise show — never one of the five real labels.
- [ ] `mapActivityTypeToExerciseType` is covered by a direct unit test for
      all five `ActivityType` values plus `null`, asserting the exact
      `ExerciseType` constant each maps to, with `'other'` and `null` both
      asserted to fall back to `ExerciseType.OTHER_WORKOUT`.
- [ ] A `WorkoutRecord` written to Health Connect after this ticket produces
      an `ExerciseSessionRecord.exerciseType` matching its own
      `activityType`, per `health-connect-writer.test.ts`'s updated
      assertion.
- [ ] Every pre-existing test in every file listed under Files Modified
      still passes once its fixture is updated.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: exactly one new field, `activityType`, plus its picker,
  display surfaces, Health Connect mapping, and last-used persistence. No
  `route`, `altitude`, `calories`, or calorie estimation itself — those
  remain later tickets', per the issue's own scope note and
  `session-schema-versioning-migration`'s Constraints.
- **Closed enum, no "add a sixth type" affordance.** `ActivityType` is
  exactly `'run' | 'walk' | 'cycle' | 'strength' | 'other'`, per the issue's
  explicit "keep it short; expand later." No custom/free-text activity name.
- **No mid-session change.** The picker is only rendered/interactive while
  `phase === 'idle'`; there is no way to change a session's activity type
  once `START` has been pressed, and none is requested.
- **`'run'` is a default-of-convenience, not a researched choice.** Flagged
  above in Data Model for explicit sign-off before implementation; trivial to
  change to `'other'` or any other member if the reviewer disagrees.
- **No calorie estimation.** `activityType` is plumbed everywhere the ticket
  names, but nothing in this ticket computes or displays a calorie value —
  that consumer doesn't exist yet, per the issue's own list of _future_
  consumers.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
