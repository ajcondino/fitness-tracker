# Feature: Live Workout Session Stats

## Intent

The Live Workout screen accumulates a timestamped heart-rate sample on every
genuinely fresh reading for the life of the screen, and derives — never
separately tracks — elapsed time, average BPM, and max BPM from that sample
array, displaying all three below the BPM readout.

## Context

- **Problem statement:** `src/app/live-workout.tsx` (per `live-workout-screen`'s
  own spec) renders only the live BPM number and a status line; nothing about
  the session is recorded anywhere. There is no code path in the repo that
  keeps a running record of readings over time — `useLiveHeartRate` overwrites
  its `bpm` state on every valid notification and discards the previous value
  (`src/hooks/use-live-heart-rate.ts:64-70`). Elapsed time, average BPM, and
  max BPM cannot be shown without something recording samples as they arrive.
- **Current code:**
  - `src/hooks/use-live-heart-rate.ts` — `useLiveHeartRate(deviceId, isConnected)`
    returns `{ bpm, status }`. Its `monitorCharacteristicForDevice` listener
    (`:57-71`) is the **only** point in the codebase that ever sees a raw,
    freshly-arrived HR notification: `lastReadingAtRef.current = Date.now()`
    is set there and only there — never inside the `setInterval` staleness
    check (`:80-85`), which only ever flips `isStale` to `true` and never
    touches `lastReadingAtRef`. This existing separation — "a ref/timestamp
    updates on a fresh notification; a separate timer only watches elapsed
    time since that update" — is exactly what this ticket's "don't append a
    stale reading" rule needs, and it already exists; see Style & Conventions
    for why this ticket does not need its own staleness check to satisfy that
    rule.
  - `lastReadingAtRef` is a plain `useRef`, not state — it does not, by
    itself, cause a re-render, and is invisible outside the hook. This
    ticket needs a caller-visible signal that changes on every fresh
    reading, including two consecutive readings that happen to carry the
    identical BPM value (`setBpm(value)` is a no-op re-render when `value`
    equals the current `bpm` state — React bails out on an unchanged
    primitive). Relying on `bpm` changing to detect "a new reading arrived"
    would silently drop samples whenever the heart rate is momentarily
    constant across two or more notifications — exactly the kind of gap a
    future time-in-zone feature (which this ticket's data model is
    explicitly meant to support without re-recording) cannot tolerate. This
    is why `useLiveHeartRate`'s return value grows by one field rather than
    the new hook trying to infer "a fresh reading happened" from `bpm` or
    `status` alone (see Interfaces / API).
  - `src/app/live-workout.tsx` — a top-level `src/app/` stack route
    (outside `(tabs)`) that genuinely unmounts on Discard/back (confirmed by
    `live-workout-screen`'s own spec). No component-local state today
    survives a Discard; this is exactly the lifecycle the ticket's "on
    discard, session data is dropped entirely" requirement wants, with no
    extra reset code needed if the session lives in component/hook state
    rather than a store.
  - `src/ble/pairing-store.ts` (`usePairingStore`) is a module-level Zustand
    singleton that deliberately outlives a screen — it exists because the
    DEVICE tab never unmounts on blur and pairing state must survive that.
    Session data has the opposite requirement (must **not** outlive the
    screen), and nothing outside Live Workout needs to read it before a
    save exists, so a store would add a lifecycle mismatch and a manual
    reset this ticket doesn't otherwise need.
  - `DESIGN.md`'s `card-stat` / `card-stat-emphasis` components ("`label-micro`
    uppercase caption above an `h3` value... Cards live in rows of two or
    three with a 10px gap") are named tokens with no consumer anywhere in
    the codebase yet (confirmed: no `labelMicro` usage exists outside
    `constants/theme.ts`'s own definition). This is their first use.
- **User impact:** Live Workout gains a row of three stats — elapsed time,
  average BPM, max BPM — below the BPM readout, updating live as the session
  progresses. Elapsed keeps counting through a signal dropout or an
  auto-reconnect cycle; average/max never include a frozen, stale BPM value.
- **Dependencies:** No new package. Builds on `useLiveHeartRate`
  (`live-workout-screen`, extended by `ble-connection-loss-detection` and
  `auto-reconnect-after-drop`). No dependency on `usePairingStore` beyond
  what `live-workout.tsx` already reads.

## Data Model

```ts
// src/hooks/use-workout-session.ts

/** One heart-rate reading, timestamped at the moment it arrived. The unit
 * this ticket's data model is built around — average/max/elapsed today,
 * and (per the ticket's explicit intent) a future save/summary feature and
 * time-in-zone derivation later, all from this same array, with no
 * restructuring and no re-recording. */
export type HeartRateSample = {
  bpm: number;
  timestamp: number; // Date.now() at the moment the reading arrived
};

/** Everything the screen needs, entirely derived from `samples` plus
 * `startedAt` — no field here is independently tracked state. */
export type WorkoutSessionSnapshot = {
  startedAt: number;
  samples: HeartRateSample[];
  elapsedMs: number; // Date.now() - startedAt; wall-clock, keeps advancing through a dropout
  averageBpm: number | null; // mean of samples[].bpm; null when samples is empty
  maxBpm: number | null; // max of samples[].bpm; null when samples is empty
};

/** How often the hook forces a re-render so `elapsedMs` visibly ticks
 * forward even when no new sample has arrived (a dropout, or simply the
 * gap between two ~1Hz readings). Matches "mm:ss" display granularity —
 * no benefit to a finer interval. */
export const ELAPSED_TICK_INTERVAL_MS = 1_000;
```

**Invariants:**

- `samples` only ever grows by appending; nothing removes or mutates an
  existing entry (append-only, matching "derived, not re-tracked").
- Exactly one sample is appended per genuinely fresh HR notification — never
  zero (a real reading is never silently dropped for having a repeat BPM
  value) and never more than one (a re-render triggered by something other
  than a new reading, e.g. a parent re-render, must not duplicate the last
  entry).
- No sample is ever appended while the feed is stale (frozen BPM from a
  dropped connection) — enforced structurally, not by a runtime check in
  this ticket's own code (see Style & Conventions).
- `averageBpm`/`maxBpm`/`elapsedMs` are computed on every render from
  `samples`/`startedAt` — none of the three is ever set independently via
  its own `setState` call.

## Interfaces / API

### `src/hooks/use-live-heart-rate.ts` (modified — additive)

```ts
export function useLiveHeartRate(
  deviceId: string | null,
  isConnected: boolean,
): {
  bpm: number | null;
  status: LiveHeartRateStatus;
  lastReadingAt: number | null; // new — Date.now() of the most recent *fresh* reading
};
```

`lastReadingAt` starts `null` (mirroring `bpm`) and is set exactly where
`lastReadingAtRef.current` already is (`:64-70`), via a new
`useState<number | null>(null)`:

```ts
const now = Date.now();
lastReadingAtRef.current = now; // unchanged — internal staleness bookkeeping
setLastReadingAt(now); // new — the caller-visible signal
setIsStale(false);
setBpm(value);
```

The existing `lastReadingAtRef` is untouched and keeps doing exactly what it
does today (the staleness-check `setInterval` reads it, unmodified). The new
`lastReadingAt` state is a second, purely additive read of the same moment,
exposed for a caller to key off of. Because real HR notifications arrive at
most a few times per second, two consecutive fresh readings essentially
never share the same millisecond `Date.now()` value, so `setLastReadingAt`
reliably re-renders on every fresh reading — including a repeat BPM value —
unlike `setBpm`, which bails out on an unchanged number.

No other line in this hook changes: the effect's guard/dependency array
(`[deviceId, isConnected]`), the discover→monitor sequence, the staleness
interval, and cleanup are all unmodified.

### `src/hooks/use-workout-session.ts` (new)

```ts
export function useWorkoutSession(
  bpm: number | null,
  lastReadingAt: number | null,
): WorkoutSessionSnapshot;
```

Always called unconditionally (rules of hooks), mirroring
`useLiveHeartRate`'s own "always called, arguments are the gate" shape —
`live-workout.tsx` calls it above its guard-branch return, with `bpm`/
`lastReadingAt` simply `null` for the life of that render when there's no
connected device (an inert result that is never displayed, matching how
`useLiveHeartRate(null, ...)` is already an inert no-op call site in that
same branch).

Internals:

1. `const [startedAt] = useState(() => Date.now());` — captured once, at
   mount, via the lazy-initializer pattern `live-workout.tsx` already uses
   for its own frozen `deviceId`. This is "a session starts when the screen
   mounts."
2. `const [samples, setSamples] = useState<HeartRateSample[]>([]);`
3. A ref (e.g. `lastAppendedAtRef`) tracks the `lastReadingAt` value already
   recorded. An effect keyed on `[bpm, lastReadingAt]`:
   ```ts
   if (bpm == null || lastReadingAt == null) return;
   if (lastAppendedAtRef.current === lastReadingAt) return; // already recorded
   lastAppendedAtRef.current = lastReadingAt;
   setSamples((prev) => [...prev, { bpm, timestamp: lastReadingAt }]);
   ```
   The ref guard is defensive (protects against a duplicate append if this
   effect is ever invoked twice for the same commit) rather than load-bearing
   for the "one sample per reading" invariant — that invariant is already
   guaranteed by `lastReadingAt` only changing on a fresh notification (see
   Data Model and Style & Conventions).
4. A `setInterval(ELAPSED_TICK_INTERVAL_MS)` that does nothing but force a
   re-render (e.g. a numeric tick counter via
   `setState((n) => n + 1)`), started once on mount and cleared on unmount —
   this is what makes `elapsedMs` visibly advance between readings and
   through a dropout, mirroring `useLiveHeartRate`'s own staleness-check
   interval shape (a timer whose only job is to force re-derivation, not to
   hold any value of its own).
5. Every render computes and returns:
   ```ts
   const elapsedMs = Date.now() - startedAt;
   const averageBpm =
     samples.length === 0 ? null : samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length;
   const maxBpm = samples.length === 0 ? null : Math.max(...samples.map((s) => s.bpm));
   ```
   `averageBpm` is returned unrounded — rounding is a display concern, done
   where `bpm ?? '--'` is already formatted today, not baked into the
   derived data a future save/summary feature will consume.

This hook imports nothing from `@/ble/*` or `usePairingStore` — it operates
purely on the two primitives passed in, matching `useLiveHeartRate`'s own
"no `usePairingStore` import" rule, applied one layer further out.

### `src/app/live-workout.tsx` (modified — additive)

```ts
const { bpm, status, lastReadingAt } = useLiveHeartRate(deviceId, isConnected);
const session = useWorkoutSession(bpm, lastReadingAt);
```

A small private helper, colocated with the screen's existing
`selectStatusCopy` helper (same file, same "screen-local presentation logic"
treatment, not extracted to a shared module):

```ts
function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
```

No hour rollover — the ticket asks for mm:ss only; a session past 99 minutes
simply shows a 3-digit (or wider) minutes value rather than wrapping,
which is an accepted, unlikely-to-matter edge for a live training session
(see Constraints).

New render, added between the existing `readoutContainer` and `actionRow`
(additive — no existing line changes):

```tsx
<View style={styles.statsRow}>
  <View
    style={[styles.statCard /* surface / outline / md radius, per DESIGN.md's card-stat token */]}
  >
    <ThemedText variant="labelMicro" color="onSurfaceDim">
      {t('liveWorkout.stats.elapsed')}
    </ThemedText>
    <ThemedText variant="h3" color="onSurface">
      {formatElapsed(session.elapsedMs)}
    </ThemedText>
  </View>
  <View style={[styles.statCard /* ... */]}>
    <ThemedText variant="labelMicro" color="onSurfaceDim">
      {t('liveWorkout.stats.avgBpm')}
    </ThemedText>
    <ThemedText variant="h3" color="onSurface">
      {session.averageBpm == null ? '--' : Math.round(session.averageBpm)}
    </ThemedText>
  </View>
  <View style={[styles.statCard /* ... */]}>
    <ThemedText variant="labelMicro" color="onSurfaceDim">
      {t('liveWorkout.stats.maxBpm')}
    </ThemedText>
    <ThemedText variant="h3" color="onSurface">
      {session.maxBpm ?? '--'}
    </ThemedText>
  </View>
</View>
```

`statCard` styling follows `DESIGN.md`'s `card-stat` token exactly:
`surface` background, `outline` 1px border, `md` (16px) radius, 14px
padding, each card `flex: 1` inside a `flexDirection: 'row'` `statsRow` with
a 10px gap (the token's own documented "rows of two or three with a 10px
gap" — 10px is off the 4/8/12/16/24/32 spacing scale but is DESIGN.md's own
named figure for this exact component, the same "optical adjustment already
in the design" allowance the scale's own doc gives). Caption color
(`onSurfaceDim` on `labelMicro`) is not itself named by `card-stat`'s YAML
block (which only names the value's `on-surface` color) — this spec reuses
`section-header`'s existing `onSurfaceDim`/mono-caption treatment for the
caption role, the closest existing precedent for a small uppercase mono
label, flagged here as this spec's own presentational choice.

The `'--'` placeholder for a null average/max reuses the exact convention
the existing BPM readout already established (`{bpm ?? '--'}`,
`live-workout.tsx:135`) — an un-translated literal, matching existing code
rather than introducing a new deviation from `CLAUDE.md`'s i18n rule.

Save's `onPress` body is unchanged (still an intentional no-op); its
existing code comment gains one clause noting `session.samples`/
`session.startedAt` are now the shape a future save feature would
serialize — a comment-only change, not a behavior change.

### `src/i18n/locales/en.json` (modified)

New keys under the existing `liveWorkout` namespace:

```json
"liveWorkout": {
  "stats": {
    "elapsed": "ELAPSED",
    "avgBpm": "AVG BPM",
    "maxBpm": "MAX BPM"
  }
}
```

## Files Created

| File                                              | Purpose                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/use-workout-session.ts`                | Accumulates `{ bpm, timestamp }` samples from fresh readings; derives `elapsedMs`/`averageBpm`/`maxBpm` from `samples`/`startedAt`.                                                                                                                      |
| `src/hooks/__tests__/use-workout-session.test.ts` | Fake-timer-driven: initial snapshot at mount, one sample per distinct `lastReadingAt`, no append on `null` args or a repeated `lastReadingAt`, elapsed advancing independent of new samples, average/max correctness over a small hand-built sample set. |

## Files Modified

| File                                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/use-live-heart-rate.ts`                | Add the `lastReadingAt` state field and return value, per Interfaces/API. No other line changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/hooks/__tests__/use-live-heart-rate.test.ts` | Every existing `expect(result.current).toEqual({ bpm, status })` assertion gains a `lastReadingAt` field. Fake timers are already active in this file's `beforeEach`, so `Date.now()` is frozen except when explicitly advanced — a test asserts `lastReadingAt` equal to the `Date.now()` value captured immediately before firing `capturedListener`, and the "goes stale" test asserts `lastReadingAt` stays at the pre-advance value (not `Date.now()` after `jest.advanceTimersByTime`), confirming staleness never touches it. Add one new case: two consecutive notifications carrying the identical BPM value still produce two different `lastReadingAt` values. |
| `src/app/live-workout.tsx`                        | Destructure `lastReadingAt` from `useLiveHeartRate`; call `useWorkoutSession`; add the `formatElapsed` helper; render the new stats row; extend Save's comment. No existing line's behavior changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/app/__tests__/live-workout.test.tsx`         | Mock `@/hooks/use-workout-session` (new `jest.mock`, alongside the existing `use-live-heart-rate` mock). Existing `mockedUseLiveHeartRate.mockReturnValue({...})` call sites gain a `lastReadingAt` field (type-required, behavior-neutral). Add cases: renders `formatElapsed`'s mm:ss output, average BPM, and max BPM from a mocked session snapshot; renders `'--'` for a null average/max. Existing assertions (guard branch, live/stale, Discard, Save, dev-trigger, `connectionLost`/`reconnecting` regressions) pass unmodified.                                                                                                                                  |
| `src/i18n/locales/en.json`                        | Add `liveWorkout.stats.elapsed` / `avgBpm` / `maxBpm`. Existing keys untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Implementation Steps

1. Add the `lastReadingAt` state field to `src/hooks/use-live-heart-rate.ts`
   per Interfaces/API. Update every existing assertion in
   `src/hooks/__tests__/use-live-heart-rate.test.ts` and add the
   repeated-BPM-value case.
2. Create `src/hooks/use-workout-session.ts` and its test — fully
   unit-testable with fake timers alone, no dependency on `useLiveHeartRate`
   or any BLE mock.
3. Add the `liveWorkout.stats.*` keys to `src/i18n/locales/en.json`.
4. Modify `src/app/live-workout.tsx`: wire `useWorkoutSession`, add
   `formatElapsed`, render the stats row, extend Save's comment. Extend
   `src/app/__tests__/live-workout.test.tsx` per Files Modified.
5. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## Style & Conventions

- **No explicit "is this reading stale" check exists anywhere in this
  ticket's own code** — the rule is satisfied structurally by reusing
  `useLiveHeartRate`'s existing separation between its listener (which alone
  sets `lastReadingAt`, only on a genuinely fresh notification) and its
  staleness-check interval (which only ever sets a boolean flag and never
  touches `lastReadingAt`). Since `useWorkoutSession` only appends when
  `lastReadingAt` changes to a new value, a stale/frozen BPM — by
  definition, a period with no new notification — never produces a new
  `lastReadingAt` and therefore never appends. This is the "one rule at the
  ingestion point" the ticket describes; it is enforced by where
  `lastReadingAt` is set (`use-live-heart-rate.ts`'s listener), not by a
  second check in the new hook.
- **`useWorkoutSession` never imports `usePairingStore`, `bleManager`, or
  `useLiveHeartRate`** — it takes two primitives and is testable in
  isolation, mirroring `useLiveHeartRate`'s own "device-selection/BLE I/O
  stays out of this layer" rule, applied one layer further from the BLE
  boundary.
- **Session state lives in a hook, not a store.** Unlike `usePairingStore`
  (a Zustand singleton that must outlive the DEVICE tab's blur/focus
  cycles), Live Workout is a stack route that genuinely unmounts on
  Discard/back — component/hook-local state disappearing on unmount is
  exactly the "no persistence, dropped entirely" behavior the ticket asks
  for, with no explicit reset code needed.
- **Derived values are computed on every render, never stored via their own
  `setState`.** `elapsedMs`/`averageBpm`/`maxBpm` are plain expressions over
  `samples`/`startedAt`, matching `useLiveHeartRate`'s own `status`
  derivation style (`bpm === null ? ... : isStale ? ... : ...`, computed
  inline rather than tracked as separate state).
- **`averageBpm` is returned unrounded**; rounding happens at the render
  site, matching where the existing BPM placeholder (`bpm ?? '--'`) is
  already formatted, keeping the hook's data reusable by a future
  save/summary feature at full precision.
- All new copy renders via `t('liveWorkout.stats.…')`, per `CLAUDE.md`'s
  i18n rule; the `'--'` placeholders are a continuation of the existing,
  already-shipped inline convention, not a new deviation.
- `src/hooks/use-workout-session.ts` is new but colocated with its test
  under `src/hooks/__tests__/`, matching every existing precedent.

## Acceptance Criteria

- [ ] `useLiveHeartRate`'s returned `lastReadingAt` is `null` until the first
      valid reading, then set to that reading's `Date.now()` value; a
      subsequent reading (even with an identical BPM value) sets a new,
      different `lastReadingAt`.
- [ ] `lastReadingAt` does **not** change when the staleness threshold
      elapses with no new reading (only `status` moves to `'stale'`).
- [ ] `useLiveHeartRate`'s pre-existing test cases all pass with the added
      `lastReadingAt` field in each assertion; no other assertion changes.
- [ ] `useWorkoutSession(null, null)` returns `{ startedAt: <mount time>,
    samples: [], elapsedMs: 0 (at mount), averageBpm: null, maxBpm: null }`.
- [ ] Calling with a sequence of distinct `(bpm, lastReadingAt)` pairs
      appends exactly one sample per pair, in arrival order, each with the
      given `bpm` and `timestamp` equal to the given `lastReadingAt`.
- [ ] Re-rendering with the same `(bpm, lastReadingAt)` pair as the previous
      render does not append a second sample.
- [ ] `averageBpm` equals the arithmetic mean of all appended `bpm` values;
      `maxBpm` equals their maximum; both recompute correctly as more
      samples are appended.
- [ ] With fake timers, advancing time with no new `(bpm, lastReadingAt)`
      pair still increases `elapsedMs` (asserted via `jest.advanceTimersByTime`
      and re-reading the hook's return).
- [ ] Live Workout renders `formatElapsed`'s mm:ss output, the rounded
      average BPM, and the max BPM, sourced from a mocked
      `useWorkoutSession` return value.
- [ ] Live Workout renders `'--'` for a null average and a null max BPM.
- [ ] Existing `live-workout.test.tsx` cases (guard branch, live/stale
      status, Discard, Save, dev-trigger, `connectionLost`/`reconnecting`/
      `reconnectFailed` regressions) pass with only the required
      `lastReadingAt` field added to mocked `useLiveHeartRate` return
      values — no assertion on existing rendered text changes.
- [ ] No new string is inline in JSX beyond the pre-existing `'--'`
      convention — all other new copy renders via `t(...)`.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: elapsed time, average BPM, and max BPM only, exactly as
  requested. No zones, no "% of max," no max-HR configuration (there is no
  user max-HR value anywhere in the app today — a separate ticket per the
  brief), no live trace graph (a separate ticket, though it will read from
  this same `samples` array per the brief), no actual persistence (Save
  stays an intentional no-op), and no pause/resume (elapsed is plain
  wall-clock from `startedAt` for the life of the screen; pausing would
  change what "elapsed" means and is deliberately deferred per the brief).
- **No cap on `samples` array growth.** A long session accumulates one
  entry per real HR notification (roughly 1/sec) for the life of the
  screen; unbounded growth is accepted as proportionate to a single live
  training session and not addressed by this ticket.
- **No hour rollover in `formatElapsed`.** Output is always `mm:ss`; a
  session exceeding 99 minutes shows a wider minutes segment rather than
  wrapping to `hh:mm:ss` — acceptable for this ticket's scope.
- **The guard branch (no connected device) still calls `useWorkoutSession`**,
  with inert `null`/`null` arguments, mirroring how it already calls
  `useLiveHeartRate(null, ...)` — its `startedAt`/`elapsedMs` tick in the
  background but are never rendered on that branch, an accepted, harmless
  side effect of "hooks are always called unconditionally," not a designed
  behavior.
- **A mid-session drop and auto-reconnect (per `auto-reconnect-after-drop`)
  requires no change to `useWorkoutSession` itself.** `bpm`/`lastReadingAt`
  simply stop changing during a drop (no new samples append, elapsed keeps
  advancing) and resume changing once a fresh reading arrives after
  reconnecting — the existing per-argument-change append rule handles both
  transitions with no new code path.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
