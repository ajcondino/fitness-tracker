import { fireEvent, render, screen } from '@testing-library/react-native';

import { HealthConnectSection } from '@/components/health-connect-section';

async function renderSection(
  status: Parameters<typeof HealthConnectSection>[0]['status'],
  overrides: Partial<Parameters<typeof HealthConnectSection>[0]> = {},
) {
  const props = {
    status,
    onGrantAccess: jest.fn(),
    onToggleWriteBack: jest.fn(),
    onOpenHealthConnectApp: jest.fn(),
    onOpenSecuritySettings: jest.fn(),
    onOpenPlayStore: jest.fn(),
    ...overrides,
  };
  await render(<HealthConnectSection {...props} />);
  return { props };
}

describe('<HealthConnectSection />', () => {
  it('renders null for checking', async () => {
    await renderSection('checking');

    expect(screen.queryByText('HEALTH CONNECT')).not.toBeOnTheScreen();
  });

  it('renders notGranted copy and calls onGrantAccess', async () => {
    const { props } = await renderSection('notGranted');

    expect(screen.getByText('HEALTH CONNECT')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Pulse can save your workout sessions and heart rate data to Health Connect.',
      ),
    ).toBeOnTheScreen();
    const action = screen.getByTestId('health-connect-grant-action');
    expect(screen.getByText('GRANT ACCESS')).toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onGrantAccess).toHaveBeenCalledTimes(1);
  });

  it('renders grantedEnabled with a checked toggle and calls onToggleWriteBack(false) when pressed', async () => {
    const { props } = await renderSection('grantedEnabled');

    expect(
      screen.getByText(
        'Workout sessions and heart rate data are saved to Health Connect automatically.',
      ),
    ).toBeOnTheScreen();
    const toggle = screen.getByTestId('health-connect-toggle');
    expect(toggle).toHaveProp('accessibilityState', { checked: true, disabled: undefined });

    fireEvent.press(toggle);
    expect(props.onToggleWriteBack).toHaveBeenCalledWith(false);
  });

  it('renders grantedDisabled with an unchecked toggle and calls onToggleWriteBack(true) when pressed', async () => {
    const { props } = await renderSection('grantedDisabled');

    expect(
      screen.getByText(
        'Turn this on to save workout sessions and heart rate data to Health Connect.',
      ),
    ).toBeOnTheScreen();
    const toggle = screen.getByTestId('health-connect-toggle');
    expect(toggle).toHaveProp('accessibilityState', { checked: false, disabled: undefined });

    fireEvent.press(toggle);
    expect(props.onToggleWriteBack).toHaveBeenCalledWith(true);
  });

  it('renders unavailable copy and calls onOpenPlayStore', async () => {
    const { props } = await renderSection('unavailable');

    expect(
      screen.getByText(
        "Health Connect isn't available on this device. Install or update it from Google Play to enable syncing.",
      ),
    ).toBeOnTheScreen();
    const action = screen.getByTestId('health-connect-action');
    expect(screen.getByText('OPEN GOOGLE PLAY')).toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onOpenPlayStore).toHaveBeenCalledTimes(1);
  });

  it('renders noScreenLock copy and calls onOpenSecuritySettings', async () => {
    const { props } = await renderSection('noScreenLock');

    expect(
      screen.getByText(
        'Health Connect requires a screen lock. Set a PIN, pattern, or password to enable it.',
      ),
    ).toBeOnTheScreen();
    const action = screen.getByTestId('health-connect-action');
    expect(screen.getByText('OPEN SECURITY SETTINGS')).toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onOpenSecuritySettings).toHaveBeenCalledTimes(1);
  });

  it('renders permissionExhausted copy with only the OPEN HEALTH CONNECT APP action, calling onOpenHealthConnectApp', async () => {
    const { props } = await renderSection('permissionExhausted');

    expect(
      screen.getByText(
        "You've already responded to this request twice, so Pulse can't ask again here. Open the Health Connect app to grant access manually.",
      ),
    ).toBeOnTheScreen();
    const action = screen.getByTestId('health-connect-action');
    expect(screen.getByText('OPEN HEALTH CONNECT APP')).toBeOnTheScreen();
    expect(screen.queryByTestId('health-connect-grant-action')).not.toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onOpenHealthConnectApp).toHaveBeenCalledTimes(1);
  });
});
