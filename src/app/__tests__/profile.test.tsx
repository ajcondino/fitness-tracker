import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import Profile from '@/app/profile';
import { useAuth } from '@/hooks/use-auth';
import { useHealthConnectSettings } from '@/hooks/use-health-connect-settings';
import { usePreferencesSync } from '@/hooks/use-preferences-sync';
import { useUnitsPreference } from '@/hooks/use-units-preference';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/hooks/use-health-connect-settings');
jest.mock('@/hooks/use-auth');
jest.mock('@/hooks/use-preferences-sync');
jest.mock('@/hooks/use-units-preference');

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedUseHealthConnectSettings = useHealthConnectSettings as jest.MockedFunction<
  typeof useHealthConnectSettings
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUsePreferencesSync = usePreferencesSync as jest.MockedFunction<
  typeof usePreferencesSync
>;
const mockedUseUnitsPreference = useUnitsPreference as jest.MockedFunction<
  typeof useUnitsPreference
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

function mockUnitsPreference(overrides: Partial<ReturnType<typeof useUnitsPreference>> = {}) {
  mockedUseUnitsPreference.mockReturnValue({
    distance: 'metric',
    weight: 'metric',
    setDistanceUnit: jest.fn(),
    setWeightUnit: jest.fn(),
    ...overrides,
  });
}

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  mockedUseAuth.mockReturnValue({
    status: 'checking',
    user: null,
    signInError: null,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  });
}

describe('<Profile />', () => {
  const back = jest.fn();

  beforeEach(() => {
    back.mockClear();
    mockedUseRouter.mockReturnValue({ back } as unknown as ReturnType<typeof useRouter>);
    mockedUseHealthConnectSettings.mockReset();
    mockedUseAuth.mockReset();
    mockedUsePreferencesSync.mockReset();
    mockedUseUnitsPreference.mockReset();
    mockUnitsPreference();
  });

  it('renders the title and back chevron', async () => {
    mockHealthConnectSettings();
    mockAuth();

    await render(<Profile />);

    expect(screen.getByText('Profile')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-back')).toBeOnTheScreen();
  });

  it('calls router.back() when the back chevron is pressed', async () => {
    mockHealthConnectSettings();
    mockAuth();

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-back'));
    });

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("passes the hook's live status through to HealthConnectSection", async () => {
    mockHealthConnectSettings({ status: 'notGranted' });
    mockAuth();

    await render(<Profile />);

    expect(screen.getByText('HEALTH CONNECT')).toBeOnTheScreen();
    expect(screen.getByTestId('health-connect-grant-action')).toBeOnTheScreen();
  });

  it('renders nothing from HealthConnectSection while checking', async () => {
    mockHealthConnectSettings({ status: 'checking' });
    mockAuth();

    await render(<Profile />);

    expect(screen.queryByText('HEALTH CONNECT')).not.toBeOnTheScreen();
  });

  it("wires grantAccess through to the section's grant action", async () => {
    const grantAccess = jest.fn();
    mockHealthConnectSettings({ status: 'notGranted', grantAccess });
    mockAuth();

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('health-connect-grant-action'));
    });

    expect(grantAccess).toHaveBeenCalledTimes(1);
  });

  it("passes the hook's live status through to AccountSection", async () => {
    mockHealthConnectSettings();
    mockAuth({ status: 'signedOut' });

    await render(<Profile />);

    expect(screen.getByText('Not signed in')).toBeOnTheScreen();
    expect(screen.getByTestId('account-sign-in-action')).toBeOnTheScreen();
  });

  it('renders nothing from AccountSection while checking', async () => {
    mockHealthConnectSettings();
    mockAuth({ status: 'checking' });

    await render(<Profile />);

    expect(screen.queryByText('Not signed in')).not.toBeOnTheScreen();
  });

  it("wires signInWithGoogle through to AccountSection's sign-in action", async () => {
    const signInWithGoogle = jest.fn();
    mockHealthConnectSettings();
    mockAuth({ status: 'signedOut', signInWithGoogle });

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-sign-in-action'));
    });

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('shows the signed-in identity header (name + email, no placeholder copy)', async () => {
    mockHealthConnectSettings();
    mockAuth({
      status: 'signedIn',
      user: { uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' },
    });

    await render(<Profile />);

    expect(screen.getByText('AJ')).toBeOnTheScreen();
    expect(screen.getByText('aj@pulse.app')).toBeOnTheScreen();
    expect(screen.queryByText('Not signed in')).not.toBeOnTheScreen();
  });

  it.each(['signedOut', 'signingIn', 'error'] as const)(
    'shows the signed-out identity placeholder for status %s, never an empty identity row',
    async (status) => {
      mockHealthConnectSettings();
      mockAuth({ status });

      await render(<Profile />);

      expect(screen.getByText('Not signed in')).toBeOnTheScreen();
      expect(screen.getByText('Workouts saved on this device')).toBeOnTheScreen();
    },
  );

  it("wires signOut through to AccountSection's sign-out action", async () => {
    const signOut = jest.fn();
    mockHealthConnectSettings();
    mockAuth({
      status: 'signedIn',
      user: { uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' },
      signOut,
    });

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-sign-out-action'));
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("passes the hook's live values through to UnitsSection", async () => {
    mockHealthConnectSettings();
    mockAuth();
    mockUnitsPreference({ distance: 'imperial', weight: 'imperial' });

    await render(<Profile />);

    expect(screen.getByText('UNITS')).toBeOnTheScreen();
    expect(screen.getByTestId('units-distance-toggle').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('units-weight-toggle').props.accessibilityState.checked).toBe(true);
  });

  it("wires setDistanceUnit through to the section's distance toggle", async () => {
    const setDistanceUnit = jest.fn();
    mockHealthConnectSettings();
    mockAuth();
    mockUnitsPreference({ setDistanceUnit });

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('units-distance-toggle'));
    });

    expect(setDistanceUnit).toHaveBeenCalledWith('imperial');
  });

  it("wires setWeightUnit through to the section's weight toggle", async () => {
    const setWeightUnit = jest.fn();
    mockHealthConnectSettings();
    mockAuth();
    mockUnitsPreference({ setWeightUnit });

    await render(<Profile />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('units-weight-toggle'));
    });

    expect(setWeightUnit).toHaveBeenCalledWith('imperial');
  });

  it('wires usePreferencesSync with the auth status/uid and units values/setters', async () => {
    const setDistanceUnit = jest.fn();
    const setWeightUnit = jest.fn();
    mockHealthConnectSettings();
    mockAuth({
      status: 'signedIn',
      user: { uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' },
    });
    mockUnitsPreference({
      distance: 'imperial',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await render(<Profile />);

    expect(mockedUsePreferencesSync).toHaveBeenCalledWith({
      authStatus: 'signedIn',
      uid: 'uid-1',
      distance: 'imperial',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });
  });

  it('wires usePreferencesSync with a null uid when signed out', async () => {
    mockHealthConnectSettings();
    mockAuth({ status: 'signedOut', user: null });

    await render(<Profile />);

    expect(mockedUsePreferencesSync).toHaveBeenCalledWith(
      expect.objectContaining({ authStatus: 'signedOut', uid: null }),
    );
  });
});
