import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AccountSection } from '@/components/account-section';

const SIGNED_IN_USER = { uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' };

async function renderSection(props: Partial<Parameters<typeof AccountSection>[0]> = {}) {
  const merged = {
    status: 'signedOut' as const,
    user: null,
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

    expect(screen.queryByText('Not signed in')).not.toBeOnTheScreen();
  });

  it('renders the signed-out identity placeholder, no ACCOUNT label, body copy, and a Google button', async () => {
    const { props } = await renderSection({ status: 'signedOut' });

    expect(screen.queryByText('ACCOUNT')).not.toBeOnTheScreen();
    expect(screen.getByText('Not signed in')).toBeOnTheScreen();
    expect(screen.getByText('Workouts saved on this device')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Sign in to carry your units to another phone. Workouts stay on this device either way.',
      ),
    ).toBeOnTheScreen();

    const action = screen.getByTestId('account-sign-in-action');
    expect(screen.getByText('SIGN IN WITH GOOGLE')).toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders the same signed-out identity placeholder for signingIn, never empty', async () => {
    await renderSection({ status: 'signingIn' });
    expect(screen.getByText('Not signed in')).toBeOnTheScreen();
  });

  it('renders the same signed-out identity placeholder for error, never empty', async () => {
    await renderSection({ status: 'error' });
    expect(screen.getByText('Not signed in')).toBeOnTheScreen();
  });

  it('renders a signing-in row with no buttons', async () => {
    await renderSection({ status: 'signingIn' });

    expect(screen.getByText('Signing in…')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-sign-in-action')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('account-dismiss-error-action')).not.toBeOnTheScreen();
  });

  it('renders the error state with a reason-agnostic body and both actions', async () => {
    const { props } = await renderSection({ status: 'error' });

    expect(screen.getByText("Couldn't sign in")).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Check your connection and try again. Nothing was lost — your workouts are still on this device.',
      ),
    ).toBeOnTheScreen();

    const retry = screen.getByTestId('account-sign-in-action');
    expect(screen.getByText('TRY AGAIN')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(retry);
    });
    expect(props.onSignIn).toHaveBeenCalledTimes(1);

    const dismiss = screen.getByTestId('account-dismiss-error-action');
    expect(screen.getByText('NOT NOW')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(dismiss);
    });
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('renders the signed-in identity (initial, name, email) plus a sign-out pill, nothing else below', async () => {
    const { props } = await renderSection({ status: 'signedIn', user: SIGNED_IN_USER });

    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(screen.getByText('AJ')).toBeOnTheScreen();
    expect(screen.getByText('aj@pulse.app')).toBeOnTheScreen();
    expect(screen.queryByText('Not signed in')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('account-sign-in-action')).not.toBeOnTheScreen();

    const action = screen.getByTestId('account-sign-out-action');
    expect(screen.getByText('SIGN OUT')).toBeOnTheScreen();

    fireEvent.press(action);
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('degrades to email-only when displayName is null, without rendering the literal "null"', async () => {
    await renderSection({
      status: 'signedIn',
      user: { uid: 'uid-1', displayName: null, email: 'aj@pulse.app' },
    });

    // Both the primary and secondary line fall back to the email — the
    // primary line's fallback is what makes this "email-only," not empty.
    expect(screen.getAllByText('aj@pulse.app')).toHaveLength(2);
    expect(screen.queryByText('null')).not.toBeOnTheScreen();
  });
});
