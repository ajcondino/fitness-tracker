import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useIsFocused, useRouter } from 'expo-router';

import History from '@/app/(tabs)/history';
import { usePairingStore } from '@/ble/pairing-store';
import type { DiscoveredDevice } from '@/ble/pairing-types';
import { colors } from '@/constants/theme';
import { loadWorkoutSessions } from '@/workout/workout-store';
import type { WorkoutRecord } from '@/workout/workout-record';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(), useRouter: jest.fn() }));
jest.mock('@/workout/workout-store');

const mockedUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;
const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedLoadWorkoutSessions = loadWorkoutSessions as jest.MockedFunction<
  typeof loadWorkoutSessions
>;

function makeDevice(overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    id: 'device-1',
    name: 'Pulse HRM',
    lastKnownName: 'Pulse HRM',
    isConnectable: true,
    medianRssi: -60,
    firstSeenAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

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
  const push = jest.fn();

  beforeEach(() => {
    mockedUseIsFocused.mockReset().mockReturnValue(true);
    push.mockClear();
    mockedUseRouter.mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    mockedLoadWorkoutSessions.mockReset().mockResolvedValue([]);
    usePairingStore.getState().reset();
  });

  it('keeps the existing header copy', async () => {
    await render(<History />);

    expect(screen.getByText('History')).toBeOnTheScreen();
  });

  it('renders the disconnected pill with the fallback name and a danger-colored dot', async () => {
    await render(<History />);
    await act(async () => {});

    expect(screen.getByText('Unknown device')).toBeOnTheScreen();
    expect(screen.getByTestId('history-pill-dot').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: colors.danger })]),
    );
  });

  it('renders the connected pill with the device name and a success-colored dot', async () => {
    usePairingStore.setState({
      connection: { kind: 'connected', deviceId: 'device-1' },
      devices: [makeDevice()],
    });

    await render(<History />);
    await act(async () => {});

    expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
    expect(screen.getByTestId('history-pill-dot').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: colors.success })]),
    );
  });

  it('renders the empty-state line, a zeroed stat card, and no SessionRow when there are no sessions', async () => {
    mockedLoadWorkoutSessions.mockResolvedValue([]);

    await render(<History />);
    await act(async () => {});

    expect(screen.getByText('No workouts saved yet.')).toBeOnTheScreen();
    expect(screen.queryByTestId('session-row')).not.toBeOnTheScreen();

    expect(screen.getByText('7-DAY')).toBeOnTheScreen();
    expect(screen.getByText('0:00')).toBeOnTheScreen();
    expect(screen.getByText('SESSIONS')).toBeOnTheScreen();
    expect(screen.getByText('AVG HR')).toBeOnTheScreen();
    expect(screen.getByText('0')).toBeOnTheScreen(); // the SESSIONS count
    expect(screen.getByText('--')).toBeOnTheScreen(); // AVG HR with no sessions
  });

  it('renders one SessionRow per returned record, in the returned order, plus the ALL SESSIONS header', async () => {
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
    expect(screen.getByText('ALL SESSIONS')).toBeOnTheScreen();
    expect(screen.getAllByTestId('session-row')).toHaveLength(2);
    // first record's duration is 42:10 and average is (120+140)/2 = 130
    expect(screen.getByText('42:10')).toBeOnTheScreen();
    expect(screen.getByText('130 avg')).toBeOnTheScreen();
    // second record is a single-sample, zero-duration session
    expect(screen.getByText('00:00')).toBeOnTheScreen();
    expect(screen.getByText('100 avg')).toBeOnTheScreen();
  });

  it("pressing a row calls router.push with that row's record id", async () => {
    const first = makeRecord({ id: 'workout-1' });
    const second = makeRecord({
      id: 'workout-2',
      startedAt: new Date('2026-08-16T07:00:00').getTime(),
      samples: [{ bpm: 100, timestamp: new Date('2026-08-16T07:00:00').getTime() }],
    });
    mockedLoadWorkoutSessions.mockResolvedValue([first, second]);

    await render(<History />);
    await act(async () => {});

    fireEvent.press(screen.getAllByTestId('session-row')[1]);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ pathname: '/session/[id]', params: { id: 'workout-2' } });
  });

  it('rolls up only the last 7 days into the stat card, excluding older sessions', async () => {
    const now = new Date('2026-08-18T12:00:00').getTime();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    const recent = makeRecord({
      id: 'workout-recent',
      startedAt: now - 60 * 60 * 1000, // 1 hour ago
      samples: [
        { bpm: 100, timestamp: now - 60 * 60 * 1000 },
        { bpm: 120, timestamp: now },
      ],
    });
    const old = makeRecord({
      id: 'workout-old',
      startedAt: now - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      samples: [{ bpm: 200, timestamp: now - 8 * 24 * 60 * 60 * 1000 }],
    });
    mockedLoadWorkoutSessions.mockResolvedValue([recent, old]);

    await render(<History />);
    await act(async () => {});

    expect(screen.getByText('1:00')).toBeOnTheScreen(); // 7-DAY total
    expect(screen.getByText('110')).toBeOnTheScreen(); // AVG HR: (100+120)/2
    // SESSIONS count of 1 — the old record is excluded from the roll-up.
    expect(screen.getByText('1')).toBeOnTheScreen();

    nowSpy.mockRestore();
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
