import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountSection } from '@/components/account-section';

async function renderSection(props: Partial<Parameters<typeof AccountSection>[0]> = {}) {
  const merged = {
    status: 'signedOut' as const,
    user: null,
    signInError: null,
    onSignIn: jest.fn(),
    onSignOut: jest.fn(),
    ...props,
  };
  await render(<AccountSection {...merged} />);
  return { props: merged };
}

describe('<AccountSection />', () => {
  it('renders null for checking', async () => {
    await renderSection({ status: 'checking' });

    expect(screen.queryByText('ACCOUNT')).not.toBeOnTheScreen();
  });

  it('renders signedOut copy and calls onSignIn', async () => {
    const { props } = await renderSection({ status: 'signedOut' });

    expect(screen.getByText('ACCOUNT')).toBeOnTheScreen();
    expect(screen.getByText('Sign in to sync your settings')).toBeOnTheScreen();
    const action = screen.getByTestId('account-sign-in-action');
    expect(screen.getByText('SIGN IN WITH GOOGLE')).toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders signingIn with the same copy, a disabled control, and the signingIn label', async () => {
    await renderSection({ status: 'signingIn' });

    expect(screen.getByText('Sign in to sync your settings')).toBeOnTheScreen();
    const action = screen.getByTestId('account-sign-in-action');
    expect(screen.getByText('SIGNING IN…')).toBeOnTheScreen();
    expect(action.props.accessibilityState?.disabled).toBe(true);
  });

  it('renders the network error body and re-enables a TRY AGAIN control that retries sign-in', async () => {
    const { props } = await renderSection({ status: 'error', signInError: 'network' });

    expect(
      screen.getByText("Couldn't sign in — check your connection and try again."),
    ).toBeOnTheScreen();
    const action = screen.getByTestId('account-sign-in-action');
    expect(screen.getByText('TRY AGAIN')).toBeOnTheScreen();
    expect(action.props.accessibilityState?.disabled).not.toBe(true);

    fireEvent.press(action);
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders the unknown error body', async () => {
    await renderSection({ status: 'error', signInError: 'unknown' });

    expect(screen.getByText('Sign-in failed. Try again.')).toBeOnTheScreen();
  });

  it('renders the signedIn identity row and calls onSignOut', async () => {
    const { props } = await renderSection({
      status: 'signedIn',
      user: { uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' },
    });

    expect(screen.getByText('AJ')).toBeOnTheScreen();
    expect(screen.getByText('aj@pulse.app')).toBeOnTheScreen();
    const action = screen.getByTestId('account-sign-out-action');
    expect(screen.getByText('SIGN OUT')).toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('degrades to name-only when email is null, without rendering the literal "null"', async () => {
    await renderSection({
      status: 'signedIn',
      user: { uid: 'uid-1', displayName: 'AJ', email: null },
    });

    expect(screen.getByText('AJ')).toBeOnTheScreen();
    expect(screen.queryByText('null')).not.toBeOnTheScreen();
  });
});
