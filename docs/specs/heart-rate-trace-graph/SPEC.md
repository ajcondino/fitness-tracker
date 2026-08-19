# Feature: Heart Rate Trace Graph

## Intent

A single, pure `bucketHeartRateSamples` function turns any `HeartRateSample[]`
plus a time range into one bpm-or-gap value per bucket, and a single
presentational `HeartRateTrace` renders that array as bars — so Session
Summary (review and history-detail) shows a static trace spanning the saved
session's real time range, and Live Workout shows the same renderer fed a
memoized rolling window, with a dropout or pause visible as a genuine gap in
both.

## Context

- **Problem statement:** Nothing in this repo buckets `HeartRateSample[]` by
  time or renders a bar chart of any kind. Session Summary
  (`src/components/session-summary.tsx:81-83`) has only a comment marking
  where a chart would go — `{/* The trace-graph ticket slots its chart here,
between the hero block and the stat cards — no reserved space until it
lands. */}` — **not** a fixed-height reserved block, contrary to this
  ticket's own framing ("the layout already reserves space for it"); there is
  nothing to resize around, only a marked insertion point. Live Workout
  (`src/app/live-workout.tsx`) has no chart of any kind, live or otherwise.
- **Current code:**
  - `src/hooks/use-workout-session.ts` — `HeartRateSample` (`:8-11`,
    `{ bpm, timestamp }`) is the one sample shape this ticket reads, already
    exported and reused by `WorkoutRecord.samples`
    (`src/workout/workout-record.ts:36`). `useWorkoutSession`'s
    `samples`/`pauses` (`:65-66`) are append-only while `phase === 'running'`
    (`:73-79`); its `ELAPSED_TICK_INTERVAL_MS` (`:46`, 1000ms) already forces
    one re-render per second for the life of the hook, **independent of
    `phase`** (`:81-87`'s effect has no phase guard) — this is what already
    drives Live Workout's `elapsedMs` display and is reused, unmodified, as
    this ticket's own live-recompute cadence (see Interfaces/API).
  - `src/workout/workout-record.ts` — `deriveWorkoutSummary` (`:60-83`) is the
    existing per-record stat derivation this ticket's bucketing function is
    added alongside, per the ticket's explicit instruction. Its `durationMs`
    (`:78`) is `lastReadingAt - startedAt - pausedMs` — the **active**
    duration, with paused overlap subtracted — computed from `samples`'s own
    last entry, not `Date.now()` (Context: a finished record has no "now").
    This is the "duration shown elsewhere on the screen" the ticket asks the
    chart's time range to agree with; see the Design decision below for why
    it deliberately does not, and why that's unavoidable.
  - `src/components/session-summary.tsx` — `SessionSummary` (`:41-220`)
    already calls `deriveWorkoutSummary(record)` once per render (`:46`) and
    renders the hero duration (`:73`) and avg/max stat cards (`:84-127`) from
    it. The chart slots between the hero block (`:63-79`) and the stat row
    (`:84`), replacing the comment at `:81-83`. Both `mode: 'review'` (Live
    Workout, a just-ended, not-yet-saved `WorkoutRecord`) and `mode: 'detail'`
    (History, an already-saved one loaded by `src/app/session/[id].tsx`)
    funnel through this one component, so one chart render here serves both
    "static, full session" surfaces the ticket names.
  - `src/app/live-workout.tsx` — the running/paused action rows
    (`:380-461`) sit directly below a `statsRow` (`:274-328`,
    elapsed/avg/max) that is gated on `session.phase !== 'ended'`. This
    ticket's live trace is inserted as a new sibling block between them,
    under the same gate, so it appears (as an all-gap trace, see Data Model)
    from `idle` through `paused`, and disappears once `SessionSummary` takes
    over at `ended` — matching `statsRow`'s own existing precedent of
    showing zeroed/placeholder values pre-start rather than being
    additionally phase-gated to `running`/`paused` only.
  - `src/app/(tabs)/history.tsx:20,67` and `src/app/session/[id].tsx:12,35` —
    both already load a full `WorkoutRecord` (`loadWorkoutSessions()` /
    `loadWorkoutSession(id)`), including every sample, not a lightweight
    summary shape. **Verified: there is no summary/full split to work around**
    — the "confirm the summary screen loads the full sample array" note in
    this ticket resolves to "it already does, for both entry points," no
    change needed.
  - `src/constants/theme.ts` — `ColorToken = keyof typeof colors` (`:256`)
    already includes `primaryDim` (`#8A7A20`) and `onSurfaceGhost`
    (`#4A5057`), the two colors this ticket's renderer needs; no new token.
  - `src/components/ui/pulse-ring.tsx` and `live-dot.tsx` — this repo's
    existing precedent for a small, standalone, presentation-only visual
    primitive (workout-specific, not a generic design-system atom like
    `themed-text`/`themed-view`) living under `src/components/ui/` rather
    than directly under `src/components/`. `HeartRateTrace` — bars from
    numbers, no derivation, no i18n, no composed layout — matches that
    precedent more closely than `session-summary.tsx`/`session-row.tsx`
    (both of which derive from a `WorkoutRecord` and own i18n copy), so it is
    placed alongside `pulse-ring.tsx`, not alongside `session-row.tsx`.
  - `DESIGN.md` already names this exact surface, token-complete, confirming
    rather than inventing this ticket's visual language:
    - Shapes (`:517-519`): "trace bars are 2px-radius columns with a 3px
      minimum height so an empty slot still reads as a slot."
    - Ink ramp table (`:378`): `on-surface-ghost` — "Chevrons, **empty trace
      bars** — decorative only." This is DESIGN.md's own named answer to
      this ticket's "decide the visual treatment for an empty bucket": a
      real, minimum-height bar in this one specific muted grey, not a
      literal absence and not a zero-height view.
    - Component tokens (`:266-274`): `trace-bar-peak` (`primary`),
      `trace-bar-mid` (`primary-dim`), `trace-bar-low` (`on-surface-ghost`,
      `2px` rounded) — three tokens reserved for the deferred zones ticket's
      per-bucket coloring.
    - "Trace chart" component prose (`:561-565`): "flex row of bars, each
      `flex: 1` with 1.5px horizontal margin, height a 0–1 fraction of the
      container with a 3px floor... Empty slots render at 0.03 height."
      **Its "color by threshold" clause is not followed by this ticket** —
      see the UI decision below.
  - `CLAUDE.md`'s React Compiler section: "Skip manual `useMemo`/`useCallback`
    the compiler handles." This directly bears on how "memoize the live
    bucketing" is implemented — see the Design decision below.
- **User impact:** Session Summary (both the post-workout review screen and
  any saved session opened from History) shows a bar trace of heart rate
  across the session, with any dropout or pause reading as a visible gap.
  Live Workout shows the same kind of trace for a recent rolling window,
  updating as new readings arrive. No other visible behavior changes.
- **Dependencies:** No new package — plain `View`s, no `react-native-svg`
  (already a dependency, unused here) and no charting library, per the
  ticket. Builds on `HeartRateSample`/`useWorkoutSession`
  (`live-workout-session-stats`, `live-workout-session-controls`),
  `WorkoutRecord`/`deriveWorkoutSummary` (`save-and-view-workout-sessions`,
  `session-summary`), and `SessionSummary` (`session-summary`).

### Design decision: the chart's time span is wall-clock, not the "active duration" figure — and the two are allowed to disagree

The ticket asks this to be decided and stated. `deriveWorkoutSummary`'s
`durationMs` subtracts paused overlap from `[startedAt, lastReadingAt]`
(Context, above) — it is **active** duration. But "a session containing a
pause shows a gap" (the ticket's own acceptance bar) is only achievable if
the paused interval actually occupies horizontal space in the chart; an axis
that already excludes paused time would have nothing left to show a gap in.
So `bucketHeartRateSamples`'s `range` for a saved session is necessarily
`{ start: record.startedAt, end: <last sample's timestamp> }` — the full
wall-clock span, pauses and all — which is **longer** than
`summary.durationMs` by exactly the summed pause length whenever pauses
exist. Since axis gridlines/labels are explicitly out of scope (Constraints),
this is never rendered as two conflicting numbers on screen; it matters only
as this spec's own internal, documented choice, made once here rather than
left ambiguous for whoever wires the two call sites.

### Design decision: live-mode memoization is a rounding trick, not a manual `useMemo`

The ticket asks for the live bucketing to be memoized "so it does not
recompute on every render." `CLAUDE.md` asks the opposite of the usual fix:
skip manual `useMemo`, because the React Compiler already memoizes a pure
expression against its actual inputs. The reason a naive read of "memoize
this" would still reach for `useMemo` here is that one input,
`Date.now()`, is different on every call by construction — no memoization,
manual or compiler-driven, changes that. The fix is upstream of
memoization: round `now` down to the current whole second (the same
granularity `ELAPSED_TICK_INTERVAL_MS` already re-renders this screen at)
_before_ it becomes an input to `bucketHeartRateSamples`, so the value is
stable across every render that lands within the same second. With a stable
input, the compiler's own memoization of the `bucketHeartRateSamples(...)`
call correctly skips recomputation on a render triggered by something else
entirely (e.g. a `status` flip) within that second, and correctly recomputes
the moment either `session.samples` changes (a real reading arrived) or the
rounded second advances (the rolling window itself slides forward) — both
still need to trigger a recompute, and both naturally do, since both are
real input changes. No `useMemo`/`useCallback` is written by this ticket.

### UI decision: uniform bar color reuses `trace-bar-mid`, not `trace-bar-peak`

DESIGN.md's "Trace chart" prose describes coloring bars by absolute bpm
threshold (`≥152 primary`, `≥130 primary-dim`, below that "a near-ground
grey") — but this ticket's own brief is explicit that **zones are out of
scope** ("Zones... needs a max-HR value that does not exist in the app
yet") and that every populated bar gets one uniform color, passed as a
single value. Rather than inventing a new token for "the one color a bar is
before zones exist," this spec reuses `trace-bar-mid`'s color
(`primary-dim`) for every populated bar: it is already the named "muted
yellow" tier (Context: `primary-dim`'s own DESIGN.md line calls it
"mid-intensity zones in a trace... not a tint of [primary]"), so an
undifferentiated trace reads as data-in-progress rather than either "every
reading is a threshold-4 peak" (`primary`, competing with the hero
duration's own `primary` for the screen's "one bright number," per
DESIGN.md's Rule 1) or a washed-out, easy-to-miss grey. Empty buckets are
`trace-bar-low`'s color (`on-surface-ghost`) unconditionally — DESIGN.md's
own named "empty trace bars" color (Context) — never parameterized, since
the future zones ticket only ever recolors _populated_ bars, not the
empty-slot treatment.

## Data Model

```ts
// src/workout/workout-record.ts — pure, framework-free, alongside
// deriveWorkoutSummary/deriveWeeklyTotals.

export type HeartRateSampleRange = { start: number; end: number };

/**
 * Buckets `samples` by time (never by array index — see the ticket's own
 * rationale: index-bucketing would render a dropout as continuous bars) into
 * `bucketCount` equal-width slices of `[range.start, range.end]`. Each
 * bucket's value is the arithmetic mean of every sample whose `timestamp`
 * falls inside it (chosen over max — see Interfaces/API), or `null` when no
 * sample falls inside it: a dropout, a pause, or a rolling-live window's
 * before-session-start slices all read as `null`, never `0` and never a
 * dropped/skipped array slot. `range.end` is inclusive of a sample landing
 * exactly on it (see Interfaces/API). Never throws: 0 samples, an
 * empty/inverted range, or `bucketCount <= 0` all degrade to an all-`null` /
 * empty array rather than `NaN` or a division by zero.
 */
export function bucketHeartRateSamples(
  samples: HeartRateSample[],
  range: HeartRateSampleRange,
  bucketCount: number,
): Array<number | null>;
```

No change to `HeartRateSample`, `WorkoutRecord`, `WorkoutSummary`, or any
existing export — this is a pure, additive function taking the exact shapes
that already exist. No schema version bump (`WORKOUT_RECORD_SCHEMA_VERSION`
unchanged): nothing new is ever stored.

```ts
// src/components/ui/heart-rate-trace.tsx

export const HR_TRACE_MIN_BPM = 40; // sensible resting floor
export const HR_TRACE_MAX_BPM = 200; // sensible high-effort ceiling; both
// fixed across every session so two sessions are visually comparable, per
// the ticket — not auto-scaled per render.

export type HeartRateTraceProps = {
  values: ReadonlyArray<number | null>; // one entry per bucket, chronological
  minBpm?: number; // default HR_TRACE_MIN_BPM
  maxBpm?: number; // default HR_TRACE_MAX_BPM
  barColor?: ColorToken; // default 'primaryDim' — see the UI decision above.
  // The one thing a future zones ticket changes: this single value becomes a
  // per-bucket color lookup at this one call site, not a restructuring of
  // the row/bar layout below.
  height?: number; // default 72
};

export function HeartRateTrace(props: HeartRateTraceProps): JSX.Element;
```

**Invariants:**

- `bucketHeartRateSamples` is a pure function of its three arguments alone —
  no `Date.now()`, no I/O, testable with hand-built sample arrays exactly
  like every other `workout-record.ts` export.
- `HeartRateTrace` never reads a `WorkoutRecord`, `useWorkoutSession`, or any
  hook beyond `useTheme()` — it takes an already-bucketed array, mirroring
  `PulseRing`'s own "takes primitives, no session-shape awareness" pattern.
- Every bucket in `values` renders exactly one bar, in order — `values.length`
  bars, always, including runs of consecutive `null`s (a bucket is never
  omitted from the rendered row for being empty, per the ticket's "not a
  skipped bucket").

## Interfaces / API

### `src/workout/workout-record.ts` (modified — additive)

```ts
export function bucketHeartRateSamples(
  samples: HeartRateSample[],
  range: HeartRateSampleRange,
  bucketCount: number,
): Array<number | null> {
  if (bucketCount <= 0) return [];
  const { start, end } = range;
  const span = end - start;
  if (span <= 0) return new Array(bucketCount).fill(null);

  const bucketWidth = span / bucketCount;
  const sums = new Array(bucketCount).fill(0);
  const counts = new Array(bucketCount).fill(0);

  for (const sample of samples) {
    if (sample.timestamp < start || sample.timestamp > end) continue; // outside range
    const index = Math.min(bucketCount - 1, Math.floor((sample.timestamp - start) / bucketWidth));
    sums[index] += sample.bpm;
    counts[index] += 1;
  }

  return sums.map((sum, i) => (counts[i] === 0 ? null : sum / counts[i]));
}
```

**Average, not max, per bucket.** The ticket asks this to be chosen and
justified: average is chosen because the chart's job is to show the
session's overall _trend_ shape, and the session's peak is already shown,
undiluted, by the existing MAX BPM stat card right below the chart
(`session-summary.tsx:106-126`) — a max-per-bucket trace would partly
duplicate that number bucket-by-bucket rather than complementing it, and
would make a single noisy 1Hz reading dominate its whole bucket's bar. Mean
smooths that noise into a readable trend, matching the "average smooths"
option the ticket itself names.

`Math.min(bucketCount - 1, ...)` handles the one boundary case explicitly:
a sample with `timestamp === range.end` computes to exactly `bucketCount`
before clamping, which without the clamp would index past the array.

No other export in this file changes.

### `src/components/ui/heart-rate-trace.tsx` (new)

```tsx
const MIN_BAR_HEIGHT = 3; // DESIGN.md Shapes: "3px minimum height so an
// empty slot still reads as a slot" — applied to every bar, populated or
// empty, so a real reading at the very bottom of [minBpm, maxBpm] doesn't
// itself vanish to 0px either.
const BAR_RADIUS = 2; // DESIGN.md: "2px-radius columns"
const BAR_MARGIN_HORIZONTAL = 1.5; // DESIGN.md: "1.5px horizontal margin"

export function HeartRateTrace({
  values,
  minBpm = HR_TRACE_MIN_BPM,
  maxBpm = HR_TRACE_MAX_BPM,
  barColor = 'primaryDim',
  height = 72,
}: HeartRateTraceProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.row, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {values.map((value, index) => {
        const isEmpty = value == null;
        const fraction = isEmpty
          ? 0
          : Math.max(0, Math.min(1, (value - minBpm) / (maxBpm - minBpm)));
        return (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: Math.max(MIN_BAR_HEIGHT, fraction * height),
                backgroundColor: isEmpty ? theme.colors.onSurfaceGhost : theme.colors[barColor],
                borderRadius: BAR_RADIUS,
              },
            ]}
          />
        );
      })}
    </View>
  );
}
```

`accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"`
— this chart is a redundant visual of data already exposed as accessible
text elsewhere on the same screen (the hero duration, the avg/max stat
cards); this is this repo's first explicit "hide a decorative visual from
the accessibility tree" instance, one step further than `PulseRing`'s
`pointerEvents="none"` (which stops touch, not screen-reader traversal) —
justified here because, unlike `PulseRing`, this view has dozens of
unlabeled child `View`s that would otherwise clutter a screen reader's
traversal with no useful content of their own.

`styles.row`: `flexDirection: 'row'`, `alignItems: 'flex-end'`.
`styles.bar`: `flex: 1`, `marginHorizontal: BAR_MARGIN_HORIZONTAL`.

### `src/components/session-summary.tsx` (modified — additive)

```tsx
const TRACE_BUCKET_COUNT = 48; // fixed bucket *count*, not bucket width, so
// the rendered bar density is the same for a 5-minute and a 90-minute
// session — bucket duration simply scales with the session's own length.

// inside SessionSummary, alongside the existing `summary` derivation:
const lastSampleAt = record.samples[record.samples.length - 1]?.timestamp ?? record.startedAt;
const traceValues = bucketHeartRateSamples(
  record.samples,
  { start: record.startedAt, end: lastSampleAt },
  TRACE_BUCKET_COUNT,
);
```

No `useMemo` — `record` is a stable prop reference for the life of both
call sites (Live Workout's `record` is set once via `useState`, Context;
History-detail's `record` is set once via `loadWorkoutSession`), so this
recomputes only when the record itself changes, with no manual memoization
needed (`CLAUDE.md`'s React Compiler note).

Replaces the comment at `:81-83` with:

```tsx
<HeartRateTrace values={traceValues} />
```

between the closing `</View>` of `heroBlock` (`:79`) and the opening
`<View style={styles.statRow}>` (`:84`) — no other line in this file
changes; `deriveWorkoutSummary`, the stat cards, and both modes' footers are
untouched.

### `src/app/live-workout.tsx` (modified — additive)

```ts
const LIVE_TRACE_WINDOW_MS = 3 * 60 * 1000; // 3-minute rolling window — long
// enough to read a recent trend, short enough that bars stay legibly wide
// on a phone screen at a fixed 36-bucket count; trivially retunable.
const LIVE_TRACE_BUCKET_COUNT = 36; // 5s per bucket at the window above.
```

```ts
// alongside the existing `session`/`sessionTimeOfDay` derivations, above the
// phase-conditional render:
const liveTraceNow = Math.floor(Date.now() / 1000) * 1000; // rounded to the
// current whole second — see the Design decision above for why this, not a
// raw Date.now(), is what makes the compiler's own memoization effective.
const liveTraceValues = bucketHeartRateSamples(
  session.samples,
  { start: liveTraceNow - LIVE_TRACE_WINDOW_MS, end: liveTraceNow },
  LIVE_TRACE_BUCKET_COUNT,
);
```

Before `session.startedAt` (i.e. `idle`, or any time in the first 3 minutes
of a session), the window's earlier slices simply have no matching samples
and render as gap bars — no clamping to `session.startedAt`, no special
case: this is the same "a session with very few samples doesn't crash or
render misleadingly" behavior the ticket's own Notes/verify section asks to
be confirmed, satisfied structurally rather than by a branch.

Rendered as a new sibling block, gated identically to the existing
`statsRow` (`session.phase !== 'ended'`), inserted between `statsRow`
(`:274-328`) and the phase-conditional action rows (`idle` starts at
`:337`):

```tsx
{
  session.phase !== 'ended' && (
    <View style={styles.traceContainer}>
      <HeartRateTrace values={liveTraceValues} />
    </View>
  );
}
```

Exact vertical placement/height (a plain wrapping `View`, no extra styling
beyond spacing) is an implementation-time visual judgment against the real
device build — no mock file exists in this repo to check pixel-for-pixel
against (grepped `assets/` and `docs/`); the acceptance bar is "a rolling
trace is visible and updates," not an exact pixel position. No other line
in this file changes: `statsRow`, the phase-conditional action rows, and the
`SessionSummary` render for `ended` are all untouched.

## Files Created

| File                                                    | Purpose                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/components/ui/heart-rate-trace.tsx`                | Presentational bar renderer: bucket values in, bars out. No SVG, no charting lib. |
| `src/components/ui/__tests__/heart-rate-trace.test.tsx` | Render tests: bucket count, empty-bucket styling, clamped/default range behavior. |

## Files Modified

| File                                                | Change                                                                                                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/workout/workout-record.ts`                     | Add `HeartRateSampleRange` and `bucketHeartRateSamples`, per Interfaces/API. No existing export changes.                                                                                                                                            |
| `src/workout/__tests__/workout-record.test.ts`      | Add `describe('bucketHeartRateSamples', ...)` cases per Acceptance Criteria.                                                                                                                                                                        |
| `src/components/session-summary.tsx`                | Replace the reserved-space comment (`:81-83`) with `<HeartRateTrace values={traceValues} />`; add `TRACE_BUCKET_COUNT` and the `traceValues` derivation. No other line changes.                                                                     |
| `src/components/__tests__/session-summary.test.tsx` | Add cases: both modes render the trace with a `TRACE_BUCKET_COUNT`-length bucket array derived from the given record; a 0-sample record renders it without crashing.                                                                                |
| `src/app/live-workout.tsx`                          | Add `LIVE_TRACE_WINDOW_MS`/`LIVE_TRACE_BUCKET_COUNT`, the `liveTraceNow`/`liveTraceValues` derivation, and the new gated trace block between `statsRow` and the action rows. No other line changes.                                                 |
| `src/app/__tests__/live-workout.test.tsx`           | Add cases per Acceptance Criteria: renders during running/paused with the fixed bucket count; updates when mocked `session.samples` gains a new reading; does not recompute the bucketing on an unrelated re-render within the same rounded second. |

## Implementation Steps

1. Add `HeartRateSampleRange`/`bucketHeartRateSamples` to
   `src/workout/workout-record.ts` and extend
   `src/workout/__tests__/workout-record.test.ts` — fully unit-testable in
   isolation, no dependency on any component.
2. Create `src/components/ui/heart-rate-trace.tsx` and its test, following
   `pulse-ring.tsx`'s file shape (named export, `StyleSheet.create` at the
   bottom, `useTheme()` for tokens) — testable against a hand-built
   `values` array, no dependency on `workout-record.ts` or any screen.
3. Modify `src/components/session-summary.tsx` per Interfaces/API and extend
   `src/components/__tests__/session-summary.test.tsx`.
4. Modify `src/app/live-workout.tsx` per Interfaces/API and extend
   `src/app/__tests__/live-workout.test.tsx`.
5. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
6. Manually verify on a dev-client build (`pnpm android`): start a workout,
   let real (or simulated-dropout) readings arrive for a few minutes,
   confirm the live trace fills in and scrolls its window forward; pause and
   resume, Stop, confirm the summary's trace shows the pause as a gap at the
   right position; open the same session from History and confirm it
   renders identically; open a session saved before this change (no code
   difference needed, but worth a spot check) and confirm it renders
   correctly with no migration.

## Style & Conventions

- **The bucketing function lives in `workout-record.ts`, not inside any
  component** — directly per the ticket's own instruction, and consistent
  with `deriveWorkoutSummary`/`deriveWeeklyTotals` already living there as
  the file's "pure derivations over a `WorkoutRecord`/`HeartRateSample[]`"
  layer.
- **`HeartRateTrace` never imports `workout-record.ts` or any hook beyond
  `useTheme()`** — it renders `values`, not a record or a session; the
  "renderer stays identical for both live and saved" property the ticket
  asks for falls out of this renderer never knowing which case produced its
  input.
- **No manual `useMemo`/`useCallback`** — per `CLAUDE.md`'s React Compiler
  section; see the Design decision above for how "memoize the live case" is
  achieved instead (rounding the time input, not wrapping the call).
- **Component file is kebab-case** (`heart-rate-trace.tsx`), component name
  is PascalCase (`HeartRateTrace`), placed under `src/components/ui/`
  alongside `pulse-ring.tsx`/`live-dot.tsx` — see Context for why this, not
  `src/components/`, matches this repo's existing primitive-vs-composed
  split.
- No new i18n key: the chart renders no text of any kind (no axis labels,
  no legend — both explicitly out of scope), so `CLAUDE.md`'s "every
  user-facing string renders via `t(...)`" rule has nothing to apply to
  here.
- New tests colocated under each module's own `__tests__/`, matching every
  existing precedent in this repo.

## Acceptance Criteria

- [ ] `bucketHeartRateSamples` with 0 samples returns an array of
      `bucketCount` `null`s, for any valid range.
- [ ] `bucketHeartRateSamples` with `range.end <= range.start` returns an
      array of `bucketCount` `null`s — never `NaN`/`Infinity`, never throws.
- [ ] `bucketHeartRateSamples` with `bucketCount <= 0` returns `[]`.
- [ ] A sample exactly at `range.end` is counted in the last bucket, not
      dropped and not out-of-bounds.
- [ ] A sample outside `[range.start, range.end]` is excluded from every
      bucket.
- [ ] Samples spread across several buckets produce, per bucket, the
      arithmetic mean of just that bucket's own samples (verified against a
      hand-built multi-bucket fixture).
- [ ] A fixture with a multi-minute gap in the middle of an otherwise
      populated sample set produces `null` for exactly the bucket(s)
      overlapping that gap, with populated buckets on both sides unaffected
      — the literal "dropout must show as a gap" case.
- [ ] `HeartRateTrace` renders exactly one bar per entry in `values`,
      including consecutive `null` entries (never fewer bars than
      `values.length`).
- [ ] A `null` entry renders at the fixed minimum height in the empty-bucket
      color (`onSurfaceGhost`); a numeric entry renders in `barColor`
      (default `primaryDim`) at a height between the minimum floor and the
      container height, scaled by its position between `minBpm`/`maxBpm`.
- [ ] A value at or above `maxBpm` renders at the container's full height,
      not beyond it; a value at or below `minBpm` renders at the minimum
      floor, not a negative or zero height.
- [ ] `SessionSummary` in both `mode: 'review'` and `mode: 'detail'` renders
      `HeartRateTrace` with a bucket array of length `TRACE_BUCKET_COUNT`,
      derived from the given record's own `samples`/`startedAt`.
- [ ] `SessionSummary` given a record with 0 samples renders the trace with
      no crash (an all-`null` bucket array).
- [ ] Live Workout renders the trace during `idle`, `running`, and `paused`
      (not `running`/`paused` only), with a bucket array of length
      `LIVE_TRACE_BUCKET_COUNT`; it is absent once `phase === 'ended'`.
- [ ] Live Workout's rendered trace values change when a mocked
      `useWorkoutSession`'s `samples` gains a new reading between renders.
- [ ] Spying on `bucketHeartRateSamples`, a Live Workout re-render triggered
      by something other than a new sample (e.g. a `status` change) within
      the same rounded second does not increase its call count; a re-render
      after the rounded second advances, or after a new sample arrives,
      does.
- [ ] Every existing `session-summary.test.tsx`/`live-workout.test.tsx`
      case (both modes' stat cards and footers, Discard/Save, the
      `beforeRemove` guard, phase-conditional action rows,
      `connectionLost`/`reconnecting` regressions) passes unmodified.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: this ticket only. No zones, per-bucket coloring, or
  time-in-zone bars (no max-HR value exists anywhere in the app — separate
  ticket, per the brief); no "rising" trend indicator; no MIN stat; no axis
  gridlines, labels, tooltips, scrubbing, zoom, or any touch interaction —
  the chart is display-only, `accessibilityElementsHidden`. No change to
  `HeartRateSample`, `WorkoutRecord`, `WorkoutSummary`, or
  `WORKOUT_RECORD_SCHEMA_VERSION` — the bucketing function reads the exact
  shape already stored, with no migration for records saved before this
  change.
- **The saved-session chart's time span (wall-clock, start to last reading)
  and the hero "active duration" figure shown elsewhere on the same screen
  intentionally diverge whenever the session had a pause** — see the Design
  decision above for why this is unavoidable given "a pause must show as a
  gap," and why it's never visible as a literal conflicting number since
  axis labels are out of scope.
- **`bucketHeartRateSamples` does a single linear pass over every sample it's
  given** — for the live rolling window, that means scanning the _entire_
  session's `samples` array every recompute, not just the samples inside the
  3-minute window, since the function has no way to know the array is
  chronologically sorted without documenting that as a second invariant it
  doesn't currently need. This mirrors `live-workout-session-stats`'s own
  already-accepted "no cap on `samples` array growth" constraint — cheap at
  this app's realistic single-session scale (at most a few thousand
  samples), not optimized further here.
- **No live device mock/screenshot exists in this repository to check the
  trace's exact vertical placement or height against** — `assets/` and
  `docs/` were grepped and hold no such file; placement is implementation-
  time judgment against a real build, not a pixel-exact spec.
- **`HR_TRACE_MIN_BPM` (40) / `HR_TRACE_MAX_BPM` (200), `LIVE_TRACE_WINDOW_MS`
  (3 minutes), `LIVE_TRACE_BUCKET_COUNT` (36), and `TRACE_BUCKET_COUNT` (48)
  are this spec's own defaults**, not values given by the ticket brief —
  trivially retunable single constants, matching this repo's existing
  precedent for this kind of picked-and-flagged default (e.g.
  `HR_STALE_THRESHOLD_MS`).
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
