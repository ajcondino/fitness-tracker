import {
  createWorkoutId,
  deriveWeeklyTotals,
  deriveWorkoutSummary,
  describeSessionTime,
} from '@/workout/workout-record';
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
      pausedMs: 0,
    });
  });

  it('returns pausedMs 0, not the pause length, for a record with pauses but 0 samples', () => {
    const record = makeRecord({
      startedAt: 1_000,
      samples: [],
      pauses: [{ startedAt: 2_000, endedAt: 5_000 }],
    });

    expect(deriveWorkoutSummary(record)).toEqual({
      durationMs: 0,
      averageBpm: null,
      maxBpm: null,
      pausedMs: 0,
    });
  });

  it('returns durationMs 0 and averageBpm/maxBpm equal to the single sample for a 1-sample record', () => {
    const record = makeRecord({ startedAt: 1_000, samples: [{ bpm: 140, timestamp: 1_000 }] });

    expect(deriveWorkoutSummary(record)).toEqual({
      durationMs: 0,
      averageBpm: 140,
      maxBpm: 140,
      pausedMs: 0,
    });
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
      pausedMs: 0,
    });
  });

  it('subtracts a single pause fully inside the sample span from durationMs', () => {
    const record = makeRecord({
      startedAt: 1_000,
      samples: [
        { bpm: 120, timestamp: 1_000 },
        { bpm: 140, timestamp: 5_000 },
        { bpm: 130, timestamp: 11_000 },
      ],
      pauses: [{ startedAt: 6_000, endedAt: 8_000 }],
    });

    expect(deriveWorkoutSummary(record)).toEqual({
      durationMs: 8_000,
      averageBpm: 130,
      maxBpm: 140,
      pausedMs: 2_000,
    });
  });

  it('does not reduce durationMs for a pause opened after the last sample', () => {
    const record = makeRecord({
      startedAt: 1_000,
      samples: [
        { bpm: 120, timestamp: 1_000 },
        { bpm: 140, timestamp: 5_000 },
        { bpm: 130, timestamp: 11_000 },
      ],
      pauses: [{ startedAt: 12_000, endedAt: 15_000 }],
    });

    expect(deriveWorkoutSummary(record)).toEqual({
      durationMs: 10_000,
      averageBpm: 130,
      maxBpm: 140,
      pausedMs: 0,
    });
  });

  it('subtracts multiple non-overlapping pauses', () => {
    const record = makeRecord({
      startedAt: 1_000,
      samples: [
        { bpm: 120, timestamp: 1_000 },
        { bpm: 140, timestamp: 5_000 },
        { bpm: 100, timestamp: 8_000 },
        { bpm: 130, timestamp: 11_000 },
      ],
      pauses: [
        { startedAt: 3_000, endedAt: 4_000 },
        { startedAt: 6_000, endedAt: 7_000 },
      ],
    });

    expect(deriveWorkoutSummary(record)).toEqual({
      durationMs: 8_000,
      averageBpm: 122.5,
      maxBpm: 140,
      pausedMs: 2_000,
    });
  });
});

describe('deriveWeeklyTotals', () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = 100 * SEVEN_DAYS_MS; // arbitrary "now" far from epoch 0

  it('returns zeroed, never-NaN totals for an empty list', () => {
    expect(deriveWeeklyTotals([], now)).toEqual({
      totalDurationMs: 0,
      sessionCount: 0,
      averageBpm: null,
    });
  });

  it('excludes every record older than 7 days from now', () => {
    const record = makeRecord({
      startedAt: now - SEVEN_DAYS_MS - 1,
      samples: [
        { bpm: 120, timestamp: now - SEVEN_DAYS_MS - 1 },
        { bpm: 140, timestamp: now - SEVEN_DAYS_MS + 1_000 },
      ],
    });

    expect(deriveWeeklyTotals([record], now)).toEqual({
      totalDurationMs: 0,
      sessionCount: 0,
      averageBpm: null,
    });
  });

  it('sums duration and counts only in-window records, ignoring out-of-window ones', () => {
    const inWindow = makeRecord({
      id: 'workout-in',
      startedAt: now - 1_000,
      samples: [
        { bpm: 120, timestamp: now - 1_000 },
        { bpm: 140, timestamp: now },
      ],
    });
    const outOfWindow = makeRecord({
      id: 'workout-out',
      startedAt: now - SEVEN_DAYS_MS - 10_000,
      samples: [
        { bpm: 100, timestamp: now - SEVEN_DAYS_MS - 10_000 },
        { bpm: 100, timestamp: now - SEVEN_DAYS_MS - 5_000 },
      ],
    });

    expect(deriveWeeklyTotals([inWindow, outOfWindow], now)).toEqual({
      totalDurationMs: 1_000,
      sessionCount: 1,
      averageBpm: 130,
    });
  });

  it('excludes a record with a null averageBpm from the mean instead of counting it as 0', () => {
    const zeroSampleRecord = makeRecord({ id: 'workout-empty', startedAt: now, samples: [] });
    const withSamples = makeRecord({
      id: 'workout-with-samples',
      startedAt: now,
      samples: [{ bpm: 150, timestamp: now }],
    });

    expect(deriveWeeklyTotals([zeroSampleRecord, withSamples], now)).toEqual({
      totalDurationMs: 0,
      sessionCount: 2,
      averageBpm: 150,
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

describe('describeSessionTime', () => {
  it('returns "morning" for an hour within 05:00–11:59', () => {
    expect(describeSessionTime(new Date(2026, 0, 1, 8, 0))).toBe('morning');
  });

  it('returns "afternoon" for an hour within 12:00–16:59', () => {
    expect(describeSessionTime(new Date(2026, 0, 1, 14, 0))).toBe('afternoon');
  });

  it('returns "evening" for an hour within 17:00–21:59', () => {
    expect(describeSessionTime(new Date(2026, 0, 1, 19, 0))).toBe('evening');
  });

  it('returns "night" for an hour within 22:00–04:59', () => {
    expect(describeSessionTime(new Date(2026, 0, 1, 23, 0))).toBe('night');
  });

  it('returns "night" at the 04:59 edge', () => {
    expect(describeSessionTime(new Date(2026, 0, 1, 4, 59))).toBe('night');
  });

  it('returns "morning" at the 05:00 edge', () => {
    expect(describeSessionTime(new Date(2026, 0, 1, 5, 0))).toBe('morning');
  });
});
