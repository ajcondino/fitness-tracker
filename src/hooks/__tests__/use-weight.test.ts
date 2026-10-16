import { act, renderHook, waitFor } from '@testing-library/react-native';

import { saveWeightAndSync } from '@/health/weight-sync';
import { useWeight } from '@/hooks/use-weight';
import { getLatestWeightKg } from '@/weight/weight-store';

jest.mock('@/weight/weight-store');
jest.mock('@/health/weight-sync');

const mockedGetLatest = getLatestWeightKg as jest.MockedFunction<typeof getLatestWeightKg>;
const mockedSave = saveWeightAndSync as jest.MockedFunction<typeof saveWeightAndSync>;

describe('useWeight', () => {
  beforeEach(() => {
    mockedGetLatest.mockReset();
    mockedSave.mockReset();
  });

  it('is undefined while loading, then the latest kg', async () => {
    let resolve: (kg: number) => void = () => {};
    mockedGetLatest.mockReturnValue(new Promise<number>((r) => (resolve = r)));
    const { result } = await renderHook(() => useWeight());
    expect(result.current.latestKg).toBeUndefined();
    await act(async () => resolve(72));
    await waitFor(() => expect(result.current.latestKg).toBe(72));
  });

  it('is null when no entry exists', async () => {
    mockedGetLatest.mockResolvedValue(null);
    const { result } = await renderHook(() => useWeight());
    await waitFor(() => expect(result.current.latestKg).toBeNull());
  });

  it('save updates latestKg and returns the outcome', async () => {
    mockedGetLatest.mockResolvedValue(null);
    mockedSave.mockResolvedValue({
      entry: {
        id: 'a',
        recordedAt: 1,
        kg: 80,
        healthConnect: { status: 'notWritten', recordId: null },
      },
      outcome: { status: 'skipped', reason: 'denied' },
    });
    const { result } = await renderHook(() => useWeight());
    await waitFor(() => expect(result.current.latestKg).toBeNull());

    let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      outcome = await result.current.save(80);
    });

    expect(mockedSave).toHaveBeenCalledWith(80);
    expect(outcome).toEqual({ status: 'skipped', reason: 'denied' });
    expect(result.current.latestKg).toBe(80);
  });
});
