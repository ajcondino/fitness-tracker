import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useIsFocused, useRouter } from 'expo-router';

import Index from '@/app/(tabs)/index';
import { usePairingStore } from '@/ble/pairing-store';
import type { DiscoveredDevice } from '@/ble/pairing-types';
import { loadWorkoutSessions } from '@/workout/workout-store';
import type { WorkoutRecord } from '@/workout/workout-record';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useIsFocused: jest.fn(),
}));
jest.mock('@/workout/workout-store');

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;
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

describe('<Index /> (Home)', () => {
  const navigate = jest.fn();

  beforeEach(() => {
    navigate.mockClear();
    mockedUseRouter.mockReturnValue({ navigate } as unknown as ReturnType<typeof useRouter>);
    mockedUseIsFocused.mockReset().mockReturnValue(true);
    mockedLoadWorkoutSessions.mockReset().mockResolvedValue([]);
    usePairingStore.getState().reset();
  });

  it('renders a time-based greeting with the mocked name', async () => {
    const hoursSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(8);
    await render(<Index />);
    await act(async () => {});
    expect(screen.getByText('Good morning, AJ')).toBeOnTheScreen();
    hoursSpy.mockRestore();
  });

  it('renders the afternoon greeting at midday', async () => {
    const hoursSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
    await render(<Index />);
    await act(async () => {});
    expect(screen.getByText('Good afternoon, AJ')).toBeOnTheScreen();
    hoursSpy.mockRestore();
  });

  it('renders the evening greeting at night', async () => {
    const hoursSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(21);
    await render(<Index />);
    await act(async () => {});
    expect(screen.getByText('Good evening, AJ')).toBeOnTheScreen();
    hoursSpy.mockRestore();
  });

  it('renders the disconnected device card and a single Connect a Monitor CTA', async () => {
    await render(<Index />);
    await act(async () => {});

    expect(screen.getByText('No monitor connected')).toBeOnTheScreen();
    expect(screen.getByText('Tap to pair a heart-rate monitor')).toBeOnTheScreen();

    const cta = screen.getByTestId('home-hero-cta');
    expect(screen.getByText('CONNECT A MONITOR')).toBeOnTheScreen();
    expect(screen.queryByText('START WORKOUT')).not.toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(cta);
    });
    expect(navigate).toHaveBeenCalledWith('/device');

    await act(async () => {
      fireEvent.press(screen.getByTestId('device-card'));
    });
    expect(navigate).toHaveBeenCalledWith('/device');
  });

  it('renders the connected device name and a single Start Workout CTA when connected', async () => {
    usePairingStore.setState({
      connection: { kind: 'connected', deviceId: 'device-1' },
      devices: [makeDevice()],
    });

    await render(<Index />);
    await act(async () => {});

    expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
    expect(screen.getByText('Connected')).toBeOnTheScreen();
    expect(screen.queryByText('No monitor connected')).not.toBeOnTheScreen();

    const cta = screen.getByTestId('home-hero-cta');
    expect(screen.getByText('START WORKOUT')).toBeOnTheScreen();
    expect(screen.queryByText('CONNECT A MONITOR')).not.toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(cta);
    });
    expect(navigate).toHaveBeenCalledWith('/live-workout');
  });

  it('falls back to "Unknown device" when the connected device is missing from the devices list', async () => {
    usePairingStore.setState({
      connection: { kind: 'connected', deviceId: 'device-1' },
      devices: [],
    });

    await render(<Index />);
    await act(async () => {});

    expect(screen.getByText('Unknown device')).toBeOnTheScreen();
  });

  it('renders an inert mocked avatar tile in place of the profile control', async () => {
    await render(<Index />);
    await act(async () => {});

    const profileControl = screen.getByTestId('home-profile-control');
    expect(profileControl).toHaveAccessibleName('Profile');
    expect(screen.getByText('A')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(profileControl);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renders the RECENT empty state when there are no saved sessions', async () => {
    mockedLoadWorkoutSessions.mockResolvedValue([]);

    await render(<Index />);
    await act(async () => {});

    expect(screen.getByText('RECENT')).toBeOnTheScreen();
    expect(screen.getByText('No workouts saved yet.')).toBeOnTheScreen();
    expect(screen.queryByTestId('session-row')).not.toBeOnTheScreen();
  });

  it('renders at most the 3 most recent saved sessions and a SEE ALL control to History', async () => {
    const records = [
      makeRecord({ id: 'workout-1' }),
      makeRecord({ id: 'workout-2' }),
      makeRecord({ id: 'workout-3' }),
      makeRecord({ id: 'workout-4' }),
    ];
    mockedLoadWorkoutSessions.mockResolvedValue(records);

    await render(<Index />);
    await act(async () => {});

    expect(screen.getAllByTestId('session-row')).toHaveLength(3);

    await act(async () => {
      fireEvent.press(screen.getByTestId('home-recent-see-all'));
    });
    expect(navigate).toHaveBeenCalledWith('/history');
  });
});
