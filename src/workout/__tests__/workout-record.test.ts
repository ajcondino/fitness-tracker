import { createWorkoutId, deriveWorkoutSummary } from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 1,
    id: 'workout-1',
    startedAt: 0,
    samples: [],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    ...overrides,
  };
}

describe('deriveWorkoutSummary', () => {
  it('returns zeroed, never-NaN stats for a record with 0 samples', () => {
    const record = makeRecord({ samples: [] });

    expect(deriveWorkoutSummary(record)).toEqual({
      durationMs: 0,
      averageBpm: null,
      maxBpm: null,
    });
  });

  it('returns durationMs 0 and averageBpm/maxBpm equal to the single sample for a 1-sample record', () => {
    const record = makeRecord({ startedAt: 1_000, samples: [{ bpm: 140, timestamp: 1_000 }] });

    expect(deriveWorkoutSummary(record)).toEqual({ durationMs: 0, averageBpm: 140, maxBpm: 140 });
  });

  it('returns the correct mean, max, and duration for a multi-sample record', () => {
    const record = makeRecord({
      startedAt: 1_000,
      samples: [
        { bpm: 120, timestamp: 1_000 },
        { bpm: 140, timestamp: 5_000 },
        { bpm: 130, timestamp: 11_000 },
      ],
    });

    expect(deriveWorkoutSummary(record)).toEqual({
      durationMs: 10_000,
      averageBpm: 130,
      maxBpm: 140,
    });
  });
});

describe('createWorkoutId', () => {
  it('returns a string containing the given startedAt', () => {
    expect(createWorkoutId(123_456)).toContain('123456');
  });

  it('returns different ids for two calls with the same startedAt', () => {
    expect(createWorkoutId(123_456)).not.toEqual(createWorkoutId(123_456));
  });
});
