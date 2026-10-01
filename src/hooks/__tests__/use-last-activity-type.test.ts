import { act, renderHook, waitFor } from '@testing-library/react-native';

import { loadLastActivityType, saveLastActivityType } from '@/workout/activity-type-store';
import { useLastActivityType } from '@/hooks/use-last-activity-type';
import type { ActivityType } from '@/workout/workout-record';

jest.mock('@/workout/activity-type-store');

const mockedLoadLastActivityType = loadLastActivityType as jest.MockedFunction<
  typeof loadLastActivityType
>;
const mockedSaveLastActivityType = saveLastActivityType as jest.MockedFunction<
  typeof saveLastActivityType
>;

// Lets a test control exactly when loadLastActivityType() resolves, so the
// hook's synchronous initial state (before the load settles) is observable
// rather than raced by the mock's own microtask.
function deferredLoad() {
  let resolve: (value: ActivityType) => void = () => {};
  const promise = new Promise<ActivityType>((r) => {
    resolve = r;
  });
  mockedLoadLastActivityType.mockReturnValue(promise);
  return resolve;
}

describe('useLastActivityType', () => {
  beforeEach(() => {
    mockedLoadLastActivityType.mockReset().mockResolvedValue('run');
    mockedSaveLastActivityType.mockReset().mockResolvedValue(undefined);
  });

  it('renders synchronously with the run default before the load resolves', async () => {
    const resolveLoad = deferredLoad();

    const { result } = await renderHook(() => useLastActivityType());

    expect(result.current.activityType).toBe('run');

    await act(async () => {
      resolveLoad('cycle');
    });
  });

  it('updates state once loadLastActivityType resolves', async () => {
    mockedLoadLastActivityType.mockResolvedValue('strength');

    const { result } = await renderHook(() => useLastActivityType());

    await waitFor(() => expect(result.current.activityType).toBe('strength'));
  });

  it('setActivityType updates state immediately and calls the store setter', async () => {
    const { result } = await renderHook(() => useLastActivityType());
    await waitFor(() => expect(mockedLoadLastActivityType).toHaveBeenCalled());

    await act(async () => {
      result.current.setActivityType('walk');
    });

    expect(result.current.activityType).toBe('walk');
    expect(mockedSaveLastActivityType).toHaveBeenCalledWith('walk');
  });
});
