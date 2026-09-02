import { getApp } from '@react-native-firebase/app';
import { getAuth, onAuthStateChanged, signOut } from '@react-native-firebase/auth';

import { getFirebaseAuth, onAuthStateChangedListener, signOutOfFirebase } from '@/auth/auth-client';

jest.mock('@react-native-firebase/app');
jest.mock('@react-native-firebase/auth');

const mockedGetApp = getApp as jest.MockedFunction<typeof getApp>;
const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedOnAuthStateChanged = onAuthStateChanged as jest.MockedFunction<
  typeof onAuthStateChanged
>;
const mockedSignOut = signOut as jest.MockedFunction<typeof signOut>;

const mockApp = { name: '[DEFAULT]' } as never;
const mockAuthModule = { app: mockApp } as never;

describe('auth-client', () => {
  beforeEach(() => {
    mockedGetApp.mockReset().mockReturnValue(mockApp);
    mockedGetAuth.mockReset().mockReturnValue(mockAuthModule);
    mockedOnAuthStateChanged.mockReset();
    mockedSignOut.mockReset();
  });

  describe('getFirebaseAuth', () => {
    it('returns getAuth(getApp())', () => {
      const result = getFirebaseAuth();

      expect(mockedGetApp).toHaveBeenCalledTimes(1);
      expect(mockedGetAuth).toHaveBeenCalledWith(mockApp);
      expect(result).toBe(mockAuthModule);
    });
  });

  describe('onAuthStateChangedListener', () => {
    it('wires through to onAuthStateChanged and returns its unsubscribe function', () => {
      const unsubscribe = jest.fn();
      mockedOnAuthStateChanged.mockReturnValue(unsubscribe);
      const callback = jest.fn();

      const result = onAuthStateChangedListener(callback);

      expect(mockedOnAuthStateChanged).toHaveBeenCalledWith(mockAuthModule, callback);
      expect(result).toBe(unsubscribe);
    });
  });

  describe('signOutOfFirebase', () => {
    it('calls signOut(getFirebaseAuth())', async () => {
      mockedSignOut.mockResolvedValue(undefined);

      await signOutOfFirebase();

      expect(mockedSignOut).toHaveBeenCalledWith(mockAuthModule);
    });

    it('swallows a thrown error', async () => {
      mockedSignOut.mockRejectedValue(new Error('network down'));

      await expect(signOutOfFirebase()).resolves.toBeUndefined();
    });
  });
});
