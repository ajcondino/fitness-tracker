import { ExerciseType, insertRecords } from 'react-native-health-connect';
import type { ExerciseSessionRecord, HeartRateRecord } from 'react-native-health-connect';

import type { WorkoutRecord } from '@/workout/workout-record';

/**
 * Framework-free (no React import) — mirrors `health-connect-client.ts`'s
 * "thin wrapper" shape, but owns the write side rather than the permission
 * side. See SPEC.md's Interfaces/API.
 */

// Google's own Health Connect write-data guidance recommends batching
// writes into a single insertRecords call of up to ~1000 records rather
// than one call per data point. The library's shipped type declarations
// don't state a hard per-HeartRateRecord sample cap, so this is a
// defensive design choice, not a confirmed platform limit — verify against
// a real device at implementation time.
const HEART_RATE_CHUNK_SIZE = 1000;

// Health Connect's IntervalRecords are not expected to accept a
// zero-length interval (a one-sample session, or a single-sample chunk
// landing on identical timestamps, would otherwise produce
// startTime === endTime) — bumps endMs to startMs + 1 whenever
// endMs <= startMs before ISO-encoding both. Verify this tolerance against
// a real device at implementation time.
function nonZeroInterval(startMs: number, endMs: number): { startTime: string; endTime: string } {
  const safeEndMs = endMs <= startMs ? startMs + 1 : endMs;
  return { startTime: new Date(startMs).toISOString(), endTime: new Date(safeEndMs).toISOString() };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Maps `record` to exactly one `ExerciseSessionRecord` and one or more
 * `HeartRateRecord`s, then calls `insertRecords` and returns the combined
 * resolved ids. Called only for a record with `samples.length >= 1` —
 * Save on Live Workout is already disabled at zero samples, so a
 * zero-sample `WorkoutRecord` can never reach this function.
 *
 * Two separate `insertRecords` calls, not one — confirmed on a real device
 * that Health Connect rejects a batch mixing record types ("All records
 * must have the same type"), contrary to this module's original single-call
 * design (see SPEC.md's now-superseded "single atomic call" design
 * decision). This means a failure partway through (the exercise session
 * insert succeeds, the heart-rate insert then fails) is possible — the
 * caller marks the whole record `'failed'` regardless, so a subsequent
 * retry re-inserts the exercise session too, which can leave a duplicate
 * exercise session in Health Connect for that edge case.
 *
 * All timestamps come from the record's own `startedAt`/`samples[].timestamp`
 * — never `Date.now()` — so a session synced long after the fact lands at
 * the correct point in the user's Health Connect timeline.
 *
 * Throws (never catches) on any failure — every failure mode here is the
 * caller's (`syncWorkoutSessionToHealthConnect`'s) to translate into the
 * persisted `'failed'` status.
 */
export async function writeWorkoutSessionToHealthConnect(record: WorkoutRecord): Promise<string[]> {
  const lastSampleAt = record.samples[record.samples.length - 1].timestamp;

  const exerciseRecord: ExerciseSessionRecord = {
    recordType: 'ExerciseSession',
    exerciseType: ExerciseType.OTHER_WORKOUT,
    ...nonZeroInterval(record.startedAt, lastSampleAt),
  };

  const heartRateRecords: HeartRateRecord[] = chunk(record.samples, HEART_RATE_CHUNK_SIZE).map(
    (samplesChunk) => ({
      recordType: 'HeartRate',
      ...nonZeroInterval(
        samplesChunk[0].timestamp,
        samplesChunk[samplesChunk.length - 1].timestamp,
      ),
      samples: samplesChunk.map((sample) => ({
        time: new Date(sample.timestamp).toISOString(),
        beatsPerMinute: sample.bpm,
      })),
    }),
  );

  // Two calls — insertRecords rejects a mixed-type batch on a real device.
  // See the JSDoc above for the partial-failure implication.
  const exerciseIds = await insertRecords([exerciseRecord]);
  const heartRateIds = await insertRecords(heartRateRecords);
  return [...exerciseIds, ...heartRateIds];
}
