import type { HeartRateSample, WorkoutPause } from '@/hooks/use-workout-session';

/**
 * Framework-free (no BLE/Zustand/React/AsyncStorage import): types and pure
 * derivation only, mirroring `pairing-types.ts`'s "framework-free, pure
 * derivations" layer.
 */

export const WORKOUT_RECORD_SCHEMA_VERSION = 1;

export type WorkoutDevice = {
  id: string;
  // Mirrors SavedDevice.name's rule exactly: the resolved display name at
  // save time, or null — never a translated placeholder. Screens re-derive
  // the "Unknown device" fallback at render time, same as SavedDevice.
  name: string | null;
};

// WorkoutPause is now owned by use-workout-session.ts (the only place a
// pause is ever opened or closed) and re-exported here via a type-only
// import, mirroring how HeartRateSample already lives there.
export type { WorkoutPause };

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
  pausedMs: number;
};

/** Overlap, in ms, between the two closed intervals [aStart, aEnd] and
 * [bStart, bEnd] — 0 if they don't overlap. */
function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Pure function of its `WorkoutRecord` argument alone — no I/O, no BLE, no
 * store. Deliberately re-implements, rather than imports,
 * `useWorkoutSession`'s average/max math — see SPEC.md's Style &
 * Conventions for why.
 */
export function deriveWorkoutSummary(record: WorkoutRecord): WorkoutSummary {
  const { samples, startedAt, pauses } = record;
  if (samples.length === 0) {
    return { durationMs: 0, averageBpm: null, maxBpm: null, pausedMs: 0 };
  }

  const lastReadingAt = samples[samples.length - 1].timestamp;
  // Each pause is clamped to [startedAt, lastReadingAt] before being
  // subtracted, rather than assuming it falls fully inside that window — a
  // pause opened after the last real reading arrived would otherwise be
  // subtracted from a wall-clock span it never occupied. Every pause this
  // app's own pause()/resume()/stop() implementation ever produces is fully
  // bounded by [startedAt, <stop-time>], so in the common case this clamp
  // is a no-op.
  const pausedMs = pauses.reduce(
    (sum, p) => sum + overlapMs(startedAt, lastReadingAt, p.startedAt, p.endedAt),
    0,
  );
  const durationMs = Math.max(0, lastReadingAt - startedAt - pausedMs);
  const averageBpm = samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length;
  const maxBpm = Math.max(...samples.map((s) => s.bpm));

  return { durationMs, averageBpm, maxBpm, pausedMs };
}

/**
 * Not cryptographically unique, but collision-proof enough for a
 * single-device, sequential-saves app — see SPEC.md's Dependencies for why
 * this is a small local helper instead of `expo-crypto`'s `randomUUID()`.
 */
export function createWorkoutId(startedAt: number): string {
  return `${startedAt}-${Math.random().toString(36).slice(2, 10)}`;
}

export type WeeklyTotals = {
  totalDurationMs: number;
  sessionCount: number;
  averageBpm: number | null;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rolls up every record started within the last 7 days of `now` into the
 * History screen's stat card. `now` is a parameter rather than read
 * internally so this stays pure/testable, same as `deriveWorkoutSummary`.
 * Reuses `deriveWorkoutSummary` per record rather than re-deriving duration
 * or average BPM from `samples` directly.
 */
export function deriveWeeklyTotals(records: WorkoutRecord[], now: number): WeeklyTotals {
  const recent = records.filter((record) => now - record.startedAt < SEVEN_DAYS_MS);
  const summaries = recent.map(deriveWorkoutSummary);

  const totalDurationMs = summaries.reduce((sum, summary) => sum + summary.durationMs, 0);

  // A record with no samples has a null averageBpm — excluded from the mean
  // entirely, not treated as a 0, so a zero-sample session can't drag the
  // week's average down.
  const averageBpms = summaries
    .map((summary) => summary.averageBpm)
    .filter((bpm): bpm is number => bpm != null);
  const averageBpm =
    averageBpms.length > 0
      ? averageBpms.reduce((sum, bpm) => sum + bpm, 0) / averageBpms.length
      : null;

  return { totalDurationMs, sessionCount: recent.length, averageBpm };
}
