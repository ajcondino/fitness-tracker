import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addWeightEntry,
  getLatestWeightKg,
  loadWeightEntries,
  loadWeightPromptDismissed,
  saveWeightPromptDismissed,
  updateWeightEntryHealthConnect,
} from '@/weight/weight-store';

const entry = (overrides = {}) => ({
  id: 'a',
  recordedAt: 1000,
  kg: 70,
  healthConnect: { status: 'notWritten', recordId: null },
  ...overrides,
});

describe('weight-store', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('returns [] / null when nothing is stored', async () => {
    await expect(loadWeightEntries()).resolves.toEqual([]);
    await expect(getLatestWeightKg()).resolves.toBeNull();
  });

  it('returns [] for corrupt JSON or a non-array', async () => {
    await AsyncStorage.setItem('weight.entries', '{nope');
    await expect(loadWeightEntries()).resolves.toEqual([]);
    await AsyncStorage.setItem('weight.entries', '{"a":1}');
    await expect(loadWeightEntries()).resolves.toEqual([]);
  });

  it('drops only invalid elements', async () => {
    await AsyncStorage.setItem(
      'weight.entries',
      JSON.stringify([
        entry(),
        entry({ id: 'b', kg: -1 }),
        entry({ id: 'c', kg: 'x' }),
        entry({ id: 'd', recordedAt: null }),
        entry({ id: 'e', healthConnect: { status: 'bogus', recordId: null } }),
        null,
      ]),
    );
    const entries = await loadWeightEntries();
    expect(entries.map((e) => e.id)).toEqual(['a']);
  });

  it('appends entries with notWritten status and never mutates old ones', async () => {
    const first = await addWeightEntry(70, 1000);
    const second = await addWeightEntry(71, 2000);

    expect(first.healthConnect).toEqual({ status: 'notWritten', recordId: null });
    expect(first.id).not.toBe(second.id);
    const entries = await loadWeightEntries();
    expect(entries.map((e) => e.kg)).toEqual([70, 71]);
  });

  it('stores kg at full precision', async () => {
    const added = await addWeightEntry(69.99123456789, 1000);
    expect((await loadWeightEntries())[0].kg).toBe(added.kg);
    expect(added.kg).toBe(69.99123456789);
  });

  it('latest is greatest recordedAt, ties broken by later position', async () => {
    await addWeightEntry(80, 3000);
    await addWeightEntry(70, 1000);
    await expect(getLatestWeightKg()).resolves.toBe(80);

    await addWeightEntry(81, 3000);
    await expect(getLatestWeightKg()).resolves.toBe(81);
  });

  it.each([19.99, 500.01, NaN, Infinity, 7, 700])('throws RangeError for %s kg', async (kg) => {
    await expect(addWeightEntry(kg)).rejects.toThrow(RangeError);
  });

  it('accepts the inclusive bounds', async () => {
    await expect(addWeightEntry(20)).resolves.toBeDefined();
    await expect(addWeightEntry(500)).resolves.toBeDefined();
  });

  it('still returns the entry when the storage write fails', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    const added = await addWeightEntry(70, 1000);
    expect(added.kg).toBe(70);
  });

  it('survives a throwing read', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('disk'))
      .mockRejectedValueOnce(new Error('disk'));
    await expect(loadWeightEntries()).resolves.toEqual([]);
    await expect(loadWeightPromptDismissed()).resolves.toBe(false);
  });

  it('updates one entry’s Health Connect info', async () => {
    const a = await addWeightEntry(70, 1000);
    const b = await addWeightEntry(71, 2000);
    await updateWeightEntryHealthConnect(a.id, { status: 'written', recordId: 'r1' });

    const entries = await loadWeightEntries();
    expect(entries.find((e) => e.id === a.id)?.healthConnect).toEqual({
      status: 'written',
      recordId: 'r1',
    });
    expect(entries.find((e) => e.id === b.id)?.healthConnect.status).toBe('notWritten');
  });

  it('persists the prompt-dismissed flag', async () => {
    await expect(loadWeightPromptDismissed()).resolves.toBe(false);
    await saveWeightPromptDismissed();
    await expect(loadWeightPromptDismissed()).resolves.toBe(true);
  });
});
