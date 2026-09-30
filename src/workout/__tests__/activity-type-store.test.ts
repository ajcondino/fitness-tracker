import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadLastActivityType, saveLastActivityType } from '@/workout/activity-type-store';

describe('activity-type-store', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  describe('loadLastActivityType', () => {
    it('defaults to run when nothing has been saved', async () => {
      expect(await loadLastActivityType()).toBe('run');
    });

    it('defaults to run for a corrupt/unexpected persisted value', async () => {
      await AsyncStorage.setItem('workout.lastActivityType', 'jogging');

      expect(await loadLastActivityType()).toBe('run');
    });

    it('defaults to run, never throws, when AsyncStorage.getItem rejects', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadLastActivityType()).resolves.toBe('run');
    });
  });

  describe('saveLastActivityType / loadLastActivityType round-trip', () => {
    it.each(['run', 'walk', 'cycle', 'strength', 'other'] as const)('persists %s', async (type) => {
      await saveLastActivityType(type);

      expect(await loadLastActivityType()).toBe(type);
    });

    it('swallows a thrown AsyncStorage.setItem error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

      await expect(saveLastActivityType('walk')).resolves.toBeUndefined();
    });
  });
});
