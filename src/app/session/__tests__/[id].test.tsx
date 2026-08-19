import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import SessionDetail from '@/app/session/[id]';
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

const mockedUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<
  typeof useLocalSearchParams
>;
const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedLoadWorkoutSession = loadWorkoutSession as jest.MockedFunction<
  typeof loadWorkoutSession
>;

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 1,
    id: 'workout-1',
    startedAt: new Date('2026-08-19T18:42:00').getTime(),
    samples: [
      { bpm: 120, timestamp: new Date('2026-08-19T18:42:00').getTime() },
      { bpm: 140, timestamp: new Date('2026-08-19T18:52:10').getTime() },
    ],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    ...overrides,
  };
}

describe('<SessionDetail />', () => {
  const back = jest.fn();

  beforeEach(() => {
    back.mockClear();
    mockedUseRouter.mockReturnValue({ back } as unknown as ReturnType<typeof useRouter>);
    mockedUseLocalSearchParams.mockReturnValue({ id: 'workout-1' } as unknown as ReturnType<
      typeof useLocalSearchParams
    >);
    mockedLoadWorkoutSession.mockReset();
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
    expect(screen.getByText('10:10')).toBeOnTheScreen();
    expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
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

  it('calls loadWorkoutSession with the id from the route params', async () => {
    mockedLoadWorkoutSession.mockResolvedValue(makeRecord());

    await render(<SessionDetail />);
    await act(async () => {});

    expect(mockedLoadWorkoutSession).toHaveBeenCalledWith('workout-1');
  });
});
