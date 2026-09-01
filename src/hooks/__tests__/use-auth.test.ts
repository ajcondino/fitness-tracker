import { act, renderHook } from '@testing-library/react-native';

import { onAuthStateChangedListener, signOutOfFirebase } from '@/auth/auth-client';
import { signInWithGoogle } from '@/auth/google-sign-in';
import { useAuth } from '@/hooks/use-auth';

jest.mock('@/auth/auth-client');
jest.mock('@/auth/google-sign-in');

const mockedOnAuthStateChangedListener = onAuthStateChangedListener as jest.MockedFunction<
  typeof onAuthStateChangedListener
>;
const mockedSignOutOfFirebase = signOutOfFirebase as jest.MockedFunction<typeof signOutOfFirebase>;
const mockedSignInWithGoogle = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;

// Full control over when/how the listener fires, rather than a real
// Firebase subscription — mirrors use-health-connect-settings.test.ts's own
// AppState helper for the same reason.
function mockListener() {
  let callback: (
    user: Parameters<Parameters<typeof onAuthStateChangedListener>[0]>[0],
  ) => void = () => {};
  const unsubscribe = jest.fn();
  mockedOnAuthStateChangedListener.mockImplementation((cb) => {
    callback = cb;
    return unsubscribe;
  });
  return { fire: (user: Parameters<typeof callback>[0]) => callback(user), unsubscribe };
}

describe('useAuth', () => {
  beforeEach(() => {
    mockedOnAuthStateChangedListener.mockReset();
    mockedSignOutOfFirebase.mockReset().mockResolvedValue(undefined);
    mockedSignInWithGoogle.mockReset();
  });

  it('starts checking, then resolves signedOut when the listener fires null', async () => {
    const { fire } = mockListener();

    const { result } = await renderHook(() => useAuth());
    expect(result.current.status).toBe('checking');

    await act(async () => {
      fire(null);
    });

    expect(result.current.status).toBe('signedOut');
    expect(result.current.user).toBeNull();
  });

  it('resolves signedIn with a mapped user when the listener fires a user', async () => {
    const { fire } = mockListener();

    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      fire({ uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' } as never);
    });

    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual({ uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' });
  });

  it('reaches signedIn on the very first listener call, without ever passing through signedOut (simulated cold-start restore)', async () => {
    mockedOnAuthStateChangedListener.mockImplementation((cb) => {
      cb({ uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' } as never);
      return jest.fn();
    });

    const { result } = await renderHook(() => useAuth());

    expect(result.current.status).toBe('signedIn');
  });

  describe('signInWithGoogle', () => {
    it('sets signingIn immediately, and on success leaves the listener to land on signedIn', async () => {
      const { fire } = mockListener();
      let resolveSignIn: (value: Awaited<ReturnType<typeof signInWithGoogle>>) => void = () => {};
      mockedSignInWithGoogle.mockReturnValue(
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
      );

      const { result } = await renderHook(() => useAuth());
      await act(async () => {
        fire(null);
      });

      await act(async () => {
        result.current.signInWithGoogle();
      });
      expect(result.current.status).toBe('signingIn');

      await act(async () => {
        resolveSignIn({ status: 'success' });
      });
      // signInWithGoogle() itself never sets 'signedIn' — only the listener does.
      expect(result.current.status).toBe('signingIn');

      await act(async () => {
        fire({ uid: 'uid-1', displayName: 'AJ', email: null } as never);
      });
      expect(result.current.status).toBe('signedIn');
    });

    it('on cancellation, returns to signedOut with no error recorded', async () => {
      const { fire } = mockListener();
      mockedSignInWithGoogle.mockResolvedValue({ status: 'cancelled' });

      const { result } = await renderHook(() => useAuth());
      await act(async () => {
        fire(null);
      });

      await act(async () => {
        result.current.signInWithGoogle();
      });

      expect(result.current.status).toBe('signedOut');
      expect(result.current.signInError).toBeNull();
    });

    it('on error, sets status to error and records the failure reason', async () => {
      const { fire } = mockListener();
      mockedSignInWithGoogle.mockResolvedValue({ status: 'error', reason: 'network' });

      const { result } = await renderHook(() => useAuth());
      await act(async () => {
        fire(null);
      });

      await act(async () => {
        result.current.signInWithGoogle();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.signInError).toBe('network');
    });

    it('is a no-op while already signingIn — never issues a second concurrent attempt', async () => {
      const { fire } = mockListener();
      mockedSignInWithGoogle.mockReturnValue(new Promise(() => {}));

      const { result } = await renderHook(() => useAuth());
      await act(async () => {
        fire(null);
      });

      await act(async () => {
        result.current.signInWithGoogle();
      });
      await act(async () => {
        result.current.signInWithGoogle();
      });

      expect(mockedSignInWithGoogle).toHaveBeenCalledTimes(1);
    });
  });

  describe('signOut', () => {
    it('optimistically sets signedOut/null before signOutOfFirebase resolves', async () => {
      const { fire } = mockListener();
      let resolveSignOut: () => void = () => {};
      mockedSignOutOfFirebase.mockReturnValue(
        new Promise((resolve) => {
          resolveSignOut = resolve;
        }),
      );

      const { result } = await renderHook(() => useAuth());
      await act(async () => {
        fire({ uid: 'uid-1', displayName: 'AJ', email: 'aj@pulse.app' } as never);
      });
      expect(result.current.status).toBe('signedIn');

      await act(async () => {
        result.current.signOut();
      });

      expect(result.current.status).toBe('signedOut');
      expect(result.current.user).toBeNull();
      expect(mockedSignOutOfFirebase).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSignOut();
      });
    });
  });
});
