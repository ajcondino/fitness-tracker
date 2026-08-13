import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import LiveWorkout from '@/app/live-workout';
import { bleManager } from '@/ble/manager';
import { usePairingStore } from '@/ble/pairing-store';
import type { DiscoveredDevice } from '@/ble/pairing-types';
import { useLiveHeartRate } from '@/hooks/use-live-heart-rate';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/hooks/use-live-heart-rate');

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedUseLiveHeartRate = useLiveHeartRate as jest.MockedFunction<typeof useLiveHeartRate>;
const mockedCancelDeviceConnection = jest.mocked(bleManager.cancelDeviceConnection);

function makeDevice(overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    id: 'device-1',
    name: 'Pulse HRM',
    lastKnownName: 'Pulse HRM',
    isConnectable: true,
    medianRssi: -55,
    firstSeenAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

describe('<LiveWorkout />', () => {
  const back = jest.fn();

  beforeEach(() => {
    back.mockClear();
    mockedUseRouter.mockReturnValue({ back } as unknown as ReturnType<typeof useRouter>);
    mockedCancelDeviceConnection.mockReset().mockResolvedValue({} as never);
    usePairingStore.getState().reset();
    mockedUseLiveHeartRate.mockReset().mockReturnValue({
      bpm: null,
      status: 'awaitingFirstReading',
    });
  });

  describe('guard branch (no connected device)', () => {
    it('renders the no-device message with no BPM readout, Save, or dev trigger', async () => {
      await render(<LiveWorkout />);

      expect(screen.getByText('No monitor connected')).toBeOnTheScreen();
      expect(
        screen.getByText('Go back and connect a heart-rate monitor to start a workout.'),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('live-workout-save')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('live-workout-simulate-dropout')).not.toBeOnTheScreen();
    });

    it('its back action calls router.back()', async () => {
      await render(<LiveWorkout />);

      fireEvent.press(screen.getByTestId('live-workout-discard'));

      expect(back).toHaveBeenCalledTimes(1);
    });
  });

  describe('connected branch', () => {
    beforeEach(() => {
      usePairingStore.setState({
        connection: { kind: 'connected', deviceId: 'device-1' },
        devices: [makeDevice()],
      });
    });

    it('renders the title, device chip, BPM placeholder, and waiting status', async () => {
      await render(<LiveWorkout />);

      expect(screen.getByText('LIVE WORKOUT')).toBeOnTheScreen();
      expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
      expect(screen.getByText('--')).toBeOnTheScreen();
      expect(screen.getByText('WAITING FOR SIGNAL…')).toBeOnTheScreen();
    });

    it('falls back to the unknown-device label when the device is not in the store', async () => {
      usePairingStore.setState({ devices: [] });
      await render(<LiveWorkout />);

      expect(screen.getByText('Unknown device')).toBeOnTheScreen();
    });

    it('shows the live status and bpm when status is live', async () => {
      mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'live' });

      await render(<LiveWorkout />);

      expect(screen.getByText('128')).toBeOnTheScreen();
      expect(screen.getByText('LIVE')).toBeOnTheScreen();
    });

    it('shows signal lost while keeping the last bpm when status is stale', async () => {
      mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'stale' });

      await render(<LiveWorkout />);

      expect(screen.getByText('128')).toBeOnTheScreen();
      expect(screen.getByText('SIGNAL LOST')).toBeOnTheScreen();
    });

    it('Discard calls router.back() and touches neither bleManager nor the pairing store', async () => {
      await render(<LiveWorkout />);

      fireEvent.press(screen.getByTestId('live-workout-discard'));

      expect(back).toHaveBeenCalledTimes(1);
      expect(mockedCancelDeviceConnection).not.toHaveBeenCalled();
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });

    it('Save is present, tappable, and triggers no navigation or store change', async () => {
      await render(<LiveWorkout />);

      const connectionBefore = usePairingStore.getState().connection;

      expect(() => fireEvent.press(screen.getByTestId('live-workout-save'))).not.toThrow();

      expect(back).not.toHaveBeenCalled();
      expect(usePairingStore.getState().connection).toEqual(connectionBefore);
    });

    it('does not flip to the guard branch when connection transitions to connectionLost mid-session', async () => {
      mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'stale' });

      await render(<LiveWorkout />);

      await act(async () => {
        usePairingStore.getState().connectionLost('device-1', 'deviceDisconnected');
      });

      expect(screen.queryByText('No monitor connected')).not.toBeOnTheScreen();
      expect(screen.getByText('LIVE WORKOUT')).toBeOnTheScreen();
      expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
      expect(screen.getByText('128')).toBeOnTheScreen();
      expect(screen.getByText('SIGNAL LOST')).toBeOnTheScreen();
    });

    describe('__DEV__-only simulate-dropout trigger', () => {
      const originalDev = __DEV__;

      afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
      });

      it('renders and calls bleManager.cancelDeviceConnection when __DEV__ is true', async () => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

        await render(<LiveWorkout />);
        fireEvent.press(screen.getByTestId('live-workout-simulate-dropout'));

        expect(mockedCancelDeviceConnection).toHaveBeenCalledWith('device-1');
      });

      it('is absent when __DEV__ is false', async () => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

        await render(<LiveWorkout />);

        expect(screen.queryByTestId('live-workout-simulate-dropout')).not.toBeOnTheScreen();
      });
    });
  });
});
