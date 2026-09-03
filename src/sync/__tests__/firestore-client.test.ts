import { getApp } from '@react-native-firebase/app';
import { getFirestore } from '@react-native-firebase/firestore';

import { getFirebaseFirestore } from '@/sync/firestore-client';

jest.mock('@react-native-firebase/app');
jest.mock('@react-native-firebase/firestore');

const mockedGetApp = getApp as jest.MockedFunction<typeof getApp>;
const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

const mockApp = { name: '[DEFAULT]' } as never;
const mockFirestoreModule = { app: mockApp } as never;

describe('firestore-client', () => {
  beforeEach(() => {
    mockedGetApp.mockReset().mockReturnValue(mockApp);
    mockedGetFirestore.mockReset().mockReturnValue(mockFirestoreModule);
  });

  describe('getFirebaseFirestore', () => {
    it('returns getFirestore(getApp())', () => {
      const result = getFirebaseFirestore();

      expect(mockedGetApp).toHaveBeenCalledTimes(1);
      expect(mockedGetFirestore).toHaveBeenCalledWith(mockApp);
      expect(result).toBe(mockFirestoreModule);
    });
  });
});
