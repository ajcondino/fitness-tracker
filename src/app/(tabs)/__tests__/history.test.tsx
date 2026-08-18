import { act, render, screen } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';

import History from '@/app/(tabs)/history';
import { loadWorkoutSessions } from '@/workout/workout-store';
import type { WorkoutRecord } from '@/workout/workout-record';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }));
jest.mock('@/workout/workout-store');

const mockedUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;
const mockedLoadWorkoutSessions = loadWorkoutSessions as jest.MockedFunction<
  typeof loadWorkoutSessions
>;

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 1,
    id: 'workout-1',
    startedAt: new Date('2026-08-17T18:42:00').getTime(),
    samples: [
      { bpm: 120, timestamp: new Date('2026-08-17T18:42:00').getTime() },
      { bpm: 140, timestamp: new Date('2026-08-17T19:24:10').getTime() },
    ],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    ...overrides,
  };
}

describe('<History />', () => {
  beforeEach(() => {
    mockedUseIsFocused.mockReset().mockReturnValue(true);
    mockedLoadWorkoutSessions.mockReset().mockResolvedValue([]);
  });

  it('keeps the existing header copy', async () => {
    await render(<History />);

    expect(screen.getByText('History')).toBeOnTheScreen();
    expect(screen.getByText('A log of past workout sessions.')).toBeOnTheScreen();
  });

  it('renders the empty-state line and no SessionRow when there are no sessions', async () => {
    mockedLoadWorkoutSessions.mockResolvedValue([]);

    await render(<History />);
    await act(async () => {});

    expect(screen.getByText('No workouts saved yet.')).toBeOnTheScreen();
    expect(screen.queryByTestId('session-row')).not.toBeOnTheScreen();
  });

  it('renders one SessionRow per returned record, in the returned order', async () => {
    const first = makeRecord({ id: 'workout-1' });
    const second = makeRecord({
      id: 'workout-2',
      startedAt: new Date('2026-08-16T07:00:00').getTime(),
      samples: [{ bpm: 100, timestamp: new Date('2026-08-16T07:00:00').getTime() }],
    });
    mockedLoadWorkoutSessions.mockResolvedValue([first, second]);

    await render(<History />);
    await act(async () => {});

    expect(screen.queryByText('No workouts saved yet.')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('session-row')).toHaveLength(2);
    // first record's duration is 42:10 and average is (120+140)/2 = 130
    expect(screen.getByText('42:10')).toBeOnTheScreen();
    expect(screen.getByText('130')).toBeOnTheScreen();
    // second record is a single-sample, zero-duration session
    expect(screen.getByText('00:00')).toBeOnTheScreen();
    expect(screen.getByText('100')).toBeOnTheScreen();
  });

  it('calls loadWorkoutSessions again when the tab regains focus after having lost it', async () => {
    mockedUseIsFocused.mockReturnValue(true);
    await render(<History />);
    await act(async () => {});

    expect(mockedLoadWorkoutSessions).toHaveBeenCalledTimes(1);

    mockedUseIsFocused.mockReturnValue(false);
    await act(async () => {
      screen.rerender(<History />);
    });

    mockedUseIsFocused.mockReturnValue(true);
    await act(async () => {
      screen.rerender(<History />);
    });

    expect(mockedLoadWorkoutSessions).toHaveBeenCalledTimes(2);
  });
});
