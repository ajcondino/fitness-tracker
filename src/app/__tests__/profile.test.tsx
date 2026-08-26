import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import Profile from '@/app/profile';
import { useHealthConnectSettings } from '@/hooks/use-health-connect-settings';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/hooks/use-health-connect-settings');

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedUseHealthConnectSettings = useHealthConnectSettings as jest.MockedFunction<
  typeof useHealthConnectSettings
>;

function mockHealthConnectSettings(
  overrides: Partial<ReturnType<typeof useHealthConnectSettings>> = {},
) {
  mockedUseHealthConnectSettings.mockReturnValue({
    status: 'checking',
    grantAccess: jest.fn(),
    setWriteBackEnabled: jest.fn(),
    openHealthConnectApp: jest.fn(),
    openSecuritySettings: jest.fn(),
    openPlayStore: jest.fn(),
    ...overrides,
  });
}

describe('<Profile />', () => {
  const back = jest.fn();

  beforeEach(() => {
    back.mockClear();
    mockedUseRouter.mockReturnValue({ back } as unknown as ReturnType<typeof useRouter>);
    mockedUseHealthConnectSettings.mockReset();
  });

  it('renders the title and back chevron', async () => {
    mockHealthConnectSettings();

    await render(<Profile />);

    expect(screen.getByText('Profile')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-back')).toBeOnTheScreen();
  });

  it('calls router.back() when the back chevron is pressed', async () => {
    mockHealthConnectSettings();

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-back'));
    });

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("passes the hook's live status through to HealthConnectSection", async () => {
    mockHealthConnectSettings({ status: 'notGranted' });

    await render(<Profile />);

    expect(screen.getByText('HEALTH CONNECT')).toBeOnTheScreen();
    expect(screen.getByTestId('health-connect-grant-action')).toBeOnTheScreen();
  });

  it('renders nothing from HealthConnectSection while checking', async () => {
    mockHealthConnectSettings({ status: 'checking' });

    await render(<Profile />);

    expect(screen.queryByText('HEALTH CONNECT')).not.toBeOnTheScreen();
  });

  it("wires grantAccess through to the section's grant action", async () => {
    const grantAccess = jest.fn();
    mockHealthConnectSettings({ status: 'notGranted', grantAccess });

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('health-connect-grant-action'));
    });

    expect(grantAccess).toHaveBeenCalledTimes(1);
  });
});
