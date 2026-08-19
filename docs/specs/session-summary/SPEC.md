# Feature: Session Summary

## Intent

A single `SessionSummary` component renders a workout's stats — date/start
time, active duration, average BPM, max BPM, device name, and total paused
time — from one shared `WorkoutRecord` shape, and serves two call sites: the
just-finished, not-yet-saved session on Live Workout (`mode="review"`, with
Save/Discard) and any already-saved session tapped from History
(`mode="detail"`, read-only), with room in the layout for the trace-graph
ticket to add a full-width chart later without restructuring.

## Context

- **Problem statement:** Today, Stop on Live Workout (`src/app/live-workout.tsx:369-417`)
  swaps the action row in place to a plain Discard/Save `Pressable` pair —
  the three existing `statCard`s (elapsed/avg/max, `:189-241`) stay visible
  above it, there is no date/device/paused-time display, and there is no
  screen at all for reviewing a session after it's saved. History rows
  (`SessionRow`, `src/components/session-row.tsx`) are explicitly
  non-interactive today — the component's own doc comment (`:7-20`) calls
  the trailing chevron "a static visual affordance for a future tap action
  ... until that ticket lands." This ticket is that ticket for the tap
  action, and replaces Live Workout's inline ended-phase row with a full
  summary layout.
- **Current code:**
  - `src/hooks/use-workout-session.ts` — `useWorkoutSession` is local to
    `live-workout.tsx` (`WorkoutSessionSnapshot`, `:27-39`), instantiated
    fresh on every mount (`live-workout.tsx:79`); its `samples`/`pauses`
    only ever grow while `phase === 'running'` and are frozen once
    `phase === 'ended'` (`stop()`, `:122-135`). There is no cross-screen
    store for this data — see Style & Conventions for why this ticket keeps
    it that way.
  - `src/workout/workout-record.ts` — `WorkoutRecord` (`:32-39`) is the
    single persisted shape (`schemaVersion`, `id`, `startedAt`, `samples`,
    `device`, `pauses`), deliberately storing no derived stat
    (`:24-30`'s comment). `deriveWorkoutSummary` (`:59-82`) computes
    `durationMs`/`averageBpm`/`maxBpm` from `samples`/`startedAt`/`pauses`
    alone, and already computes a local `pausedMs` (`:73-76`) that today is
    discarded rather than returned — exactly the "total paused time" this
    ticket's stats list asks for, one field away from existing.
  - `src/app/live-workout.tsx` — `save()` (`:133-151`) already builds the
    exact `WorkoutRecord` this ticket needs to display, just inline inside
    the `onPress` handler rather than available for rendering before the
    button is tapped. `discard()` (`:81`) and `save()` both end with
    `router.back()` — this screen is a top-level `Stack.Screen` sibling of
    `(tabs)` (`src/app/_layout.tsx:33-36`), not nested inside the tab
    navigator, so it never renders the floating tab bar.
  - `src/app/(tabs)/history.tsx` — already loads full `WorkoutRecord[]`
    (`loadWorkoutSessions()`, `:56`), including every sample, not a
    lightweight summary shape; `deriveWorkoutSummary(record)` is called
    per-row at render time (`:159`). Per the ticket's own "check how History
    reads sessions" note: **there is no summary/full split to preserve** —
    History already has the full record for every row in memory. This
    ticket's History-detail route still loads independently by `id` (see
    the routing decision below) rather than relying on that in-memory list,
    so the detail screen works from a deep link or after a process restart,
    not only when navigated to from a still-mounted History list.
  - `src/workout/workout-store.ts` — `saveWorkoutSession`/`loadWorkoutSessions`
    (`:67-98`) are the only exports; there is no single-record loader. Every
    record lives at its own `workout.session.<id>` key (`:16`), so adding
    one is a single `AsyncStorage.getItem`, no new storage layout.
  - `src/app/_layout.tsx` — the root `<Stack>` (`:33-36`) explicitly lists
    every screen with `headerShown: false`; an undeclared route would fall
    back to a default header, which this app's fully custom-chrome screens
    never use.
  - `DESIGN.md`'s type scale already anticipates this exact screen:
    `display-lg`'s own YAML comment is `# session duration on Summary`
    (`:51`) and its Hierarchy table entry is "Session duration (Summary)"
    (`:404`); `h3`'s table entry is "Summary title, stat values" (`:407`);
    `stat-md`'s is "History summary figures" (`:408`, used by History's
    7-day card, not this screen). The `readout-duration` component
    (`:248-251`) is `display-lg` in `primary` — the literal token for this
    screen's hero duration. `card-stat` (`:203-208`, prose `:547-550`) and
    `row-session`/`row-session-meta` (`:215-224`, prose `:541-546`) are
    both already in use elsewhere (Live Workout's stat row, History/Home's
    `SessionRow`) and are reused here rather than inventing new tokens.
  - No `Alert`, `beforeRemove` listener, or `BackHandler` usage exists
    anywhere in `src/` today (grepped) — the leave-confirmation behavior
    below is this ticket's first use of each.
- **User impact:** Stopping a workout now shows a full summary screen (date,
  active duration as the hero number, avg/max BPM, device, and paused time
  when applicable) with Save/Discard, instead of the three small stat cards
  plus an action row. Tapping any History row opens the identical layout,
  read-only, for that saved session. Leaving the review screen by back
  gesture or the hardware back button, with the session not yet saved,
  prompts to confirm discarding rather than silently losing it; backgrounding
  the app is not guarded (see the Design decision below).
- **Dependencies:** No new package. Builds on `useWorkoutSession`
  (`live-workout-session-controls`), `deriveWorkoutSummary`/`WorkoutRecord`
  (`save-and-view-workout-sessions`), and `SessionRow`
  (`save-and-view-workout-sessions`).

### Design decision: post-workout review is a render swap on the same route, not a new pushed screen

The ticket's "Stop ... now navigates to this summary" describes user-facing
behavior, not necessarily a `router.push`. The live, not-yet-saved session
(`WorkoutSessionSnapshot`) exists only as `useWorkoutSession`'s local state
inside `live-workout.tsx` (Context, above) — nothing else in this repo reads
it, and nothing persists it before Save. Passing it to a genuinely separate
route would mean either serializing potentially thousands of raw
`{ bpm, timestamp }` samples through Expo Router params, or introducing a
new cross-screen store for data that today deliberately does **not** outlive
this one screen (`live-workout-session-controls`'s own Style & Conventions:
"Session state lives in a hook, not a store... exactly the 'no persistence,
dropped entirely' behavior"). Either is the kind of cross-cutting structure
`CLAUDE.md` says not to invent for a single consumer. Instead, once
`session.phase === 'ended'`, `live-workout.tsx` renders
`<SessionSummary mode="review" record={record} .../>` in place of the
existing stat-row-plus-action-row block, on the same mounted screen — the
same pattern the `ended` phase already uses to swap its action row today
(`:369-417`), just swapping a larger region. `record` (a `WorkoutRecord`
built from the live snapshot) is computed once, in this same component, not
passed across a navigation boundary. See Interfaces/API for exactly what
changes in this file.

### Design decision: leaving the review screen before Save/Discard

The ticket asks this to be decided deliberately, not left implicit:

- **Back gesture / Android hardware back**, while `session.phase === 'ended'`
  and the session hasn't been explicitly saved or discarded yet: **intercepted
  and confirmed.** `live-workout.tsx` attaches a React Navigation
  `beforeRemove` listener (via `useNavigation()`, re-exported from
  `expo-router`) only while `phase === 'ended'`; on removal it calls
  `e.preventDefault()` and shows a native `Alert.alert` — "Discard this
  workout?" / Cancel / Discard — with Discard calling the existing `discard()`
  handler (which itself calls `router.back()`). A `decided` flag, set to
  `true` at the top of both `save()` and `discard()` before they navigate,
  lets the listener's own callback (`if (decided) return;`) allow those
  self-initiated navigations through without re-prompting — `beforeRemove`
  fires for _every_ removal, including ones the screen's own button handlers
  trigger, so without this guard Save/Discard would trigger their own
  confirmation dialog. This is the standard React Navigation pattern for
  "confirm before leaving a screen with unsaved state"; **re-verify this
  hook/event still exists under this name in Expo Router ~57's React
  Navigation version at implementation time**, per `AGENTS.md`.
- **Tab switch:** not directly reachable from this screen. `live-workout.tsx`
  is a top-level `Stack.Screen` sibling of `(tabs)` (`_layout.tsx:33-36`), so
  the floating tab bar is never rendered while it's on screen — there is no
  tab control to press. The scenario the ticket is really asking about (back
  gesture returns to Home, then the user switches tabs before deciding) is
  fully covered by the back-gesture guard above, since that guard is what
  stands between "ended, undecided" and leaving at all.
- **App backgrounded:** **accepted loss, not guarded.** Nothing about this
  session is durable until Save writes it (Context, above) — this is true
  today for every phase, not a new risk this ticket introduces. Guarding
  against backgrounding would mean either awaiting `saveWorkoutSession` on
  every backgrounding event (a new auto-save path with its own race
  conditions) or persisting a draft record (a new stored shape `CLAUDE.md`'s
  "no new stored fields" and this ticket's own scope explicitly rule out).
  Given this is a training project, the loss is accepted and left
  undocumented-in-code beyond this spec.

## Data Model

```ts
// src/workout/workout-record.ts (modified)

export type WorkoutSummary = {
  durationMs: number;
  averageBpm: number | null;
  maxBpm: number | null;
  pausedMs: number; // NEW — total overlap of `pauses` with [startedAt, lastReadingAt];
  // 0 when there were no pauses, and 0 (by the same zero-samples short-circuit
  // as the other three fields) when samples is empty — see Constraints for
  // the one edge case this leaves: a session paused before any sample ever
  // arrived reports pausedMs: 0, not the pause's real wall-clock length.
};
```

No other type in this ticket is new or changed: `WorkoutRecord`,
`WorkoutDevice`, `WorkoutPause`, `WorkoutSessionSnapshot` are all reused
exactly as they exist today. `SessionSummary`'s single `record` prop is a
plain `WorkoutRecord` in both modes — the "common shape" the ticket asks
for is simply the shape that already exists:

- **Review mode:** `live-workout.tsx` builds a `WorkoutRecord` from the live
  `WorkoutSessionSnapshot` plus the frozen `deviceId`/`device` — the exact
  same construction `save()` already does inline (`:139-146`), hoisted so it
  exists before Save is tapped, computed once (not on every render — see
  Interfaces/API) so its `id` (from `createWorkoutId`, which is not
  deterministic across calls) stays stable for the lifetime of the ended
  phase.
- **Detail mode:** the record returned by the new `loadWorkoutSession(id)`
  (below), unchanged.

**Invariant:** `SessionSummary` never receives anything _other_ than a
`WorkoutRecord` — it has no separate "live" prop shape. This is why its
internal derivation code (`deriveWorkoutSummary(record)`) and its rendering
are identical in both modes; only the header/footer controls branch on
`mode`. If a future change ever needs the live screen to show a stat this
record shape can't express, that is the signal the two modes have stopped
sharing a real common shape and should be flagged again, not silently
special-cased.

## Interfaces / API

### `src/workout/workout-record.ts` (modified)

```ts
export function deriveWorkoutSummary(record: WorkoutRecord): WorkoutSummary;
```

Both return branches gain `pausedMs`:

- `samples.length === 0` → `{ durationMs: 0, averageBpm: null, maxBpm: null, pausedMs: 0 }`.
- Otherwise → the existing `pausedMs` local (`:73-76`) is returned instead of
  discarded; `durationMs`/`averageBpm`/`maxBpm` are computed exactly as
  today, unchanged.

No other export in this file changes. `deriveWeeklyTotals` (`:108-126`)
keeps reading only `.durationMs`/`.averageBpm` off each summary — an added
field on a type it already destructures from is not a breaking change for it
or for `history.tsx`'s/`index.tsx`'s existing `deriveWorkoutSummary` call
sites, which likewise read only the two fields they already used.

### `src/workout/workout-store.ts` (modified — additive)

```ts
export async function loadWorkoutSession(id: string): Promise<WorkoutRecord | null>;
```

`AsyncStorage.getItem(sessionKey(id))` (the module's existing private
`sessionKey` helper, `:16`, already used by both existing exports) parsed
through the existing private `parseWorkoutRecord` (`:31-60`) — reused
as-is, no new validation logic. Resolves `null` when the key is missing,
holds invalid JSON, or fails validation; wrapped in the same `try`/`catch`
convention as `loadWorkoutSessions` (`:79-98`) so a thrown `AsyncStorage`
error also resolves `null` rather than rejecting. This is a single-record
read, independent of the session index — unlike `loadWorkoutSessions`, it
never touches `workout.sessionIndex`, so it works even for an id that (for
whatever hypothetical reason) isn't in the index.

### `src/components/session-summary.tsx` (new)

```ts
export type SessionSummaryProps =
  | { mode: 'review'; record: WorkoutRecord; onSave: () => void; onDiscard: () => void }
  | { mode: 'detail'; record: WorkoutRecord; onBack: () => void };

export function SessionSummary(props: SessionSummaryProps): JSX.Element;
```

Unlike `SessionRow` (which takes only caller-formatted strings), this
component takes the raw `record` and derives/formats internally — the
ticket's own "derive stats from a common shape" instruction is about the
component doing the deriving, not each caller pre-computing it twice. It
calls `deriveWorkoutSummary(record)` (imported from `@/workout/workout-record`)
and `useTranslation()`'s `i18n.language` itself (`SessionRow` already does
the latter for its "avg" suffix, `:37`/`:76` — this is the same pattern, one
layer further).

Private, colocated formatters (matching this repo's existing precedent of
each screen keeping its own copies rather than sharing a util — see Style &
Conventions):

```ts
function formatDuration(durationMs: number): string; // mm:ss — identical to history.tsx's/index.tsx's own copies
function formatDateTime(date: Date, locale: string): string; // e.g. "AUG 19 · 6:42 PM"
```

Layout, top to bottom, all via named `DESIGN.md` tokens (no hardcoded
color/spacing — re-confirm exact token/variant names against the live
`DESIGN.md` file at implementation time):

1. **Header row.** Detail mode only: a `‹` back-chevron `Pressable`
   (`titleMd`/`onSurfaceDim`, matching `SessionRow`'s own plain-glyph
   chevron convention rather than an SVG icon) calling `onBack`. Review
   mode renders nothing here — leaving is handled by the back-gesture guard
   in `live-workout.tsx`, not a button on this screen.
2. **Date/time line** — `formatDateTime(new Date(record.startedAt), locale)`,
   `titleSm`/`onSurface`.
3. **Hero duration** — `readout-duration`'s token (`display-lg`, `primary`,
   centered): `formatDuration(summary.durationMs)`. This is `display-lg`'s
   named purpose per `DESIGN.md` (Context, above).
4. **Reserved chart space** — an empty `View` with a fixed `minHeight`
   (an implementation detail for this ticket; any reasonable placeholder —
   e.g. enough to read as "a chart goes here," not a sliver — satisfies
   "leave room," since the trace-graph ticket replaces this block, not
   resizes around it). No chart, no placeholder chart chrome, no `<Svg>` —
   truly empty space.
5. **Stat grid** — `card-stat` tokens (`label-micro` caption over `h3`
   value, `surface`/`outline`/`md` radius, 14px padding), rows of two with a
   10px gap, per `DESIGN.md`'s own "Cards live in rows of two or three with
   a 10px gap":
   - Row 1: Avg BPM (`summary.averageBpm == null ? '--' : String(Math.round(summary.averageBpm))`),
     Max BPM (`summary.maxBpm ?? '--'`) — identical placeholder convention to
     Live Workout's existing stat row.
   - Row 2: Device (`record.device.name ?? <fallback>` — reuse whichever
     existing "Unknown device" fallback string this app already uses
     elsewhere, e.g. `pairing.deviceRow.unknownDevice`, rather than
     inventing a second one; **verify against `live-workout.tsx:118-120`'s
     own fallback chain at implementation time**), and — only when
     `record.pauses.length > 0` — Paused Time
     (`formatDuration(summary.pausedMs)`). When there are no pauses, Device
     is the only card in row 2 (`flex: 1`, no partner) — an accepted
     one-card row, not a layout bug.
6. **Footer, mode-conditional:**
   - `mode: 'review'` — the existing ghost/primary Discard/Save `Pressable`
     pair, moved here verbatim from `live-workout.tsx`'s current
     `ended`-phase block (`:369-411`), same `testID`s
     (`live-workout-discard`/`live-workout-save`) so this is a relocation,
     not a rewrite. `canSave` is derived internally as
     `record.samples.length > 0` (no separate prop needed — `record` already
     carries this) and gates Save's `disabled`/`accessibilityState` exactly
     as today; the disabled hint (`sessionSummary.saveDisabledHint`) renders
     below it under the same condition (`:413-417`).
   - `mode: 'detail'` — no footer.

This component defines its own `card-stat` markup rather than extracting
`live-workout.tsx`'s existing inline `statCard`/`statsRow` styles
(`:189-241`, `:457-468`) into a shared primitive — see Style & Conventions.

### `src/app/live-workout.tsx` (modified — additive except the `ended`-phase block)

```ts
const [decided, setDecided] = useState(false);
const navigation = useNavigation();

const discard = () => {
  setDecided(true);
  router.back();
};

const record: WorkoutRecord | null =
  session.phase === 'ended' && session.startedAt != null
    ? recordRef.current // see below — computed once, not on every render
    : null;

const save = () => {
  if (record == null) return;
  setDecided(true);
  void saveWorkoutSession(record);
  router.back();
};

useEffect(() => {
  if (session.phase !== 'ended') return undefined;
  const unsubscribe = navigation.addListener('beforeRemove', (e) => {
    if (decided) return;
    e.preventDefault();
    Alert.alert(t('sessionSummary.leaveConfirm.title'), t('sessionSummary.leaveConfirm.message'), [
      { text: t('sessionSummary.leaveConfirm.cancel'), style: 'cancel' },
      { text: t('sessionSummary.leaveConfirm.discard'), style: 'destructive', onPress: discard },
    ]);
  });
  return unsubscribe;
}, [navigation, session.phase, decided]);
```

`record` must be computed exactly once per ended session, not freshly on
every render — `createWorkoutId` is not idempotent (`Math.random()`-suffixed,
per `workout-record.ts:89-91`), so recomputing it on every render would give
the record a different `id` each time, breaking the "one stable id, used
consistently by both display and Save" invariant. The exact mechanism
(`useState` set once inside an effect keyed on the `'ended'` transition, a
`useRef` populated lazily, or equivalent) is an implementation detail; the
requirement is "compute once when `phase` first becomes `'ended'`, never
again for that session."

Render: the existing `statsRow` (elapsed/avg/max, `:189-241`) and the
`ended`-phase action row + disabled hint (`:369-417`) are removed; in their
place, `session.phase === 'ended' && record != null` renders
`<SessionSummary mode="review" record={record} onSave={save} onDiscard={discard} />`.
**Revised from this ticket's original wording**: the title row, status
line, and BPM readout (`:204-231`) are now also gated on
`session.phase !== 'ended'`, alongside `statsRow` — verified against a
real device build, leaving them visible above the summary read as the
still-running Live Workout screen bleeding through behind a
backgroundless panel, not a screen transition to a summary. `idle`/
`running`/`paused` keep this chrome and their existing action rows
exactly as before; only the `ended` phase now shows `SessionSummary` as
the sole content below `Glow`.

### `src/app/session/[id].tsx` (new)

```ts
export default function SessionDetail(): JSX.Element;
```

Reads `id` via `useLocalSearchParams<{ id: string }>()`. Loads the record
once via `loadWorkoutSession(id)` in an effect keyed on `id` (same
`cancelled`-flag pattern `history.tsx`/`index.tsx` already use for their own
loads, `:53-62`/`:60-69`), into a three-state
`WorkoutRecord | null | undefined` (`undefined` = loading, `null` = not
found or failed to load, `WorkoutRecord` = loaded). `undefined` renders
nothing further (matching `history.tsx`'s own "no spinner convention"
precedent); `null` renders a small themed not-found message with a `‹` back
control; otherwise renders `<SessionSummary mode="detail" record={record} onBack={() => router.back()} />`.
This route loads independently of whatever list navigated to it — a deep
link or a cold start with only an `id` works identically (Context, above).

### `src/components/session-row.tsx` (modified — additive)

```ts
export type SessionRowProps = {
  monthLabel: string;
  dayLabel: string;
  timeLabel: string;
  durationLabel: string;
  averageBpmLabel: string;
  onPress?: () => void; // NEW — omitted keeps this row exactly as it renders today
};
```

The existing `View` root becomes a `Pressable` with `disabled={onPress == null}`
and `accessibilityRole={onPress ? 'button' : undefined}` — a disabled
`Pressable` never enters its `pressed` state or handles touches, so with
`onPress` omitted this renders and behaves identically to today's plain
`View` (the existing "stays non-interactive" test, `session-row.test.tsx:54-67`,
passes unmodified). When `onPress` is provided, the pressed-state style
`SessionRow`'s own doc comment (`:16-20`) already specifies is applied:
background steps to `surfaceRaised`, border to `primaryWash` — the exact
tokens that comment names, not new ones. This finally completes what that
comment flagged as deferred; every other part of the row (date column,
divider, meta line, chevron) is unchanged.

### `src/app/(tabs)/history.tsx` (modified — additive)

```ts
const router = useRouter(); // new import from expo-router
```

Each `<SessionRow .../>` in `renderItem` gains
`onPress={() => router.push({ pathname: '/session/[id]', params: { id: record.id } })}`.
No other line in this file changes — the load-on-focus effect, weekly stats
card, and empty state are untouched. `index.tsx`'s "recent" list (`:186-196`)
is **not** modified — it keeps calling `SessionRow` with no `onPress`, per
the ticket's "History rows become tappable" (Home's recent list is out of
scope; see Constraints).

### `src/app/_layout.tsx` (modified — additive)

```tsx
<Stack>
  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  <Stack.Screen name="live-workout" options={{ headerShown: false }} />
  <Stack.Screen name="session/[id]" options={{ headerShown: false }} />
</Stack>
```

One new line; the existing two are unchanged.

### `src/i18n/locales/en.json` (modified)

```json
{
  "liveWorkout": {
    // "save" and "saveDisabledHint" removed — see below; "discard" is kept,
    // still used by the guard branch and the idle-phase action row
  },
  "sessionSummary": {
    "stats": {
      "activeDuration": "ACTIVE DURATION",
      "avgBpm": "AVG BPM",
      "maxBpm": "MAX BPM",
      "device": "DEVICE",
      "pausedTime": "PAUSED TIME"
    },
    "save": "SAVE",
    "discard": "DISCARD",
    "saveDisabledHint": "Wait for a reading before saving",
    "leaveConfirm": {
      "title": "Discard this workout?",
      "message": "This session hasn't been saved yet. Going back will discard it.",
      "cancel": "CANCEL",
      "discard": "DISCARD"
    },
    "notFound": "Session not found."
  }
}
```

`liveWorkout.save` and `liveWorkout.saveDisabledHint` are removed: once the
`ended`-phase block moves into `SessionSummary` (which uses its own
`sessionSummary.save`/`sessionSummary.saveDisabledHint`), nothing in the
codebase references the old keys — grepped to confirm before deletion.
`liveWorkout.discard` is **not** removed (still used by the guard branch,
`:110`, and the `idle`-phase action row, `:260`). Every other existing key
is unchanged. `sessionSummary.discard`/`.save` intentionally duplicate
`liveWorkout.discard`'s/the removed `liveWorkout.save`'s text — this repo's
existing convention is per-namespace copy ownership even when two strings
read identically (e.g. `history.stats.avgHrLabel` "AVG HR" vs.
`liveWorkout.stats.avgBpm` "AVG BPM" already coexist), not a shared literal.

## Files Created

| File                                                | Purpose                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/components/session-summary.tsx`                | Shared stats display, parameterized by `mode: 'review' \| 'detail'`, per Interfaces/API.          |
| `src/components/__tests__/session-summary.test.tsx` | Render tests for both modes.                                                                      |
| `src/app/session/[id].tsx`                          | History-detail route: loads one saved record by `id` and renders `SessionSummary` in detail mode. |
| `src/app/session/__tests__/[id].test.tsx`           | Render tests for the route above (loading/not-found/loaded states, back navigation).              |

## Files Modified

| File                                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/workout/workout-record.ts`                 | `WorkoutSummary` gains `pausedMs`; both `deriveWorkoutSummary` return branches populate it. No other export changes.                                                                                                                                                                                                                                                                                                                                                                   |
| `src/workout/__tests__/workout-record.test.ts`  | Every existing `deriveWorkoutSummary` assertion gains the expected `pausedMs`. Add a case for a record with pauses but zero samples returning `pausedMs: 0` (the edge case in Constraints).                                                                                                                                                                                                                                                                                            |
| `src/workout/workout-store.ts`                  | Add `loadWorkoutSession(id)`, per Interfaces/API. `saveWorkoutSession`/`loadWorkoutSessions` unchanged.                                                                                                                                                                                                                                                                                                                                                                                |
| `src/workout/__tests__/workout-store.test.ts`   | Add cases: returns a saved record by id; returns `null` for an unknown id, corrupt JSON, and a rejected `AsyncStorage.getItem`.                                                                                                                                                                                                                                                                                                                                                        |
| `src/components/session-row.tsx`                | Add optional `onPress`; root `View` becomes a `Pressable`, disabled (behaviorally inert) when `onPress` is omitted. Pressed-state styling per the component's own pre-existing doc comment.                                                                                                                                                                                                                                                                                            |
| `src/components/__tests__/session-row.test.tsx` | Existing "stays non-tappable" case passes unmodified (no `onPress` passed). Add: with `onPress` passed, the row has `accessibilityRole="button"` and pressing it calls `onPress` once.                                                                                                                                                                                                                                                                                                 |
| `src/app/live-workout.tsx`                      | Remove the `statsRow` and `ended`-phase action row/hint; add the hoisted `record` computation, the `beforeRemove` guard, and render `<SessionSummary mode="review" .../>` when ended. Every other phase's render is untouched.                                                                                                                                                                                                                                                         |
| `src/app/__tests__/live-workout.test.tsx`       | Replace the `ended`-phase/Save assertions (now rendered inside `SessionSummary`, not inline) with equivalents against the same `testID`s/text. Add: back gesture while ended-and-undecided triggers the confirm `Alert`, whose Discard option calls `router.back()`; Save/Discard themselves do not trigger it. Every other existing case (guard branch, phase-conditional action row for idle/running/paused, reconnect/disconnect regressions, `__DEV__` trigger) passes unmodified. |
| `src/app/(tabs)/history.tsx`                    | Add `useRouter`; each `SessionRow` gains `onPress` navigating to `/session/[id]`. No other line changes.                                                                                                                                                                                                                                                                                                                                                                               |
| `src/app/(tabs)/__tests__/history.test.tsx`     | Mock `useRouter` (new, alongside the existing `useIsFocused` mock). Add: pressing a row calls `router.push` with that row's record `id`.                                                                                                                                                                                                                                                                                                                                               |
| `src/app/_layout.tsx`                           | Add `<Stack.Screen name="session/[id]" options={{ headerShown: false }} />`. Existing two screens unchanged.                                                                                                                                                                                                                                                                                                                                                                           |
| `src/i18n/locales/en.json`                      | Add the `sessionSummary` namespace; remove `liveWorkout.save`/`liveWorkout.saveDisabledHint` (dead after this change). `liveWorkout.discard` and every other key unchanged.                                                                                                                                                                                                                                                                                                            |

## Implementation Steps

1. Add `pausedMs` to `WorkoutSummary`/`deriveWorkoutSummary` in
   `src/workout/workout-record.ts` and extend
   `src/workout/__tests__/workout-record.test.ts` — fully testable in
   isolation, no dependency on anything else in this ticket.
2. Add `loadWorkoutSession(id)` to `src/workout/workout-store.ts` and extend
   `src/workout/__tests__/workout-store.test.ts`.
3. Add the `sessionSummary` namespace and remove the two dead `liveWorkout`
   keys in `src/i18n/locales/en.json` (grep the repo first to confirm
   `liveWorkout.save`/`saveDisabledHint` have no other reference before
   deleting).
4. Create `src/components/session-summary.tsx` and its test, per
   Interfaces/API — testable against hand-built `WorkoutRecord` fixtures in
   both modes, no dependency on Live Workout or History.
5. Modify `src/components/session-row.tsx` (optional `onPress`) and extend
   its test.
6. Modify `src/app/(tabs)/history.tsx` (wire `onPress` per row) and extend
   `src/app/(tabs)/__tests__/history.test.tsx`.
7. Create `src/app/session/[id].tsx` and its test.
8. Add the new `Stack.Screen` entry to `src/app/_layout.tsx`.
9. Modify `src/app/live-workout.tsx` (hoisted `record`, `beforeRemove` guard,
   render `SessionSummary` when ended) and update
   `src/app/__tests__/live-workout.test.tsx` per Files Modified.
10. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
11. Manually verify on a dev-client build (`pnpm android`): run a short
    workout with a pause, Stop, confirm the summary shows correct active
    duration/avg/max/paused time, Save, confirm it opens identically from
    History; start a second workout and Stop, then press the Android back
    button and confirm the discard-confirmation dialog appears and Cancel
    keeps the summary on screen.

## Style & Conventions

- **`SessionSummary` derives from `record` internally rather than taking
  pre-formatted props**, unlike `SessionRow`. This is a deliberate departure
  from that precedent, directly required by the ticket's "derive stats from
  a common shape so the same code path serves both" — the shared code path
  _is_ the derivation, not just the JSX.
- **No shared `StatCard`/formatter util is extracted.** `session-summary.tsx`
  defines its own `card-stat`-token markup and its own private
  `formatDuration`/`formatDateTime`, rather than reusing/extracting
  `live-workout.tsx`'s inline `statCard` styles or `history.tsx`'s/
  `index.tsx`'s private `formatDuration`/`formatMonth`/`formatTime`. This
  matches this repo's own established precedent — `history.tsx` and
  `index.tsx` already each keep byte-for-byte identical private copies of
  the same three formatters rather than sharing one, and
  `deriveWorkoutSummary` itself "deliberately re-implements, rather than
  imports, `useWorkoutSession`'s average/max math" per its own doc comment
  — and avoids touching `live-workout.tsx`'s untouched running/paused
  render per `CLAUDE.md`'s "additive diffs on working screens."
- **`beforeRemove` + `Alert.alert` is this ticket's own new pattern** (no
  existing precedent in this repo) — used narrowly, only while
  `phase === 'ended'` and only until Save/Discard is pressed, not as a
  general-purpose navigation guard elsewhere.
- Component file is kebab-case (`session-summary.tsx`), component name is
  PascalCase (`SessionSummary`), per `CLAUDE.md`. `src/app/session/[id].tsx`
  follows Expo Router's dynamic-segment file convention.
- Every new user-facing string renders via `t('sessionSummary.…')`; the
  `'--'` placeholder for a null average/max continues the existing
  un-translated-primitive convention (`bpm ?? '--'`, already established).
- New tests colocated under each module's own `__tests__/`, matching every
  existing precedent in this repo.

## Acceptance Criteria

- [ ] `deriveWorkoutSummary` on a record with 0 samples returns
      `{ durationMs: 0, averageBpm: null, maxBpm: null, pausedMs: 0 }`.
- [ ] `deriveWorkoutSummary` on a record with pauses but 0 samples still
      returns `pausedMs: 0` (not `NaN`, not the pause's real length).
- [ ] `deriveWorkoutSummary` on a multi-sample record with one or more
      pauses returns the correct `pausedMs` (sum of each pause's overlap
      with `[startedAt, lastReadingAt]`), in addition to the pre-existing
      correct `durationMs`/`averageBpm`/`maxBpm`.
- [ ] `loadWorkoutSession(id)` returns the matching saved record; returns
      `null` for an unknown id, corrupt JSON at that key, or a rejected
      `AsyncStorage.getItem` — never throws.
- [ ] Stopping a workout (Stop on Live Workout) renders `SessionSummary` in
      review mode showing the correct date/start time, active duration,
      average BPM, and max BPM for the just-ended session.
- [ ] A session that included one or more pauses shows a "paused time" stat
      equal to the summed pause overlap; a session with no pauses shows no
      such stat.
- [ ] A session with exactly one sample renders `0:00` duration and that
      sample's BPM as both average and max — no `NaN`, no blank value.
- [ ] A session with zero samples (immediate Stop) renders `--` for average
      and max, `0:00` duration, Save disabled with the hint visible, and
      tapping the disabled Save is a no-op.
- [ ] Save in review mode calls `saveWorkoutSession` with the displayed
      record and navigates back; the session is then visible in History.
- [ ] Discard in review mode calls neither `saveWorkoutSession` nor any
      other persistence call, and navigates back; the session is not in
      History afterward.
- [ ] With the review screen showing an ended, undecided session, triggering
      the back action (simulated `beforeRemove` event) shows a confirm
      dialog; confirming Discard navigates back and does not call
      `saveWorkoutSession`; Cancel leaves the screen showing, unchanged.
- [ ] Tapping Save or Discard directly does **not** trigger the confirm
      dialog (the `decided` guard suppresses it).
- [ ] Tapping a row in History navigates to `/session/[id]` with that row's
      record id, and the detail screen renders identical stats to what that
      session's data would produce in review mode (same shared
      `SessionSummary`/`deriveWorkoutSummary` code path).
- [ ] History detail mode renders no Save/Discard control; its back control
      returns to the History list.
- [ ] A `WorkoutRecord` with no new/changed field (i.e. saved before this
      change, since `WorkoutRecord`'s own shape is unmodified) opens
      correctly in detail view.
- [ ] `SessionRow` with no `onPress` renders and behaves exactly as before
      (no `button` accessibility role, existing non-tappable test passes
      unmodified); with `onPress`, it exposes a `button` role and pressing
      it calls `onPress` once.
- [ ] Home's "recent" list (`index.tsx`) is unchanged — its `SessionRow`s
      remain non-interactive.
- [ ] No new string is inline in JSX — all new copy renders via `t(...)`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: this ticket only. No trace graph (space is reserved, not
  built — see Interfaces/API's "reserved chart space"), no zones/time-in-
  zone/%-of-max (no max-HR value exists anywhere in the app), no workout
  names/titles (no such field exists on `WorkoutRecord`), no delete/edit of
  any session, no sharing/export. Home's "recent" `SessionRow` list stays
  non-interactive — only History rows become tappable, per the ticket.
- **A session paused before any sample ever arrived reports `pausedTime` as
  `0:00`, not the pause's actual length.** `deriveWorkoutSummary`'s
  zero-samples branch has no `lastReadingAt` to bound a pause overlap
  against, so `pausedMs` is `0` there by construction, matching how
  `durationMs`/`averageBpm`/`maxBpm` already fall back on that same branch.
  Accepted as an extreme, unlikely-to-occur edge case (degrades to a
  plausible-looking `0:00`, never `NaN` or a crash) rather than
  introducing a fallback duration source (e.g. a save-time `Date.now()`)
  this ticket's read-only, replay-safe derivation model deliberately avoids.
- **A long unpaused signal dropout is still counted as active time.**
  `deriveWorkoutSummary`'s duration math has no gap-detection — it only
  ever excludes time inside a user-invoked `pauses` interval, not an
  automatic BLE dropout. This is pre-existing behavior (`ble-connection-loss-detection`/
  `auto-reconnect-after-drop` are unrelated tickets), not something this
  spec changes; average/max are unaffected either way since they're
  computed only over samples that actually arrived.
- **App backgrounding during an undecided review screen is not guarded** —
  see the Design decision above for why.
- **History-detail's `loadWorkoutSession` re-reads storage independently of
  whatever list navigated to it**, rather than reusing an already-in-memory
  record — one extra `AsyncStorage.getItem` per detail view, accepted for
  correctness on deep link / cold start (see Context).
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
