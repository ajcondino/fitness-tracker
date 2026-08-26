import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearDeclineCount,
  loadDeclineCount,
  loadWriteBackEnabled,
  recordDeclinedAttempt,
  saveWriteBackEnabled,
} from '@/health/health-connect-store';

describe('health-connect-store', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  describe('loadWriteBackEnabled', () => {
    it('defaults to true when nothing has been saved', async () => {
      expect(await loadWriteBackEnabled()).toBe(true);
    });

    it('returns false only for the persisted "false" string', async () => {
      await AsyncStorage.setItem('healthConnect.writeBackEnabled', 'false');

      expect(await loadWriteBackEnabled()).toBe(false);
    });

    it('defaults to true for a corrupt/unexpected value', async () => {
      await AsyncStorage.setItem('healthConnect.writeBackEnabled', 'not a boolean');

      expect(await loadWriteBackEnabled()).toBe(true);
    });

    it('defaults to true, never throws, when AsyncStorage.getItem rejects', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadWriteBackEnabled()).resolves.toBe(true);
    });
  });

  describe('saveWriteBackEnabled / loadWriteBackEnabled round-trip', () => {
    it('persists true', async () => {
      await saveWriteBackEnabled(true);

      expect(await loadWriteBackEnabled()).toBe(true);
    });

    it('persists false', async () => {
      await saveWriteBackEnabled(false);

      expect(await loadWriteBackEnabled()).toBe(false);
    });

    it('swallows a thrown AsyncStorage.setItem error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

      await expect(saveWriteBackEnabled(false)).resolves.toBeUndefined();
    });
  });

  describe('loadDeclineCount', () => {
    it('returns 0 when nothing has been saved', async () => {
      expect(await loadDeclineCount()).toBe(0);
    });

    it('returns 0 for a non-numeric value', async () => {
      await AsyncStorage.setItem('healthConnect.declineCount', 'not a number');

      expect(await loadDeclineCount()).toBe(0);
    });

    it('returns 0 for a negative value', async () => {
      await AsyncStorage.setItem('healthConnect.declineCount', '-1');

      expect(await loadDeclineCount()).toBe(0);
    });

    it('returns 0, never throws, when AsyncStorage.getItem rejects', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(loadDeclineCount()).resolves.toBe(0);
    });
  });

  describe('recordDeclinedAttempt', () => {
    it('increments from 0 to 1 on the first call', async () => {
      expect(await recordDeclinedAttempt()).toBe(1);
      expect(await loadDeclineCount()).toBe(1);
    });

    it('increments across repeated calls', async () => {
      await recordDeclinedAttempt();
      const second = await recordDeclinedAttempt();

      expect(second).toBe(2);
      expect(await loadDeclineCount()).toBe(2);
    });

    it('returns the incremented value even when the write fails', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

      await expect(recordDeclinedAttempt()).resolves.toBe(1);
    });
  });

  describe('clearDeclineCount', () => {
    it('makes a subsequent loadDeclineCount() return 0', async () => {
      await recordDeclinedAttempt();

      await clearDeclineCount();

      expect(await loadDeclineCount()).toBe(0);
    });

    it('swallows a thrown AsyncStorage.removeItem error rather than rejecting', async () => {
      jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('storage error'));

      await expect(clearDeclineCount()).resolves.toBeUndefined();
    });
  });
});
