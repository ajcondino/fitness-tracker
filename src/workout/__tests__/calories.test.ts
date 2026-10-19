import type { WeightEntry } from '@/weight/weight-store';
import {
  MET_BY_ACTIVITY,
  deriveSessionCalories,
  estimateCalories,
  pickWeightKg,
} from '@/workout/calories';
import type { WorkoutRecord } from '@/workout/workout-record';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 4,
    id: 'workout-1',
    startedAt: 1_000_000,
    samples: [
      { bpm: 120, timestamp: 1_000_000 },
      { bpm: 140, timestamp: 1_000_000 + HOUR_MS },
    ],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'notWritten', recordIds: [] },
    source: 'recorded',
    activityType: 'run',
    ...overrides,
  };
}

function makeEntry(recordedAt: number, kg: number): WeightEntry {
  return {
    id: `entry-${recordedAt}`,
    recordedAt,
    kg,
    healthConnect: { status: 'notWritten', recordId: null },
  };
}

describe('MET_BY_ACTIVITY', () => {
  it('holds only finite numbers > 0 or null', () => {
    for (const met of Object.values(MET_BY_ACTIVITY)) {
      if (met !== null) {
        expect(Number.isFinite(met)).toBe(true);
        expect(met).toBeGreaterThan(0);
      }
    }
  });

  it('has no MET for other', () => {
    expect(MET_BY_ACTIVITY.other).toBeNull();
  });
});

describe('estimateCalories', () => {
  it.each([
    ['run', 686],
    ['walk', 245],
    ['cycle', 525],
    ['strength', 245],
  ] as const)('returns the hand-computed value for %s at 70 kg × 1 h', (activityType, kcal) => {
    expect(estimateCalories({ activityType, weightKg: 70, durationMs: HOUR_MS })).toBe(kcal);
  });

  it('rounds a non-integer result to the nearest whole kcal', () => {
    // 9.8 × 82.5 × 0.75 = 606.375
    expect(
      estimateCalories({ activityType: 'run', weightKg: 82.5, durationMs: 45 * MINUTE_MS }),
    ).toBe(606);
  });

  it('returns null for other and for a null activity type', () => {
    expect(
      estimateCalories({ activityType: 'other', weightKg: 70, durationMs: HOUR_MS }),
    ).toBeNull();
    expect(estimateCalories({ activityType: null, weightKg: 70, durationMs: HOUR_MS })).toBeNull();
  });

  it.each([null, 0, -70, NaN, Infinity])('returns null for weightKg %p', (weightKg) => {
    expect(estimateCalories({ activityType: 'run', weightKg, durationMs: HOUR_MS })).toBeNull();
  });

  it.each([0, -1, NaN, Infinity])('returns null for durationMs %p', (durationMs) => {
    expect(estimateCalories({ activityType: 'run', weightKg: 70, durationMs })).toBeNull();
  });
});

describe('pickWeightKg', () => {
  it('picks the latest entry at or before startedAt', () => {
    const entries = [makeEntry(100, 70), makeEntry(200, 72), makeEntry(300, 74)];

    expect(pickWeightKg(entries, 250)).toBe(72);
  });

  it('counts an entry recorded exactly at startedAt', () => {
    const entries = [makeEntry(100, 70), makeEntry(200, 72)];

    expect(pickWeightKg(entries, 200)).toBe(72);
  });

  it('returns null when every entry is later than startedAt', () => {
    expect(pickWeightKg([makeEntry(300, 74)], 250)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(pickWeightKg([], 250)).toBeNull();
  });
});

describe('deriveSessionCalories', () => {
  const entries = [makeEntry(0, 70)];

  it('computes from active duration, weight at session start and activity type', () => {
    expect(deriveSessionCalories(makeRecord(), entries)).toBe(686);
  });

  it('excludes paused time (60 min wall-clock, 15 min pause ⇒ 0.75 h)', () => {
    const startedAt = 1_000_000;
    const record = makeRecord({
      pauses: [{ startedAt: startedAt + 10 * MINUTE_MS, endedAt: startedAt + 25 * MINUTE_MS }],
    });

    // 9.8 × 70 × 0.75 = 514.5 → 515
    expect(deriveSessionCalories(record, entries)).toBe(515);
  });

  it('uses the weight in effect at the session start, not the latest', () => {
    const history = [makeEntry(0, 70), makeEntry(2_000_000, 100)];

    expect(deriveSessionCalories(makeRecord(), history)).toBe(686);
  });

  it('returns null while entries are still loading', () => {
    expect(deriveSessionCalories(makeRecord(), undefined)).toBeNull();
  });

  it('returns null for a zero-sample record', () => {
    expect(deriveSessionCalories(makeRecord({ samples: [] }), entries)).toBeNull();
  });

  it('returns null for a null activityType and for other', () => {
    expect(deriveSessionCalories(makeRecord({ activityType: null }), entries)).toBeNull();
    expect(deriveSessionCalories(makeRecord({ activityType: 'other' }), entries)).toBeNull();
  });

  it('returns null when the session predates the first weight entry', () => {
    expect(deriveSessionCalories(makeRecord(), [makeEntry(5_000_000, 70)])).toBeNull();
  });
});
