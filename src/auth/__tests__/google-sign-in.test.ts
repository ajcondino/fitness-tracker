import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from '@react-native-firebase/auth';

import { signInWithGoogle } from '@/auth/google-sign-in';

jest.mock('@react-native-google-signin/google-signin');
jest.mock('@react-native-firebase/auth');
jest.mock('@/auth/auth-client', () => ({
  getFirebaseAuth: jest.fn().mockReturnValue('mock-auth-module'),
}));

const mockedConfigure = GoogleSignin.configure as jest.MockedFunction<
  typeof GoogleSignin.configure
>;
const mockedHasPlayServices = GoogleSignin.hasPlayServices as jest.MockedFunction<
  typeof GoogleSignin.hasPlayServices
>;
const mockedSignIn = GoogleSignin.signIn as jest.MockedFunction<typeof GoogleSignin.signIn>;
const mockedCredential = GoogleAuthProvider.credential as jest.MockedFunction<
  typeof GoogleAuthProvider.credential
>;
const mockedSignInWithCredential = signInWithCredential as jest.MockedFunction<
  typeof signInWithCredential
>;

describe('signInWithGoogle', () => {
  beforeEach(() => {
    mockedConfigure.mockClear();
    mockedHasPlayServices.mockReset().mockResolvedValue(true);
    mockedSignIn.mockReset();
    mockedCredential.mockReset().mockReturnValue('mock-credential' as never);
    mockedSignInWithCredential.mockReset();
  });

  it('configures GoogleSignin with the real web client ID exactly once across calls', async () => {
    mockedSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'token' } } as never);
    mockedSignInWithCredential.mockResolvedValue(undefined as never);

    await signInWithGoogle();
    await signInWithGoogle();

    expect(mockedConfigure).toHaveBeenCalledTimes(1);
    expect(mockedConfigure).toHaveBeenCalledWith({
      webClientId: '137085192482-rrorb8qb6524kvo7g9oda6gkh4cuqmk2.apps.googleusercontent.com',
    });
  });

  it('resolves success and signs in to Firebase with the returned idToken', async () => {
    mockedSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'the-id-token' } } as never);
    mockedSignInWithCredential.mockResolvedValue(undefined as never);

    const result = await signInWithGoogle();

    expect(result).toEqual({ status: 'success' });
    expect(mockedCredential).toHaveBeenCalledWith('the-id-token');
    expect(mockedSignInWithCredential).toHaveBeenCalledWith('mock-auth-module', 'mock-credential');
  });

  it('resolves cancelled when GoogleSignin.signIn() resolves a cancelled response, without calling Firebase', async () => {
    mockedSignIn.mockResolvedValue({ type: 'cancelled', data: null } as never);

    const result = await signInWithGoogle();

    expect(result).toEqual({ status: 'cancelled' });
    expect(mockedSignInWithCredential).not.toHaveBeenCalled();
  });

  it('resolves error/unknown on a null idToken, without calling Firebase', async () => {
    mockedSignIn.mockResolvedValue({ type: 'success', data: { idToken: null } } as never);

    const result = await signInWithGoogle();

    expect(result).toEqual({ status: 'error', reason: 'unknown' });
    expect(mockedSignInWithCredential).not.toHaveBeenCalled();
  });

  it("resolves error/network when signInWithCredential rejects with Firebase's auth/network-request-failed", async () => {
    mockedSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'token' } } as never);
    mockedSignInWithCredential.mockRejectedValue(
      Object.assign(new Error('network'), { code: 'auth/network-request-failed' }),
    );

    const result = await signInWithGoogle();

    expect(result).toEqual({ status: 'error', reason: 'network' });
  });

  it('resolves error/unknown when GoogleSignin.hasPlayServices() rejects', async () => {
    mockedHasPlayServices.mockRejectedValue(
      Object.assign(new Error('play services unavailable'), {
        code: 'PLAY_SERVICES_NOT_AVAILABLE',
      }),
    );

    const result = await signInWithGoogle();

    expect(result).toEqual({ status: 'error', reason: 'unknown' });
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it('resolves error/unknown for any other thrown error', async () => {
    mockedSignIn.mockRejectedValue(new Error('something else'));

    const result = await signInWithGoogle();

    expect(result).toEqual({ status: 'error', reason: 'unknown' });
  });
});
