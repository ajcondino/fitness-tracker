import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadUnitsPreference, saveDistanceUnit, saveWeightUnit } from '@/units/units-store';

describe('units-store', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  describe('loadUnitsPreference', () => {
    it('defaults both units to metric when nothing has been saved', async () => {
      expect(await loadUnitsPreference()).toEqual({ distance: 'metric', weight: 'metric' });
    });

    it('defaults distance to metric for a corrupt/unexpected value', async () => {
      await AsyncStorage.setItem('units.distance', 'not a unit system');

      expect(await loadUnitsPreference()).toEqual({ distance: 'metric', weight: 'metric' });
    });

    it('defaults weight to metric for a corrupt/unexpected value', async () => {
      await AsyncStorage.setItem('units.weight', 'not a unit system');

      expect(await loadUnitsPreference()).toEqual({ distance: 'metric', weight: 'metric' });
    });

    it('reads a persisted imperial value for either key independently', async () => {
      await AsyncStorage.setItem('units.distance', 'imperial');

      expect(await loadUnitsPreference()).toEqual({ distance: 'imperial', weight: 'metric' });
    });

    it('defaults both to metric, never throws, when AsyncStorage.getItem rejects', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadUnitsPreference()).resolves.toEqual({
        distance: 'metric',
        weight: 'metric',
      });
    });
  });

  describe('saveDistanceUnit / loadUnitsPreference round-trip', () => {
    it('persists imperial', async () => {
      await saveDistanceUnit('imperial');

      expect(await loadUnitsPreference()).toEqual({ distance: 'imperial', weight: 'metric' });
    });

    it('persists metric', async () => {
      await saveDistanceUnit('imperial');
      await saveDistanceUnit('metric');

      expect(await loadUnitsPreference()).toEqual({ distance: 'metric', weight: 'metric' });
    });

    it('swallows a thrown AsyncStorage.setItem error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

      await expect(saveDistanceUnit('imperial')).resolves.toBeUndefined();
    });
  });

  describe('saveWeightUnit / loadUnitsPreference round-trip', () => {
    it('persists imperial', async () => {
      await saveWeightUnit('imperial');

      expect(await loadUnitsPreference()).toEqual({ distance: 'metric', weight: 'imperial' });
    });

    it('persists metric', async () => {
      await saveWeightUnit('imperial');
      await saveWeightUnit('metric');

      expect(await loadUnitsPreference()).toEqual({ distance: 'metric', weight: 'metric' });
    });

    it('swallows a thrown AsyncStorage.setItem error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

      await expect(saveWeightUnit('imperial')).resolves.toBeUndefined();
    });
  });
});
