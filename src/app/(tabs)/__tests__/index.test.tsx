import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import Index from '@/app/(tabs)/index';
import { usePairingStore } from '@/ble/pairing-store';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('<Index /> (Home)', () => {
  const navigate = jest.fn();

  beforeEach(() => {
    navigate.mockClear();
    mockedUseRouter.mockReturnValue({ navigate } as unknown as ReturnType<typeof useRouter>);
    usePairingStore.getState().reset();
  });

  it('keeps the existing header copy', async () => {
    await render(<Index />);

    expect(screen.getByText('Home')).toBeOnTheScreen();
    expect(screen.getByText('Start, monitor, and stop your workout session.')).toBeOnTheScreen();
  });

  it('renders the fixed disconnected device card copy and navigates to /device on press', async () => {
    await render(<Index />);

    expect(screen.getByText('No monitor connected')).toBeOnTheScreen();
    expect(screen.getByText('Tap to pair a heart-rate monitor')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('device-card'));

    expect(navigate).toHaveBeenCalledWith('/device');
  });

  it('renders the hero CTA and navigates to /device on press', async () => {
    await render(<Index />);

    const cta = screen.getByTestId('home-hero-cta');
    expect(screen.getByText('CONNECT A MONITOR')).toBeOnTheScreen();

    fireEvent.press(cta);

    expect(navigate).toHaveBeenCalledWith('/device');
  });

  it('disables the Start Workout control with a hint when no device is connected, and press is a no-op', async () => {
    await render(<Index />);

    expect(screen.getByText('Connect a device first')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('home-start-workout-cta'));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('enables the Start Workout control with no hint when a device is connected, and navigates to /live-workout on press', async () => {
    usePairingStore.setState({ connection: { kind: 'connected', deviceId: 'device-1' } });

    await render(<Index />);

    expect(screen.queryByText('Connect a device first')).not.toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('home-start-workout-cta'));

    expect(navigate).toHaveBeenCalledWith('/live-workout');
  });
});
