import { migrateWorkoutRecord } from '@/workout/workout-migrations';
import type { LegacyWorkoutRecord } from '@/workout/workout-migrations';

function makeM1Record(): LegacyWorkoutRecord {
  return {
    schemaVersion: 1,
    id: 'workout-1',
    startedAt: 1_000,
    samples: [{ bpm: 120, timestamp: 1_000 }],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    // no healthConnect, no source — predates both fields.
  };
}

function makeM2Record(): LegacyWorkoutRecord {
  return {
    schemaVersion: 2,
    id: 'workout-1',
    startedAt: 1_000,
    samples: [{ bpm: 120, timestamp: 1_000 }],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'written', recordIds: ['exercise-1'] },
    // no source — predates it.
  };
}

function makeM3Record(): LegacyWorkoutRecord {
  return {
    schemaVersion: 3,
    id: 'workout-1',
    startedAt: 1_000,
    samples: [{ bpm: 120, timestamp: 1_000 }],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'notWritten', recordIds: [] },
    source: 'recorded',
    // no activityType — predates it.
  };
}

describe('migrateWorkoutRecord', () => {
  it('upgrades an M1-shaped record to schemaVersion 4 with healthConnect, source, and activityType defaulted', () => {
    const migrated = migrateWorkoutRecord(makeM1Record());

    expect(migrated).toEqual({
      schemaVersion: 4,
      id: 'workout-1',
      startedAt: 1_000,
      samples: [{ bpm: 120, timestamp: 1_000 }],
      device: { id: 'device-1', name: 'Pulse HRM' },
      pauses: [],
      healthConnect: { status: 'notWritten', recordIds: [] },
      source: 'recorded',
      activityType: null,
    });
  });

  it('upgrades an M2-shaped record to schemaVersion 4, preserving its original healthConnect value', () => {
    const migrated = migrateWorkoutRecord(makeM2Record());

    expect(migrated).toEqual({
      schemaVersion: 4,
      id: 'workout-1',
      startedAt: 1_000,
      samples: [{ bpm: 120, timestamp: 1_000 }],
      device: { id: 'device-1', name: 'Pulse HRM' },
      pauses: [],
      healthConnect: { status: 'written', recordIds: ['exercise-1'] },
      source: 'recorded',
      activityType: null,
    });
  });

  it('upgrades an M3-shaped record to schemaVersion 4 with activityType defaulted to null', () => {
    const migrated = migrateWorkoutRecord(makeM3Record());

    expect(migrated).toEqual({
      schemaVersion: 4,
      id: 'workout-1',
      startedAt: 1_000,
      samples: [{ bpm: 120, timestamp: 1_000 }],
      device: { id: 'device-1', name: 'Pulse HRM' },
      pauses: [],
      healthConnect: { status: 'notWritten', recordIds: [] },
      source: 'recorded',
      activityType: null,
    });
  });

  it('is idempotent on the M1-shaped record: migrating its own output again returns a deep-equal result', () => {
    const once = migrateWorkoutRecord(makeM1Record());
    const twice = migrateWorkoutRecord(once as LegacyWorkoutRecord);

    expect(twice).toEqual(once);
  });

  it('is idempotent on the M2-shaped record: migrating its own output again returns a deep-equal result', () => {
    const once = migrateWorkoutRecord(makeM2Record());
    const twice = migrateWorkoutRecord(once as LegacyWorkoutRecord);

    expect(twice).toEqual(once);
  });

  it('is idempotent on the M3-shaped record: migrating its own output again returns a deep-equal result', () => {
    const once = migrateWorkoutRecord(makeM3Record());
    const twice = migrateWorkoutRecord(once as LegacyWorkoutRecord);

    expect(twice).toEqual(once);
  });

  it('passes through a record already at the current schemaVersion unchanged', () => {
    const current: LegacyWorkoutRecord = {
      schemaVersion: 4,
      id: 'workout-1',
      startedAt: 1_000,
      samples: [],
      device: { id: 'device-1', name: 'Pulse HRM' },
      pauses: [],
      healthConnect: { status: 'notWritten', recordIds: [] },
      source: 'recorded',
      activityType: 'run',
    };

    expect(migrateWorkoutRecord(current)).toEqual(current);
  });

  it('passes through a record at a hypothetical future schemaVersion unchanged', () => {
    const future: LegacyWorkoutRecord = {
      schemaVersion: 5,
      id: 'workout-1',
      startedAt: 1_000,
      samples: [],
      device: { id: 'device-1', name: 'Pulse HRM' },
      pauses: [],
      healthConnect: { status: 'notWritten', recordIds: [] },
      source: 'recorded',
      activityType: 'run',
      route: [],
    };

    expect(migrateWorkoutRecord(future)).toEqual(future);
  });
});
