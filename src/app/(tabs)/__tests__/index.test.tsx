import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import Index from '@/app/(tabs)/index';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('<Index /> (Home)', () => {
  const navigate = jest.fn();

  beforeEach(() => {
    navigate.mockClear();
    mockedUseRouter.mockReturnValue({ navigate } as unknown as ReturnType<typeof useRouter>);
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
});
