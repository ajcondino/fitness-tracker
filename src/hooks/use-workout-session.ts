import { useEffect, useRef, useState } from 'react';

/** One heart-rate reading, timestamped at the moment it arrived. The unit
 * this ticket's data model is built around — average/max/elapsed today,
 * and (per the ticket's explicit intent) a future save/summary feature and
 * time-in-zone derivation later, all from this same array, with no
 * restructuring and no re-recording. */
export type HeartRateSample = {
  bpm: number;
  timestamp: number; // Date.now() at the moment the reading arrived
};

/** One closed pause interval. Only ever appended on Resume (closing the
 * pause that Pause opened) or on Stop-while-paused (closing the trailing,
 * never-resumed pause at the moment the session ends) — never mutated after
 * being appended. Lives here (rather than in workout-record.ts) because this
 * hook is the only place a pause is ever opened or closed — the single owner
 * of the shape, mirroring how `HeartRateSample` already lives here and is
 * imported into `workout-record.ts` rather than the other way around. */
export type WorkoutPause = { startedAt: number; endedAt: number };

export type SessionPhase = 'idle' | 'running' | 'paused' | 'ended';

/** Everything the screen needs, entirely derived from state internal to this
 * hook — no field here is independently tracked beyond phase/samples/pauses/
 * accumulatedMs. */
export type WorkoutSessionSnapshot = {
  phase: SessionPhase;
  startedAt: number | null; // set once, on the first start(); null while idle
  samples: HeartRateSample[]; // unchanged shape; now only ever appended while phase === 'running'
  pauses: WorkoutPause[]; // closed intervals only, in the order they closed
  elapsedMs: number; // accumulated *active* running time; frozen while paused/idle/ended
  averageBpm: number | null; // mean of samples[].bpm; null when samples is empty
  maxBpm: number | null; // max of samples[].bpm; null when samples is empty
  start: () => void; // idle -> running; no-op otherwise
  pause: () => void; // running -> paused; no-op otherwise
  resume: () => void; // paused -> running; no-op otherwise
  stop: () => void; // running | paused -> ended; no-op otherwise
};

/** How often the hook forces a re-render so `elapsedMs` visibly ticks
 * forward even when no new sample has arrived (a dropout, or simply the
 * gap between two ~1Hz readings). Matches "mm:ss" display granularity —
 * no benefit to a finer interval. Runs for the whole life of the hook,
 * independent of `phase` — see SPEC.md's Style & Conventions. */
export const ELAPSED_TICK_INTERVAL_MS = 1_000;

/**
 * Owns the Start/Pause/Resume/Stop session phase machine and derives
 * elapsed active time, average BPM, and max BPM from the samples appended
 * while `phase === 'running'`. Takes two primitives rather than reading
 * `useLiveHeartRate` or any BLE/store module itself, so it stays testable
 * in isolation (see SPEC.md's Style & Conventions).
 *
 * Always called unconditionally (rules of hooks) — `bpm`/`lastReadingAt`
 * are simply `null` for the life of a render with no connected device, an
 * inert result that is never displayed.
 */
export function useWorkoutSession(
  bpm: number | null,
  lastReadingAt: number | null,
): WorkoutSessionSnapshot {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [samples, setSamples] = useState<HeartRateSample[]>([]);
  const [pauses, setPauses] = useState<WorkoutPause[]>([]);
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [, setTick] = useState(0);
  const runningSinceRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const lastAppendedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (bpm == null || lastReadingAt == null) return;
    if (phase !== 'running') return; // no sample while idle, paused, or ended
    if (lastAppendedAtRef.current === lastReadingAt) return; // already recorded
    lastAppendedAtRef.current = lastReadingAt;
    setSamples((prev) => [...prev, { bpm, timestamp: lastReadingAt }]);
  }, [bpm, lastReadingAt, phase]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTick((n) => n + 1);
    }, ELAPSED_TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

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
    // Captured into a local before the ref is nulled below — a functional
    // setState updater runs later, when React processes this render's state
    // queue, by which point a ref mutated further down this same function
    // would already read as its new value if dereferenced inside the
    // updater instead.
    const runningSince = runningSinceRef.current;
    setAccumulatedMs((prev) => prev + (now - (runningSince ?? now)));
    runningSinceRef.current = null;
    pausedAtRef.current = now;
    setPhase('paused');
  }

  function resume() {
    if (phase !== 'paused') return;
    const now = Date.now();
    const pausedAt = pausedAtRef.current; // see pause()'s comment
    setPauses((prev) => [...prev, { startedAt: pausedAt ?? now, endedAt: now }]);
    pausedAtRef.current = null;
    runningSinceRef.current = now;
    setPhase('running');
  }

  function stop() {
    if (phase !== 'running' && phase !== 'paused') return;
    const now = Date.now();
    if (phase === 'running') {
      const runningSince = runningSinceRef.current; // see pause()'s comment
      setAccumulatedMs((prev) => prev + (now - (runningSince ?? now)));
      runningSinceRef.current = null;
    } else {
      const pausedAt = pausedAtRef.current; // see pause()'s comment
      setPauses((prev) => [...prev, { startedAt: pausedAt ?? now, endedAt: now }]);
      pausedAtRef.current = null;
    }
    setPhase('ended');
  }

  const elapsedMs =
    accumulatedMs +
    (phase === 'running' && runningSinceRef.current != null
      ? Date.now() - runningSinceRef.current
      : 0);
  const averageBpm =
    samples.length === 0 ? null : samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length;
  const maxBpm = samples.length === 0 ? null : Math.max(...samples.map((s) => s.bpm));

  return {
    phase,
    startedAt,
    samples,
    pauses,
    elapsedMs,
    averageBpm,
    maxBpm,
    start,
    pause,
    resume,
    stop,
  };
}
