import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import SessionDetail from '@/app/session/[id]';
import { syncWorkoutSessionToHealthConnect } from '@/health/health-connect-sync';
import { loadWorkoutSession } from '@/workout/workout-store';
import type { WorkoutRecord } from '@/workout/workout-record';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/workout/workout-store');
jest.mock('@/health/health-connect-sync');

const mockedUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<
  typeof useLocalSearchParams
>;
const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedLoadWorkoutSession = loadWorkoutSession as jest.MockedFunction<
  typeof loadWorkoutSession
>;
const mockedSyncWorkoutSession = syncWorkoutSessionToHealthConnect as jest.MockedFunction<
  typeof syncWorkoutSessionToHealthConnect
>;

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 2,
    id: 'workout-1',
    startedAt: new Date('2026-08-19T18:42:00').getTime(),
    samples: [
      { bpm: 120, timestamp: new Date('2026-08-19T18:42:00').getTime() },
      { bpm: 140, timestamp: new Date('2026-08-19T18:52:10').getTime() },
    ],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'notWritten', recordIds: [] },
    ...overrides,
  };
}

describe('<SessionDetail />', () => {
  const back = jest.fn();
  const replace = jest.fn();

  beforeEach(() => {
    back.mockClear();
    replace.mockClear();
    mockedUseRouter.mockReturnValue({ back, replace } as unknown as ReturnType<typeof useRouter>);
    mockedUseLocalSearchParams.mockReturnValue({ id: 'workout-1' } as unknown as ReturnType<
      typeof useLocalSearchParams
    >);
    mockedLoadWorkoutSession.mockReset();
    mockedSyncWorkoutSession.mockReset();
  });

  it('renders nothing while loading', async () => {
    mockedLoadWorkoutSession.mockReturnValue(new Promise(() => {})); // never resolves

    await render(<SessionDetail />);

    expect(screen.queryByText('Session not found.')).not.toBeOnTheScreen();
    expect(screen.queryByText('AUG 19 · 6:42 PM')).not.toBeOnTheScreen();
  });

  it('renders a not-found message with a back control when the record is null', async () => {
    mockedLoadWorkoutSession.mockResolvedValue(null);

    await render(<SessionDetail />);
    await act(async () => {});

    expect(screen.getByText('Session not found.')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('session-detail-back'));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('renders SessionSummary in detail mode with the loaded record', async () => {
    mockedLoadWorkoutSession.mockResolvedValue(makeRecord());

    await render(<SessionDetail />);
    await act(async () => {});

    expect(screen.getByText('AUG 19 · 6:42 PM')).toBeOnTheScreen();
    expect(screen.getByTestId('session-summary-hero-duration')).toHaveTextContent('10:10');
    expect(screen.queryByTestId('live-workout-save')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('live-workout-discard')).not.toBeOnTheScreen();
  });

  it('back control in detail mode calls router.back()', async () => {
    mockedLoadWorkoutSession.mockResolvedValue(makeRecord());

    await render(<SessionDetail />);
    await act(async () => {});

    fireEvent.press(screen.getByTestId('session-summary-back'));

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('done control in detail mode calls router.replace with the home route', async () => {
    mockedLoadWorkoutSession.mockResolvedValue(makeRecord());

    await render(<SessionDetail />);
    await act(async () => {});

    fireEvent.press(screen.getByTestId('session-summary-done'));

    expect(replace).toHaveBeenCalledWith('/');
  });

  it('calls loadWorkoutSession with the id from the route params', async () => {
    mockedLoadWorkoutSession.mockResolvedValue(makeRecord());

    await render(<SessionDetail />);
    await act(async () => {});

    expect(mockedLoadWorkoutSession).toHaveBeenCalledWith('workout-1');
  });

  describe('Sync', () => {
    it('tapping Sync calls syncWorkoutSessionToHealthConnect with the loaded record and re-renders with the resolved status', async () => {
      const loaded = makeRecord({ healthConnect: { status: 'failed', recordIds: [] } });
      const synced = { ...loaded, healthConnect: { status: 'written' as const, recordIds: ['a'] } };
      mockedLoadWorkoutSession.mockResolvedValue(loaded);
      let resolveSync: (value: typeof synced) => void = () => {};
      mockedSyncWorkoutSession.mockReturnValue(
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
      );

      await render(<SessionDetail />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('session-summary-sync'));
      });

      expect(mockedSyncWorkoutSession).toHaveBeenCalledWith(loaded);
      // Disabled while the call is in flight.
      expect(screen.getByTestId('session-summary-sync').props.accessibilityState.disabled).toBe(
        true,
      );

      await act(async () => {
        resolveSync(synced);
      });

      expect(screen.getByText('Saved to Health Connect')).toBeOnTheScreen();
      expect(screen.queryByTestId('session-summary-sync')).not.toBeOnTheScreen();
    });

    it('does not issue a second syncWorkoutSessionToHealthConnect call when Sync is tapped twice before the first resolves', async () => {
      const loaded = makeRecord({ healthConnect: { status: 'failed', recordIds: [] } });
      mockedLoadWorkoutSession.mockResolvedValue(loaded);
      mockedSyncWorkoutSession.mockReturnValue(new Promise(() => {})); // never resolves

      await render(<SessionDetail />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('session-summary-sync'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('session-summary-sync'));
      });

      expect(mockedSyncWorkoutSession).toHaveBeenCalledTimes(1);
    });
  });
});
