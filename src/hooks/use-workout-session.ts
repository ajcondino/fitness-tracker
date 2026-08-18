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

/**
 * Accumulates a timestamped HR sample for the life of the screen and
 * derives elapsed time, average BPM, and max BPM from that sample array —
 * none of the three is ever tracked as its own state. Takes two primitives
 * rather than reading `useLiveHeartRate` or any BLE/store module itself, so
 * it stays testable in isolation (see SPEC.md's Style & Conventions).
 *
 * Always called unconditionally (rules of hooks) — `bpm`/`lastReadingAt`
 * are simply `null` for the life of a render with no connected device, an
 * inert result that is never displayed.
 */
export function useWorkoutSession(
  bpm: number | null,
  lastReadingAt: number | null,
): WorkoutSessionSnapshot {
  const [startedAt] = useState(() => Date.now());
  const [samples, setSamples] = useState<HeartRateSample[]>([]);
  const [, setTick] = useState(0);
  const lastAppendedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (bpm == null || lastReadingAt == null) return;
    if (lastAppendedAtRef.current === lastReadingAt) return; // already recorded
    lastAppendedAtRef.current = lastReadingAt;
    setSamples((prev) => [...prev, { bpm, timestamp: lastReadingAt }]);
  }, [bpm, lastReadingAt]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTick((n) => n + 1);
    }, ELAPSED_TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  const elapsedMs = Date.now() - startedAt;
  const averageBpm =
    samples.length === 0 ? null : samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length;
  const maxBpm = samples.length === 0 ? null : Math.max(...samples.map((s) => s.bpm));

  return { startedAt, samples, elapsedMs, averageBpm, maxBpm };
}
