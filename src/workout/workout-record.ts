import type { HeartRateSample } from '@/hooks/use-workout-session';

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

/**
 * Placeholder shape for a closed pause interval. Nothing in this ticket
 * ever writes an entry — `pauses` is always `[]` on every record this
 * ticket saves. Reserved purely so pause/resume (the next ticket) has a
 * field to write into without migrating already-saved records; its exact
 * shape may still be revised by that ticket (WORKOUT_RECORD_SCHEMA_VERSION
 * exists for exactly that eventuality).
 */
export type WorkoutPause = { startedAt: number; endedAt: number };

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
};

/**
 * Pure function of its `WorkoutRecord` argument alone — no I/O, no BLE, no
 * store. Deliberately re-implements, rather than imports,
 * `useWorkoutSession`'s average/max math — see SPEC.md's Style &
 * Conventions for why.
 */
export function deriveWorkoutSummary(record: WorkoutRecord): WorkoutSummary {
  const { samples, startedAt } = record;
  if (samples.length === 0) {
    return { durationMs: 0, averageBpm: null, maxBpm: null };
  }

  const durationMs = samples[samples.length - 1].timestamp - startedAt;
  const averageBpm = samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length;
  const maxBpm = Math.max(...samples.map((s) => s.bpm));

  return { durationMs, averageBpm, maxBpm };
}

/**
 * Not cryptographically unique, but collision-proof enough for a
 * single-device, sequential-saves app — see SPEC.md's Dependencies for why
 * this is a small local helper instead of `expo-crypto`'s `randomUUID()`.
 */
export function createWorkoutId(startedAt: number): string {
  return `${startedAt}-${Math.random().toString(36).slice(2, 10)}`;
}
