import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadWorkoutSession,
  loadWorkoutSessions,
  saveWorkoutSession,
} from '@/workout/workout-store';
import type { WorkoutRecord } from '@/workout/workout-record';

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 2,
    id: 'workout-1',
    startedAt: 1_000,
    samples: [{ bpm: 120, timestamp: 1_000 }],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'notWritten', recordIds: [] },
    ...overrides,
  };
}

describe('workout-store', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  describe('saveWorkoutSession / loadWorkoutSessions round-trip', () => {
    it('returns the saved record unchanged', async () => {
      const record = makeRecord();

      await saveWorkoutSession(record);

      expect(await loadWorkoutSessions()).toEqual([record]);
    });

    it('returns three saved sessions most-recent-first', async () => {
      const first = makeRecord({ id: 'workout-1', startedAt: 1_000 });
      const second = makeRecord({ id: 'workout-2', startedAt: 2_000 });
      const third = makeRecord({ id: 'workout-3', startedAt: 3_000 });

      await saveWorkoutSession(first);
      await saveWorkoutSession(second);
      await saveWorkoutSession(third);

      expect(await loadWorkoutSessions()).toEqual([third, second, first]);
    });

    it('swallows a thrown AsyncStorage error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

      await expect(saveWorkoutSession(makeRecord())).resolves.toBeUndefined();
    });
  });

  describe('loadWorkoutSessions', () => {
    it('resolves [] when nothing has been saved', async () => {
      expect(await loadWorkoutSessions()).toEqual([]);
    });

    it('resolves [] when the index key holds corrupt JSON', async () => {
      await AsyncStorage.setItem('workout.sessionIndex', 'not json{{{');

      expect(await loadWorkoutSessions()).toEqual([]);
    });

    it('resolves [], never throws, when AsyncStorage.getItem rejects', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadWorkoutSessions()).resolves.toEqual([]);
    });

    it('resolves [], never throws, when AsyncStorage.multiGet rejects', async () => {
      await AsyncStorage.setItem('workout.sessionIndex', JSON.stringify(['workout-1']));
      jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadWorkoutSessions()).resolves.toEqual([]);
    });

    it('skips an index entry whose backing record key is missing, without affecting the rest', async () => {
      const present = makeRecord({ id: 'workout-present' });
      await saveWorkoutSession(present);
      const ids = JSON.parse(
        (await AsyncStorage.getItem('workout.sessionIndex')) ?? '[]',
      ) as string[];
      await AsyncStorage.setItem(
        'workout.sessionIndex',
        JSON.stringify(['workout-missing', ...ids]),
      );

      expect(await loadWorkoutSessions()).toEqual([present]);
    });

    it('skips an index entry whose backing record holds invalid JSON, without affecting the rest', async () => {
      const present = makeRecord({ id: 'workout-present' });
      await saveWorkoutSession(present);
      await AsyncStorage.setItem('workout.session.workout-corrupt', 'not json{{{');
      const ids = JSON.parse(
        (await AsyncStorage.getItem('workout.sessionIndex')) ?? '[]',
      ) as string[];
      await AsyncStorage.setItem(
        'workout.sessionIndex',
        JSON.stringify(['workout-corrupt', ...ids]),
      );

      expect(await loadWorkoutSessions()).toEqual([present]);
    });
  });

  describe('loadWorkoutSession', () => {
    it('returns the saved record matching the given id', async () => {
      const record = makeRecord();
      await saveWorkoutSession(record);

      expect(await loadWorkoutSession('workout-1')).toEqual(record);
    });

    it('resolves null for an unknown id', async () => {
      expect(await loadWorkoutSession('workout-missing')).toBeNull();
    });

    it('resolves null when the backing record holds corrupt JSON', async () => {
      await AsyncStorage.setItem('workout.session.workout-corrupt', 'not json{{{');

      expect(await loadWorkoutSession('workout-corrupt')).toBeNull();
    });

    it('resolves null, never throws, when AsyncStorage.getItem rejects', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadWorkoutSession('workout-1')).resolves.toBeNull();
    });
  });

  describe('healthConnect field defaulting', () => {
    it('defaults to notWritten/[] for a schema-version-1 record with no healthConnect field', async () => {
      const legacy = { ...makeRecord(), schemaVersion: 1 } as Record<string, unknown>;
      delete legacy.healthConnect;
      await AsyncStorage.setItem('workout.session.workout-1', JSON.stringify(legacy));
      await AsyncStorage.setItem('workout.sessionIndex', JSON.stringify(['workout-1']));

      const loaded = await loadWorkoutSession('workout-1');

      expect(loaded?.healthConnect).toEqual({ status: 'notWritten', recordIds: [] });
      expect(loaded?.id).toBe('workout-1');
    });

    it('defaults a malformed healthConnect value without dropping the record', async () => {
      const malformed = { ...makeRecord(), healthConnect: { status: 'bogus', recordIds: 'nope' } };
      await AsyncStorage.setItem('workout.session.workout-1', JSON.stringify(malformed));
      await AsyncStorage.setItem('workout.sessionIndex', JSON.stringify(['workout-1']));

      const loaded = await loadWorkoutSession('workout-1');

      expect(loaded).not.toBeNull();
      expect(loaded?.healthConnect).toEqual({ status: 'notWritten', recordIds: [] });
    });

    it('round-trips a non-default healthConnect value as-is', async () => {
      const record = makeRecord({
        healthConnect: { status: 'written', recordIds: ['exercise-1', 'heartrate-1'] },
      });

      await saveWorkoutSession(record);

      expect(await loadWorkoutSession('workout-1')).toEqual(record);
    });
  });
});
