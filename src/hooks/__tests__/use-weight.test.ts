import { act, renderHook, waitFor } from '@testing-library/react-native';

import { saveWeightAndSync } from '@/health/weight-sync';
import { useWeight } from '@/hooks/use-weight';
import { loadWeightEntries } from '@/weight/weight-store';
import type { WeightEntry } from '@/weight/weight-store';

jest.mock('@/weight/weight-store');
jest.mock('@/health/weight-sync');

const mockedLoad = loadWeightEntries as jest.MockedFunction<typeof loadWeightEntries>;
const mockedSave = saveWeightAndSync as jest.MockedFunction<typeof saveWeightAndSync>;

function makeEntry(id: string, kg: number, recordedAt: number): WeightEntry {
  return { id, kg, recordedAt, healthConnect: { status: 'notWritten', recordId: null } };
}

describe('useWeight', () => {
  beforeEach(() => {
    mockedLoad.mockReset();
    mockedSave.mockReset();
  });

  it('is undefined while loading, then the entries and latest kg', async () => {
    let resolve: (entries: WeightEntry[]) => void = () => {};
    mockedLoad.mockReturnValue(new Promise<WeightEntry[]>((r) => (resolve = r)));
    const { result } = await renderHook(() => useWeight());
    expect(result.current.latestKg).toBeUndefined();
    expect(result.current.entries).toBeUndefined();

    const loaded = [makeEntry('a', 70, 1), makeEntry('b', 72, 2)];
    await act(async () => resolve(loaded));
    await waitFor(() => expect(result.current.latestKg).toBe(72));
    expect(result.current.entries).toEqual(loaded);
  });

  it('is null / empty when no entry exists', async () => {
    mockedLoad.mockResolvedValue([]);
    const { result } = await renderHook(() => useWeight());
    await waitFor(() => expect(result.current.latestKg).toBeNull());
    expect(result.current.entries).toEqual([]);
  });

  it('save appends the entry, updates latestKg and returns the outcome', async () => {
    mockedLoad.mockResolvedValue([makeEntry('a', 70, 1)]);
    const saved = makeEntry('b', 80, 2);
    mockedSave.mockResolvedValue({
      entry: saved,
      outcome: { status: 'skipped', reason: 'denied' },
    });
    const { result } = await renderHook(() => useWeight());
    await waitFor(() => expect(result.current.latestKg).toBe(70));

    let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      outcome = await result.current.save(80);
    });

    expect(mockedSave).toHaveBeenCalledWith(80);
    expect(outcome).toEqual({ status: 'skipped', reason: 'denied' });
    expect(result.current.latestKg).toBe(80);
    expect(result.current.entries).toEqual([makeEntry('a', 70, 1), saved]);
  });
});
