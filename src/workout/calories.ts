import type { WeightEntry } from '@/weight/weight-store';
import { deriveWorkoutSummary } from '@/workout/workout-record';
import type { ActivityType, WorkoutRecord } from '@/workout/workout-record';

/**
 * Framework-free (no React/AsyncStorage/store import — type imports only):
 * pure derivation, same layer as `workout-record.ts`. See
 * docs/specs/met-calorie-calculation/SPEC.md.
 */

export type MetTable = Record<ActivityType, number | null>;

export type CalorieInput = {
  activityType: ActivityType | null;
  weightKg: number | null;
  durationMs: number; // ACTIVE duration (pauses excluded), as from deriveWorkoutSummary
};

// Compendium of Physical Activities, general/moderate-effort entries. The app
// records no pace/speed to refine them. `other` is null on purpose: no
// defensible single MET exists, so no estimate beats a fabricated one.
export const MET_BY_ACTIVITY: MetTable = {
  run: 9.8,
  walk: 3.5,
  cycle: 7.5,
  strength: 3.5,
  other: null,
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * MET × kg × hours, rounded to the nearest whole kcal. Returns null — never 0,
 * NaN or a guess — when activityType is null or has a null MET, weightKg is
 * null/non-finite/<= 0, or durationMs is non-finite/<= 0.
 */
export function estimateCalories({
  activityType,
  weightKg,
  durationMs,
}: CalorieInput): number | null {
  if (activityType == null) return null;
  const met = MET_BY_ACTIVITY[activityType];
  if (met == null) return null;
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  return Math.round(met * weightKg * (durationMs / HOUR_MS));
}

/**
 * The most recent entry with recordedAt <= startedAt, else null.
 * `entries` is ascending by recordedAt (loadWeightEntries' contract); the
 * function does not re-sort. An entry recorded exactly at startedAt counts.
 */
export function pickWeightKg(entries: readonly WeightEntry[], startedAt: number): number | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].recordedAt <= startedAt) return entries[i].kg;
  }
  return null;
}

/**
 * Composition used by the screens: active duration from deriveWorkoutSummary,
 * weight from pickWeightKg, then estimateCalories. Returns null while
 * `entries` is undefined (still loading) as well as for every suppress case.
 */
export function deriveSessionCalories(
  record: WorkoutRecord,
  entries: readonly WeightEntry[] | undefined,
): number | null {
  if (entries === undefined) return null;

  return estimateCalories({
    activityType: record.activityType,
    weightKg: pickWeightKg(entries, record.startedAt),
    durationMs: deriveWorkoutSummary(record).durationMs,
  });
}
