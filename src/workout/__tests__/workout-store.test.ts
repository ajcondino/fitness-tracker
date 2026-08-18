import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadWorkoutSessions, saveWorkoutSession } from '@/workout/workout-store';
import type { WorkoutRecord } from '@/workout/workout-record';

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 1,
    id: 'workout-1',
    startedAt: 1_000,
    samples: [{ bpm: 120, timestamp: 1_000 }],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
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
});
