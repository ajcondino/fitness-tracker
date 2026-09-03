import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { UnitsPreference } from '@/units/units-store';
import { loadUnitsPreference, saveDistanceUnit, saveWeightUnit } from '@/units/units-store';
import { useUnitsPreference } from '@/hooks/use-units-preference';

jest.mock('@/units/units-store');

const mockedLoadUnitsPreference = loadUnitsPreference as jest.MockedFunction<
  typeof loadUnitsPreference
>;
const mockedSaveDistanceUnit = saveDistanceUnit as jest.MockedFunction<typeof saveDistanceUnit>;
const mockedSaveWeightUnit = saveWeightUnit as jest.MockedFunction<typeof saveWeightUnit>;

// Lets a test control exactly when loadUnitsPreference() resolves, so the
// hook's synchronous initial state (before the load settles) is observable
// rather than raced by the mock's own microtask.
function deferredLoad() {
  let resolve: (value: UnitsPreference) => void = () => {};
  const promise = new Promise<UnitsPreference>((r) => {
    resolve = r;
  });
  mockedLoadUnitsPreference.mockReturnValue(promise);
  return resolve;
}

describe('useUnitsPreference', () => {
  beforeEach(() => {
    mockedLoadUnitsPreference
      .mockReset()
      .mockResolvedValue({ distance: 'metric', weight: 'metric' });
    mockedSaveDistanceUnit.mockReset().mockResolvedValue(undefined);
    mockedSaveWeightUnit.mockReset().mockResolvedValue(undefined);
  });

  it('renders synchronously with the metric/metric default before the load resolves', async () => {
    const resolveLoad = deferredLoad();

    const { result } = await renderHook(() => useUnitsPreference());

    expect(result.current.distance).toBe('metric');
    expect(result.current.weight).toBe('metric');

    await act(async () => {
      resolveLoad({ distance: 'imperial', weight: 'imperial' });
    });
  });

  it('updates state once loadUnitsPreference resolves', async () => {
    mockedLoadUnitsPreference.mockResolvedValue({ distance: 'imperial', weight: 'imperial' });

    const { result } = await renderHook(() => useUnitsPreference());

    await waitFor(() => expect(result.current.distance).toBe('imperial'));
    expect(result.current.weight).toBe('imperial');
  });

  it('setDistanceUnit updates state immediately and calls the store setter', async () => {
    const { result } = await renderHook(() => useUnitsPreference());
    await waitFor(() => expect(mockedLoadUnitsPreference).toHaveBeenCalled());

    await act(async () => {
      result.current.setDistanceUnit('imperial');
    });

    expect(result.current.distance).toBe('imperial');
    expect(mockedSaveDistanceUnit).toHaveBeenCalledWith('imperial');
  });

  it('setWeightUnit updates state immediately and calls the store setter', async () => {
    const { result } = await renderHook(() => useUnitsPreference());
    await waitFor(() => expect(mockedLoadUnitsPreference).toHaveBeenCalled());

    await act(async () => {
      result.current.setWeightUnit('imperial');
    });

    expect(result.current.weight).toBe('imperial');
    expect(mockedSaveWeightUnit).toHaveBeenCalledWith('imperial');
  });
});
