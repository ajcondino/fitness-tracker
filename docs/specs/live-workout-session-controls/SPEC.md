# Feature: Session Timer with Start / Pause / Resume / Stop Controls

## Intent

Live Workout no longer records from the moment the screen opens: an explicit
**Start** begins accumulating samples, **Pause**/**Resume** toggle recording
without dropping the BLE subscription, and **Stop** ends the session into the
existing Save/Discard choice — with elapsed time, average BPM, and max BPM
all reflecting only the time and readings the session was actually running,
and a saved session's `pauses` populated so its stored shape can fully
reconstruct what happened.

## Context

- **Problem statement:** `useWorkoutSession` (`src/hooks/use-workout-session.ts:44`)
  captures `startedAt` via `useState(() => Date.now())` — a session begins
  recording the instant Live Workout mounts, with no user action and no way
  to pause. `elapsedMs` (`:64`) is plain wall-clock (`Date.now() - startedAt`),
  and the sample-ingestion effect (`:49-54`) appends every fresh reading
  unconditionally — there is no notion of "recording paused." Every sample
  that ever arrives is both persisted (`live-workout.tsx:124`,
  `session.samples`) and counted into `averageBpm`/`maxBpm`. `WorkoutRecord.pauses`
  (`src/workout/workout-record.ts:37-44`) already exists as a typed field, but
  `live-workout.tsx:126` hardcodes `pauses: []` on every save — nothing in the
  repo ever writes an entry into it, confirmed by `save-and-view-workout-sessions`'s
  own spec ("Nothing in this ticket ever writes an entry — `pauses` is always
  `[]`... Reserved purely so pause/resume... has a field to write into"). This
  ticket is that reserved-for follow-up.
- **Current code:**
  - `src/hooks/use-workout-session.ts` — the entire session state machine
    lives here, not in a store (deliberate, per that ticket's own Style &
    Conventions: "Session state lives in a hook... component/hook-local state
    disappearing on unmount is exactly the... behavior the ticket asks for").
    This ticket keeps that placement — phase, pause bookkeeping, and the new
    action callbacks (`start`/`pause`/`resume`/`stop`) all live inside this
    same hook, not a new store.
  - `src/hooks/use-live-heart-rate.ts` — untouched by this ticket. It has no
    notion of session phase and never will: its `bpm`/`status`/`lastReadingAt`
    are derived purely from BLE notification timing (`ble-connection-loss-detection`'s
    staleness threshold), independent of anything this ticket adds. This is
    exactly what lets the BLE subscription "stay alive while paused" with zero
    code change to this file — pausing is entirely a `useWorkoutSession`-side
    concept; `useLiveHeartRate` keeps emitting `bpm`/`lastReadingAt` updates
    the whole time, per the ticket's own "showing live BPM while paused is
    useful."
  - `src/app/live-workout.tsx` — `session = useWorkoutSession(bpm, lastReadingAt)`
    (`:71`) is called unconditionally above the guard branch, exactly as
    today; this ticket does not change that call site's arguments, only what
    the returned snapshot contains and how the action row (`:225-271`)
    branches on it. The guard branch (`deviceId === null`, `:75-105`) never
    calls any of the new `start`/`pause`/`resume`/`stop` callbacks — it
    returns before the connected-branch render, so a session on that branch
    stays inertly `'idle'` for the life of the render, mirroring how it
    already calls `useWorkoutSession(null, null)` inertly today.
  - `src/workout/workout-record.ts` — `WorkoutPause = { startedAt: number;
endedAt: number }` (`:27`) and `deriveWorkoutSummary` (`:58-69`) already
    exist. `deriveWorkoutSummary`'s `durationMs` is currently `samples[last].timestamp
- startedAt`— plain wall-clock between the first and last real reading, with
  no subtraction for any paused span in between. Every record saved today
  has`pauses: []`, so this formula has never yet been asked to account for
  one.
  - `src/workout/workout-store.ts`'s `parseWorkoutRecord` (`:31-60`) already
    validates `pauses` as `Array.isArray(pauses)` only (no per-entry shape
    check, matching `samples`' own validation depth) — an old record's
    `pauses: []` and a new record's populated `pauses` both pass this check
    unchanged. **No change needed to this file.**
  - `src/app/(tabs)/history.tsx` and `src/components/session-row.tsx` call
    `deriveWorkoutSummary(record)` (`history.tsx:68`) and render its
    `durationMs`/`averageBpm` — neither file reads `record.pauses` directly.
    Once `deriveWorkoutSummary` accounts for pauses, History's duration
    column reflects active time **with no change to either file** — the same
    "derived once, at read time" precedent `save-and-view-workout-sessions`
    established is what makes this ticket's persistence-side change reach
    History for free.
  - `src/app/_layout.tsx:33-36` — `live-workout` is a top-level `<Stack.Screen>`
    sibling of `(tabs)`, not nested inside it. The floating tab bar
    (`TabBar`, per `live-workout-screen`'s spec) is owned by `(tabs)`'s own
    layout and is not rendered while Live Workout is on screen — there is no
    tab bar to "switch away to" from this screen. The only ways to leave are
    the screen's own Discard/Save controls and the platform back
    gesture/hardware back button, which pop this `<Stack.Screen>` and unmount
    it exactly as Discard already does.
  - `DESIGN.md` (`:523-533`) documents exactly two button shapes this app
    uses — `button-primary` (`primary` fill, `xl` radius, 60px) and
    `button-ghost` (transparent fill, `outline-emphasis` border, `lg` radius,
    56px) — with an explicit rule: "The secondary action in any pair; never
    two primaries side by side." `Discard`/`Save` (`live-workout.tsx:226-264`)
    already instantiate this exact ghost+primary pair. `DESIGN.md` has no
    token for a 4-state Start/Pause/Resume/Stop control — this ticket
    composes one from the two existing button shapes only (see UI decision
    below), adding no new token, icon, or shared component, per `CLAUDE.md`'s
    "shared components... are decided by hand."
- **User impact:** Opening Live Workout with a monitor connected shows live
  BPM immediately but records nothing until the user taps Start. While
  running, Pause freezes the elapsed clock and stops new readings from
  counting toward average/max (the live BPM number keeps updating); Resume
  picks the clock back up exactly where it left off. Stop ends the session
  into the same Save/Discard choice that exists today. A saved session's
  duration in History now reflects only the time the user was actually
  moving, not time spent paused.
- **Dependencies:** No new package, no new store, no new shared component or
  icon. Builds entirely on `useWorkoutSession` (`live-workout-session-stats`),
  `WorkoutRecord`/`deriveWorkoutSummary` (`save-and-view-workout-sessions`),
  and the existing `button-primary`/`button-ghost` tokens.

### UI decision: compose Start/Pause/Resume/Stop from the existing ghost + primary pair, one state at a time

The ticket asks for four controls but also that "only the controls valid for
the current state should be shown." Rather than mount all four and toggle
`disabled` (which would need two new `disabled` visual treatments beyond what
`Discard`/`Save` already use, and would show controls DESIGN.md's own
"never two primaries side by side" rule doesn't have an opinion on with more
than two visible at once), this ticket keeps the **existing two-button action
row** and swaps its contents by phase — the same shape Discard/Save already
have, never more than one ghost + one primary at a time:

| Phase     | Ghost (secondary)                    | Primary                            |
| --------- | ------------------------------------ | ---------------------------------- |
| `idle`    | Discard (`t('liveWorkout.discard')`) | Start (`t('liveWorkout.start')`)   |
| `running` | Pause (`t('liveWorkout.pause')`)     | Stop (`t('liveWorkout.stop')`)     |
| `paused`  | Stop (`t('liveWorkout.stop')`)       | Resume (`t('liveWorkout.resume')`) |
| `ended`   | Discard (`t('liveWorkout.discard')`) | Save (`t('liveWorkout.save')`)     |

The primary slot in each row is the control that carries the session's
"forward" momentum (Start begins it, Stop-while-running is the natural next
step toward finishing, Resume continues it, Save completes it); the ghost
slot is always the lower-commitment or reversible action. `Stop` therefore
renders once as primary (from `running`) and once as ghost (from `paused`) —
it is the same handler and copy either time, only its visual weight changes
with which action is more likely to be reached for in that phase, mirroring
how `DESIGN.md` already treats button shape as a per-slot, not per-action,
property. No new icon is added — every one of these renders as a plain
`action-md`/`action-sm` text label, exactly like `Discard`/`Save` today; a
leading icon exists only on Home's distinct `button-hero` variant, which this
ticket does not touch or reuse.

### Design decision: leaving mid-session behaves exactly like Discard today — no confirmation prompt

The ticket asks this spec to state explicitly what happens if the user
leaves the screen mid-session (back gesture; there is no tab bar to switch
away to from this screen, per Context). `live-workout-session-stats`'s own
spec already established that Live Workout's session state is
component/hook-local and is dropped, unrecoverable, the moment the screen
unmounts — Discard already relies on exactly this with zero confirmation.
This ticket does not add a "confirm before leaving" guard (an `Alert` or
modal) for a mid-session back gesture: this app has no existing
confirmation-dialog convention anywhere (confirmed by
`save-and-view-workout-sessions`'s own note that no toast/`Alert` convention
exists), and adding one here would be new cross-cutting UI invented for this
ticket alone, not composed from anything the app already has. **A back
gesture during `running`, `paused`, or `idle` silently discards the
in-progress session, identically to tapping Discard** — this is the accepted
behavior, flagged here as a deliberate decision rather than an oversight (see
Constraints).

### Design decision: reconnect-while-paused needs no new code

The ticket asks this spec to confirm what happens if the connection drops
while paused, and if it reconnects while still paused. `useLiveHeartRate`
(unmodified by this ticket) has no awareness of session phase; a drop while
paused behaves identically to a drop while running from that hook's
perspective — `bpm` freezes, `status` eventually flips to `'stale'` on the
same timer, and a reconnect resumes fresh `bpm`/`lastReadingAt` updates the
same way. On the `useWorkoutSession` side, the ingestion effect's
`phase !== 'running'` guard (see Interfaces/API) means any reading that
arrives while still paused — dropped-then-reconnected or otherwise — updates
nothing about the session (no sample appended, `elapsedMs` still frozen);
the moment the user taps Resume, the very next fresh reading is appended
normally. The two systems never need to observe each other: pausing doesn't
touch the BLE layer, and a drop/reconnect doesn't touch session phase. No
change to `use-live-heart-rate.ts`, `ble-connection-loss-detection`, or
`auto-reconnect-after-drop`'s logic is required.

## Data Model

```ts
// src/hooks/use-workout-session.ts

export type HeartRateSample = { bpm: number; timestamp: number }; // unchanged

/** One closed pause interval. Only ever appended on Resume (closing the
 * pause that Pause opened) or on Stop-while-paused (closing the trailing,
 * never-resumed pause at the moment the session ends) — never mutated after
 * being appended. Moved here from workout-record.ts (still re-exported from
 * there via a type-only import) so this hook, the only place a pause is ever
 * opened or closed, is the single owner of the shape, mirroring how
 * `HeartRateSample` already lives here and is imported into
 * `workout-record.ts` rather than the other way around. */
export type WorkoutPause = { startedAt: number; endedAt: number };

export type SessionPhase = 'idle' | 'running' | 'paused' | 'ended';

export type WorkoutSessionSnapshot = {
  phase: SessionPhase;
  startedAt: number | null; // set once, on the first start(); null while idle
  samples: HeartRateSample[]; // unchanged shape; now only ever appended while phase === 'running'
  pauses: WorkoutPause[]; // closed intervals only, in the order they closed
  elapsedMs: number; // accumulated *active* running time; frozen while paused/idle/ended
  averageBpm: number | null; // mean of samples[].bpm; unchanged formula, now over active-time samples only
  maxBpm: number | null; // unchanged formula
  start: () => void; // idle -> running; no-op otherwise
  pause: () => void; // running -> paused; no-op otherwise
  resume: () => void; // paused -> running; no-op otherwise
  stop: () => void; // running | paused -> ended; no-op otherwise
};

export const ELAPSED_TICK_INTERVAL_MS = 1_000; // unchanged
```

```ts
// src/workout/workout-record.ts

import type { HeartRateSample, WorkoutPause } from '@/hooks/use-workout-session'; // WorkoutPause now imported, not declared here

export type WorkoutRecord = {
  schemaVersion: number; // stays 1 — the shape of every field is unchanged,
  // only whether `pauses` is ever non-empty; see Constraints for why no bump
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
}; // unchanged shape
```

**Invariants:**

- `phase` transitions only along `idle → running → paused → running → ... →
ended`; every action function (`start`/`pause`/`resume`/`stop`) is a no-op
  if called from a phase it doesn't apply to (e.g. `pause()` while `idle`) —
  this is the enforcement point for "no Resume while running, no Pause while
  idle," not a UI-only disabled state.
- `startedAt` is set exactly once, by the first `start()` call, and never
  changes again for the life of the hook (matching the existing "captured
  once" precedent, just moved from mount-time to first-Start-time).
- `pauses` only ever grows by appending a fully-closed `{ startedAt, endedAt }`
  entry, on `resume()` or on `stop()`-while-paused — never on `pause()`
  itself (which only opens a pause; closing it is a separate, later event).
- No sample is ever appended while `phase !== 'running'` — enforced by a
  single condition at the ingestion effect (see Interfaces/API), the same
  "one rule at the ingestion point" precedent `live-workout-session-stats`
  established for the existing stale-reading rule, now with one additional
  clause.
- `elapsedMs` never counts time spent in `paused`, `idle`, or after `stop()`
  — it is the sum of every closed running segment's duration plus (while
  currently `running`) the open segment's duration so far.
- A record's `pauses` intervals are always fully contained within
  `[startedAt, <the moment stop() was called>]` and are non-overlapping,
  ordered by when they closed.

## Interfaces / API

### `src/hooks/use-workout-session.ts` (modified — behavior change, not purely additive)

```ts
export function useWorkoutSession(
  bpm: number | null,
  lastReadingAt: number | null,
): WorkoutSessionSnapshot;
```

Internal state, replacing the current `startedAt`/`samples`/tick trio:

- `phase` (`useState<SessionPhase>('idle')`)
- `startedAt` (`useState<number | null>(null)`) — no longer a lazy
  mount-time initializer; set inside `start()`.
- `samples` (`useState<HeartRateSample[]>([])`) — unchanged type.
- `pauses` (`useState<WorkoutPause[]>([])`)
- `accumulatedMs` (`useState(0)`) — sum of every **closed** running
  segment's duration; updated inside `pause()`/`stop()`.
- `runningSinceRef` (`useRef<number | null>(null)`) — `Date.now()` at the
  start of the currently-open running segment, or `null` when not running.
- `pausedAtRef` (`useRef<number | null>(null)`) — `Date.now()` at the start
  of the currently-open pause, or `null` when not paused.
- `lastAppendedAtRef` — unchanged from today, guards against a duplicate
  append for an unchanged `lastReadingAt`.

The sample-ingestion effect gains exactly one clause, the ticket's own
"do not conflate a pause with a dropout" rule enforced at the single existing
ingestion point rather than filtered later in `averageBpm`/`maxBpm`:

```ts
useEffect(() => {
  if (bpm == null || lastReadingAt == null) return;
  if (phase !== 'running') return; // new — no sample while idle, paused, or ended
  if (lastAppendedAtRef.current === lastReadingAt) return;
  lastAppendedAtRef.current = lastReadingAt;
  setSamples((prev) => [...prev, { bpm, timestamp: lastReadingAt }]);
}, [bpm, lastReadingAt, phase]);
```

The existing tick interval (`setInterval(ELAPSED_TICK_INTERVAL_MS)`, forcing
a re-render every second so `elapsedMs` visibly advances) is unchanged and
still runs for the whole life of the hook, independent of `phase` — while
`idle`/`paused`/`ended` this simply re-renders the same `elapsedMs` value
each tick, a harmless no-op re-render rather than something worth the extra
complexity of starting/stopping the interval on every phase transition (see
Style & Conventions).

Action functions:

```ts
function start() {
  if (phase !== 'idle') return;
  const now = Date.now();
  setStartedAt(now);
  runningSinceRef.current = now;
  setPhase('running');
}

function pause() {
  if (phase !== 'running') return;
  const now = Date.now();
  setAccumulatedMs((prev) => prev + (now - (runningSinceRef.current ?? now)));
  runningSinceRef.current = null;
  pausedAtRef.current = now;
  setPhase('paused');
}

function resume() {
  if (phase !== 'paused') return;
  const now = Date.now();
  setPauses((prev) => [...prev, { startedAt: pausedAtRef.current ?? now, endedAt: now }]);
  pausedAtRef.current = null;
  runningSinceRef.current = now;
  setPhase('running');
}

function stop() {
  if (phase !== 'running' && phase !== 'paused') return;
  const now = Date.now();
  if (phase === 'running') {
    setAccumulatedMs((prev) => prev + (now - (runningSinceRef.current ?? now)));
    runningSinceRef.current = null;
  } else {
    setPauses((prev) => [...prev, { startedAt: pausedAtRef.current ?? now, endedAt: now }]);
    pausedAtRef.current = null;
  }
  setPhase('ended');
}
```

Every render computes:

```ts
const elapsedMs =
  accumulatedMs +
  (phase === 'running' && runningSinceRef.current != null
    ? Date.now() - runningSinceRef.current
    : 0);
const averageBpm =
  samples.length === 0 ? null : samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length;
const maxBpm = samples.length === 0 ? null : Math.max(...samples.map((s) => s.bpm));
```

`averageBpm`/`maxBpm` formulas are byte-for-byte unchanged from today — they
already only ever see samples that passed the ingestion gate, so no separate
"ignore paused readings" branch is needed in either.

`stop()` allows `paused → ended` directly (Stop is valid from either
`running` or `paused` — the ticket's own lifecycle diagram shows `paused →
running` as the labeled path back to activity, but never says Stop requires
resuming first, and a real workout ending while the user happens to be
paused is an ordinary case, not an error).

### `src/workout/workout-record.ts` (modified)

```ts
export function deriveWorkoutSummary(record: WorkoutRecord): WorkoutSummary;
```

`samples.length === 0` branch is unchanged. Otherwise:

```ts
function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

const lastReadingAt = samples[samples.length - 1].timestamp;
const pausedMs = pauses.reduce(
  (sum, p) => sum + overlapMs(startedAt, lastReadingAt, p.startedAt, p.endedAt),
  0,
);
const durationMs = Math.max(0, lastReadingAt - startedAt - pausedMs);
```

`averageBpm`/`maxBpm` are unchanged (they already only ever summarize samples
that were recorded while running, per this ticket's ingestion-gate
invariant — no change needed here for either "old, always-`[]`-pauses"
records or new populated ones).

`overlapMs` clamps each pause interval to the `[startedAt, lastReadingAt]`
window before subtracting it, rather than assuming every pause fully falls
inside that window: a pause opened after the last real reading arrived (the
user paused, then stopped without ever getting another reading) would
otherwise be subtracted from a wall-clock span it never actually occupied,
which could under-count — or with more than one such trailing pause,
double-count — the true active time. Every pause this ticket's own `stop()`/
`resume()` ever produces is fully bounded by `[startedAt, <stop-time>]`, so
in the common case (paused, then resumed before the session ends) the clamp
is a no-op; it only matters for the paused-when-stopped edge case, and it
correctly reduces to `0` for a legacy record's empty `pauses` array —
identical to today's formula.

Existing durationMs example (from the current test fixture,
`workout-record.test.ts:33-48`): `startedAt: 1_000`, samples at `1_000`,
`5_000`, `11_000`, `pauses: []` → unchanged `durationMs: 10_000`, confirming
the legacy/no-pauses path is untouched.

New example this ticket adds: the same samples plus one pause
`{ startedAt: 6_000, endedAt: 8_000 }` (fully inside `[1_000, 11_000]`) →
`pausedMs = 2_000`, `durationMs = 10_000 - 2_000 = 8_000`.

### `src/app/live-workout.tsx` (modified)

`const session = useWorkoutSession(bpm, lastReadingAt);` — call site
unchanged; `session` now carries `phase`/`pauses`/`start`/`pause`/`resume`/
`stop` in addition to the existing fields.

`canSave` is redefined to also require the ended phase (Save is only ever
rendered in that phase, but the check is made explicit rather than implicit
in JSX placement alone):

```ts
const canSave = session.phase === 'ended' && session.samples.length > 0;

const save = () => {
  if (!canSave || session.startedAt == null) return; // startedAt is guaranteed
  // non-null once phase === 'ended' (only reachable via start()); the null
  // check exists purely to satisfy startedAt's `number | null` type, mirroring
  // the existing "Pressable is already disabled; defensive" comment style.
  const record: WorkoutRecord = {
    schemaVersion: WORKOUT_RECORD_SCHEMA_VERSION,
    id: createWorkoutId(session.startedAt),
    startedAt: session.startedAt,
    samples: session.samples,
    device: { id: deviceId, name: device?.name ?? device?.lastKnownName ?? null },
    pauses: session.pauses, // was hardcoded []; now the session's real pause history
  };
  void saveWorkoutSession(record);
  router.back();
};
```

The action row (`:225-264` today) is replaced by four mutually-exclusive
blocks, one per `session.phase`, each the same two-`Pressable` row shape
Discard/Save already use (see the UI decision above for which slot is
ghost/primary):

- `phase === 'idle'`: Discard (`testID="live-workout-discard"`, unchanged
  handler `discard`) + Start (`testID="live-workout-start"`,
  `onPress={session.start}`, primary).
- `phase === 'running'`: Pause (`testID="live-workout-pause"`,
  `onPress={session.pause}`, ghost) + Stop (`testID="live-workout-stop"`,
  `onPress={session.stop}`, primary).
- `phase === 'paused'`: Stop (`testID="live-workout-stop"`,
  `onPress={session.stop}`, ghost) + Resume (`testID="live-workout-resume"`,
  `onPress={session.resume}`, primary).
- `phase === 'ended'`: Discard + Save, byte-for-byte the existing
  `:225-264` block (same testIDs, same `canSave`/`save` wiring, same disabled
  hint line below it) — unchanged except that `canSave`/`save` are now as
  redefined above.

No other line changes: the guard branch, status line, reconnecting line, BPM
readout, and stats row (`elapsedMs`/`averageBpm`/`maxBpm`, still rendered via
the unchanged `formatElapsed`) render exactly as before, now simply showing
`00:00`/`--`/`--` while `idle` since `session`'s derived values are `0`/
`null`/`null` until `start()` is called. The `__DEV__` simulate-dropout
trigger stays exactly where it is today, unconditional on `session.phase` —
it is a connection-level test tool, not a session-level one (see the
reconnect-while-paused design decision above).

### `src/i18n/locales/en.json` (modified)

New keys under the existing `liveWorkout` namespace (alongside `discard`/
`save`, `:92-93`):

```json
"liveWorkout": {
  "start": "START",
  "pause": "PAUSE",
  "resume": "RESUME",
  "stop": "STOP"
}
```

Every other existing key is unchanged.

## Files Created

| File | Purpose                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| N/A  | This ticket only changes existing behavior — no new module is warranted (see the UI decision's "no new icon/component" note). |

## Files Modified

| File                                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/use-workout-session.ts`                | Adds `phase`/`pauses`/`start`/`pause`/`resume`/`stop`; `startedAt` set on `start()` instead of at mount; `elapsedMs` becomes accumulated active time; ingestion effect gated on `phase === 'running'`. `WorkoutPause` type added here (moved from `workout-record.ts`).                                                                                                                                                                                                                                                                |
| `src/hooks/__tests__/use-workout-session.test.ts` | Rewritten around the phase machine: idle inert snapshot, `start()` begins accumulation, `pause()`/`resume()` freeze/continue `elapsedMs` and gate sample ingestion, `pauses` populated correctly, `stop()` from both `running` and `paused`, every action's no-op-when-invalid-phase case, existing average/max/elapsed-ticking cases adapted to run after `start()`.                                                                                                                                                                  |
| `src/workout/workout-record.ts`                   | `WorkoutPause` becomes a type-only import from `@/hooks/use-workout-session` instead of a local declaration. `deriveWorkoutSummary` subtracts each pause's clamped overlap with `[startedAt, lastReadingAt]` from `durationMs`.                                                                                                                                                                                                                                                                                                        |
| `src/workout/__tests__/workout-record.test.ts`    | Existing three `deriveWorkoutSummary` cases (`pauses: []` via `makeRecord`'s default) pass unmodified. Add cases: one pause fully inside the sample span reduces `durationMs` by its length; a trailing pause opened after the last sample does not affect `durationMs`; multiple non-overlapping pauses each subtract correctly.                                                                                                                                                                                                      |
| `src/app/live-workout.tsx`                        | `canSave` requires `phase === 'ended'`; `save` reads `session.pauses` instead of a hardcoded `[]` and guards `session.startedAt == null`. The action row becomes four phase-conditional blocks (idle/running/paused unchanged-shape rows, `ended` byte-for-byte the existing Discard/Save block). New testIDs: `live-workout-start`, `live-workout-pause`, `live-workout-resume`, `live-workout-stop`.                                                                                                                                 |
| `src/app/__tests__/live-workout.test.tsx`         | Mocked `useWorkoutSession` return values gain `phase`/`pauses`/`start`/`pause`/`resume`/`stop`. New cases per phase: idle shows Discard+Start (Start calls `session.start`); running shows Pause+Stop; paused shows Stop+Resume; ended shows the existing Discard+Save behavior unchanged. A save-with-populated-`pauses` case replaces the existing hardcoded-`[]` assertion. Existing guard-branch, live/stale, `connectionLost`/`reconnecting`/`reconnectFailed`, and `__DEV__`-trigger cases pass with only the added mock fields. |
| `src/i18n/locales/en.json`                        | Add `liveWorkout.start`/`pause`/`resume`/`stop`. Existing keys unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Implementation Steps

1. Rewrite `src/hooks/use-workout-session.ts` per Interfaces/API (phase state
   machine, `pauses`, action callbacks, gated ingestion, accumulated
   `elapsedMs`). Rewrite `src/hooks/__tests__/use-workout-session.test.ts`
   fully around the new phase machine, using fake timers exactly as today.
2. Move `WorkoutPause` into `use-workout-session.ts` and update
   `src/workout/workout-record.ts`'s import; update `deriveWorkoutSummary`'s
   `durationMs` formula with the clamped-overlap subtraction. Extend
   `src/workout/__tests__/workout-record.test.ts` with the new pause cases;
   confirm the three existing cases still pass unmodified.
3. Add the `liveWorkout.start`/`pause`/`resume`/`stop` keys to
   `src/i18n/locales/en.json`.
4. Modify `src/app/live-workout.tsx`: redefine `canSave`/`save`, replace the
   action row with the four phase-conditional blocks, wire the new testIDs.
   Update `src/app/__tests__/live-workout.test.tsx` per Files Modified.
5. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
6. Manually verify on a dev-client build (`pnpm android`): open Live Workout
   with a monitor connected, confirm BPM shows live with no recording until
   Start; Start, let a few readings arrive, Pause (confirm the elapsed clock
   freezes and BPM keeps updating), Resume (confirm elapsed continues from
   where it froze), Stop, Save; confirm the saved row's duration in History
   is less than the wall-clock time the screen was open by roughly the
   paused span. Separately, open History and confirm a session saved before
   this change (from before this branch existed, or one saved during manual
   verification of `save-and-view-workout-sessions`) still renders its row
   correctly.

## Style & Conventions

- **Session state stays in `useWorkoutSession`, not a store.** Same
  reasoning `live-workout-session-stats` already established: this state
  must NOT outlive the screen (see the mid-session-leave design decision
  above), unlike `usePairingStore`, which must.
- **Phase transitions are enforced inside the action functions themselves**
  (`if (phase !== 'idle') return;` etc.), not only by which controls the UI
  happens to render — mirroring how `save`'s existing `if (!canSave) return;`
  is already a defensive second guard behind a `disabled` Pressable, per
  `save-and-view-workout-sessions`'s own established pattern, applied to four
  actions instead of one.
- **The ingestion-point gate stays a single added clause in one effect**,
  not a filter duplicated into `averageBpm`/`maxBpm`/History's row rendering —
  the same "one rule at the ingestion point" principle the ticket itself
  asks for, already precedented by the existing stale-reading rule.
- **`deriveWorkoutSummary` stays a pure function with no I/O**, unchanged in
  spirit from `save-and-view-workout-sessions`'s original — it gains one
  additional pure computation (`overlapMs`/`pausedMs`), not a new
  responsibility.
- **No new `Alert`/modal/confirmation component** for leaving mid-session —
  see the design decision above; this repo has no existing convention for
  one, and inventing one here would be exactly the kind of cross-cutting UI
  `CLAUDE.md` reserves for hand-authored decisions, not a single ticket.
- **No new icon.** All four new controls render as plain text labels via the
  existing `button-primary`/`button-ghost` tokens, matching Discard/Save.
- All new copy renders via `t('liveWorkout.…')`, per `CLAUDE.md`'s i18n rule.
- Component file/naming conventions are unaffected — no new component file
  is added by this ticket.

## Acceptance Criteria

- [ ] `useWorkoutSession`'s initial snapshot (before `start()`) has
      `phase: 'idle'`, `startedAt: null`, `samples: []`, `pauses: []`,
      `elapsedMs: 0`, `averageBpm: null`, `maxBpm: null`.
- [ ] Calling `start()` moves `phase` to `'running'`, sets `startedAt` to the
      call-time `Date.now()`, and `elapsedMs` begins advancing.
- [ ] A fresh `(bpm, lastReadingAt)` pair while `phase === 'running'`
      appends a sample, exactly as today.
- [ ] A fresh `(bpm, lastReadingAt)` pair while `phase === 'paused'` or
      `'idle'` does **not** append a sample.
- [ ] Calling `pause()` while `running` moves `phase` to `'paused'` and
      freezes `elapsedMs` (advancing fake-timer time afterward does not
      change it).
- [ ] Calling `resume()` while `paused` moves `phase` back to `'running'`,
      appends one entry to `pauses` with `startedAt`/`endedAt` bracketing the
      pause, and `elapsedMs` resumes advancing from the value it was frozen
      at (not from `0`, not from wall-clock since `startedAt`).
- [ ] `pause()` while not `running`, `resume()` while not `paused`, and
      `start()` while not `idle` are all no-ops (no phase change, no state
      mutation).
- [ ] `stop()` from `running` moves `phase` to `'ended'` and freezes
      `elapsedMs`; `stop()` from `paused` also moves to `'ended'` and appends
      the still-open pause to `pauses` with `endedAt` equal to the stop-time.
- [ ] `averageBpm`/`maxBpm` reflect only samples appended while `running`
      (a session with readings before, during, and after one pause excludes
      the pause-period readings — trivially true since none were ever
      appended, verified end-to-end via a full start→pause→resume→stop
      sequence with readings fed in at each stage).
- [ ] `deriveWorkoutSummary` on a record with one pause fully inside
      `[startedAt, lastSample.timestamp]` returns `durationMs` reduced by
      exactly that pause's length, with `averageBpm`/`maxBpm` unaffected.
- [ ] `deriveWorkoutSummary` on a record with `pauses: []` (the existing
      three test cases) returns byte-identical results to before this
      ticket.
- [ ] `deriveWorkoutSummary` on a record with a pause opened after the last
      sample's timestamp does not reduce `durationMs` for that pause (the
      clamp is exercised, not just the common case).
- [ ] Live Workout: with `session.phase === 'idle'`, the screen shows the
      live BPM readout and status line, `00:00` elapsed, `--`/`--`
      average/max, and a Discard + Start row; tapping Start calls
      `session.start` exactly once.
- [ ] Live Workout: with `session.phase === 'running'`, the row shows Pause + Stop; tapping each calls `session.pause`/`session.stop` exactly
      once; Resume and Start are not rendered.
- [ ] Live Workout: with `session.phase === 'paused'`, the row shows Stop +
      Resume; tapping each calls `session.stop`/`session.resume` exactly
      once; Pause and Start are not rendered.
- [ ] Live Workout: with `session.phase === 'ended'`, the existing Save/
      Discard behavior (disabled-with-hint at zero samples; persists with
      `pauses` equal to `session.pauses`, calls `router.back()`, at one or
      more samples) passes exactly as `save-and-view-workout-sessions`
      specified, with `pauses` now asserted equal to a populated array in at
      least one test case (not just `[]`).
- [ ] Live Workout's pre-existing cases (guard branch, live/stale status,
      elapsed/avg/max rendering, `connectionLost`/`reconnecting`/
      `reconnectFailed` regressions, the `__DEV__` trigger) all pass with
      only the added mock fields on `useWorkoutSession`'s return value.
- [ ] A `WorkoutRecord` saved before this change (`pauses: []`) still loads
      via `loadWorkoutSessions` and renders a correct `SessionRow` in
      History (manually verified per Implementation Steps, and covered by
      the unmodified `pauses: []` `deriveWorkoutSummary` test cases).
- [ ] No new string is inline in JSX — `start`/`pause`/`resume`/`stop` all
      render via `t('liveWorkout.…')`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: manual Start/Pause/Resume/Stop and duration correction only. No
  auto-pause on detected inactivity (manual controls only, per the ticket's
  own out-of-scope list), no change to reconnect behavior, the staleness
  indicator, or the History list beyond durations now reflecting active
  time, and no zones/live trace graph/history detail view — all still
  deferred, per the ticket.
- **No confirmation prompt on leaving mid-session.** A back gesture during
  `running`/`paused` silently discards the session, identically to Discard —
  see the design decision above. This is a real, if minor, usability gap
  (a user could lose a long workout to an accidental back-swipe) accepted as
  proportionate to this app's existing zero-confirmation Discard precedent
  and out of scope for this ticket to introduce a new UI pattern to fix.
- **No schema version bump.** `WorkoutRecord`'s shape (every field's type)
  is unchanged — only `pauses`' typical contents changes from always-`[]` to
  sometimes-populated — so `WORKOUT_RECORD_SCHEMA_VERSION` stays `1`; a
  version bump is reserved for an actual shape change, matching why the
  field exists in the first place.
- **`deriveWorkoutSummary`'s pause-overlap subtraction assumes non-overlapping,
  well-formed pause intervals** (guaranteed by this ticket's own
  `pause()`/`resume()`/`stop()` implementation, per the Data Model
  invariants) — it does not defensively re-sort or merge overlapping
  intervals for a hypothetically corrupt record; `workout-store.ts`'s
  existing shape-only validation (`Array.isArray(pauses)`) does not check
  per-entry structure, matching its existing validation depth for `samples`.
- **The tick interval keeps running unconditionally for the hook's whole
  lifetime**, including while `idle`/`paused`/`ended`, rather than being
  started/stopped per phase transition — a deliberate simplicity choice (see
  Style & Conventions); the extra per-second re-renders while not actively
  running are the same negligible cost this app already accepts for the
  existing always-on interval.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
