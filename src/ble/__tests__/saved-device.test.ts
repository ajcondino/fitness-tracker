import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearSavedDevice, loadSavedDevice, saveDevice } from '@/ble/saved-device';

describe('saved-device', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  describe('loadSavedDevice', () => {
    it('returns null when nothing has been saved', async () => {
      expect(await loadSavedDevice()).toBeNull();
    });

    it('returns null for corrupt JSON', async () => {
      await AsyncStorage.setItem('ble.savedDevice', 'not json{{{');

      expect(await loadSavedDevice()).toBeNull();
    });

    it('returns null for a non-object value', async () => {
      await AsyncStorage.setItem('ble.savedDevice', JSON.stringify('a string'));

      expect(await loadSavedDevice()).toBeNull();
    });

    it('returns null for an object missing a string id', async () => {
      await AsyncStorage.setItem('ble.savedDevice', JSON.stringify({ name: 'HRM' }));

      expect(await loadSavedDevice()).toBeNull();
    });

    it('coerces a non-string name to null', async () => {
      await AsyncStorage.setItem('ble.savedDevice', JSON.stringify({ id: 'device-1', name: 42 }));

      expect(await loadSavedDevice()).toEqual({ id: 'device-1', name: null });
    });

    it('returns null, never throws, when AsyncStorage.getItem rejects', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadSavedDevice()).resolves.toBeNull();
    });
  });

  describe('saveDevice / loadSavedDevice round-trip', () => {
    it('returns the saved value unchanged', async () => {
      const device = { id: 'device-1', name: 'Pulse HRM' };

      await saveDevice(device);

      expect(await loadSavedDevice()).toEqual(device);
    });

    it('persists a null name as-is', async () => {
      const device = { id: 'device-1', name: null };

      await saveDevice(device);

      expect(await loadSavedDevice()).toEqual(device);
    });

    it('swallows a thrown AsyncStorage.setItem error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

      await expect(saveDevice({ id: 'device-1', name: 'Pulse HRM' })).resolves.toBeUndefined();
    });
  });

  describe('clearSavedDevice', () => {
    it('makes a subsequent loadSavedDevice() return null', async () => {
      await saveDevice({ id: 'device-1', name: 'Pulse HRM' });

      await clearSavedDevice();

      expect(await loadSavedDevice()).toBeNull();
    });

    it('swallows a thrown AsyncStorage.removeItem error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('storage error'));

      await expect(clearSavedDevice()).resolves.toBeUndefined();
    });
  });
});
