import {
  WORKOUT_RECORD_SCHEMA_VERSION,
  bucketHeartRateSamples,
  createWorkoutId,
  deriveWeeklyTotals,
  deriveWorkoutSummary,
  describeSessionTime,
} from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: WORKOUT_RECORD_SCHEMA_VERSION,
    id: 'workout-1',
    startedAt: 0,
    samples: [],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'notWritten', recordIds: [] },
    ...overrides,
  };
}

describe('WORKOUT_RECORD_SCHEMA_VERSION', () => {
  it('is 2', () => {
    expect(WORKOUT_RECORD_SCHEMA_VERSION).toBe(2);
  });
});

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

describe('bucketHeartRateSamples', () => {
  it('returns an array of bucketCount nulls for 0 samples', () => {
    expect(bucketHeartRateSamples([], { start: 0, end: 10_000 }, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('returns an array of bucketCount nulls when range.end <= range.start', () => {
    const samples = [{ bpm: 120, timestamp: 5_000 }];

    expect(bucketHeartRateSamples(samples, { start: 10_000, end: 10_000 }, 3)).toEqual([
      null,
      null,
      null,
    ]);
    expect(bucketHeartRateSamples(samples, { start: 10_000, end: 5_000 }, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('returns [] for bucketCount <= 0', () => {
    const samples = [{ bpm: 120, timestamp: 5_000 }];

    expect(bucketHeartRateSamples(samples, { start: 0, end: 10_000 }, 0)).toEqual([]);
    expect(bucketHeartRateSamples(samples, { start: 0, end: 10_000 }, -1)).toEqual([]);
  });

  it('counts a sample exactly at range.end in the last bucket, not out of bounds', () => {
    const samples = [{ bpm: 150, timestamp: 10_000 }];

    expect(bucketHeartRateSamples(samples, { start: 0, end: 10_000 }, 4)).toEqual([
      null,
      null,
      null,
      150,
    ]);
  });

  it('excludes samples outside [range.start, range.end] from every bucket', () => {
    const samples = [
      { bpm: 100, timestamp: -1 },
      { bpm: 200, timestamp: 10_001 },
    ];

    expect(bucketHeartRateSamples(samples, { start: 0, end: 10_000 }, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('produces the per-bucket arithmetic mean for samples spread across several buckets', () => {
    const samples = [
      { bpm: 100, timestamp: 0 },
      { bpm: 120, timestamp: 1_000 },
      { bpm: 140, timestamp: 5_000 },
      { bpm: 160, timestamp: 9_000 },
      { bpm: 180, timestamp: 9_500 },
    ];

    expect(bucketHeartRateSamples(samples, { start: 0, end: 10_000 }, 4)).toEqual([
      110, // [0, 2500): 100, 120
      null, // [2500, 5000): empty
      140, // [5000, 7500): 140
      170, // [7500, 10000]: 160, 180
    ]);
  });

  it('renders a multi-minute gap in the middle of the sample set as null buckets, unaffected on both sides', () => {
    const samples = [
      { bpm: 120, timestamp: 0 },
      { bpm: 125, timestamp: 60_000 },
      // ~4-minute gap
      { bpm: 130, timestamp: 295_000 },
      { bpm: 135, timestamp: 350_000 },
    ];

    expect(bucketHeartRateSamples(samples, { start: 0, end: 360_000 }, 6)).toEqual([
      120, // [0, 60000): 120
      125, // [60000, 120000): 125
      null, // [120000, 180000): empty
      null, // [180000, 240000): empty
      130, // [240000, 300000): 130
      135, // [300000, 360000]: 135
    ]);
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
