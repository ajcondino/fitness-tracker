import { doc, getDoc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';

import { getFirebaseFirestore } from '@/sync/firestore-client';
import { fetchRemotePreferences, writeRemotePreferences } from '@/sync/preferences-store';

jest.mock('@react-native-firebase/firestore');
jest.mock('@/sync/firestore-client');

const mockedGetFirebaseFirestore = getFirebaseFirestore as jest.MockedFunction<
  typeof getFirebaseFirestore
>;
const mockedDoc = doc as jest.MockedFunction<typeof doc>;
const mockedGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockedSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;
const mockedServerTimestamp = serverTimestamp as jest.MockedFunction<typeof serverTimestamp>;

const mockFirestore = { app: {} } as never;
const mockDocRef = { path: 'users/uid-1/preferences/settings' } as never;
const mockFieldValue = { _type: 'serverTimestamp' } as never;

describe('preferences-store', () => {
  beforeEach(() => {
    mockedGetFirebaseFirestore.mockReset().mockReturnValue(mockFirestore);
    mockedDoc.mockReset().mockReturnValue(mockDocRef);
    mockedGetDoc.mockReset();
    mockedSetDoc.mockReset();
    mockedServerTimestamp.mockReset().mockReturnValue(mockFieldValue);
  });

  describe('fetchRemotePreferences', () => {
    it('resolves the document data at users/{uid}/preferences/settings when it exists', async () => {
      const remoteData = {
        units: { distance: 'imperial', weight: 'imperial' },
        updatedAt: mockFieldValue,
      };
      mockedGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => remoteData,
      } as never);

      const result = await fetchRemotePreferences('uid-1');

      expect(mockedDoc).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        'uid-1',
        'preferences',
        'settings',
      );
      expect(mockedGetDoc).toHaveBeenCalledWith(mockDocRef);
      expect(result).toEqual(remoteData);
    });

    it('resolves null when the document does not exist', async () => {
      mockedGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => undefined,
      } as never);

      const result = await fetchRemotePreferences('uid-1');

      expect(result).toBeNull();
    });

    it('propagates a thrown read rather than swallowing it', async () => {
      mockedGetDoc.mockRejectedValue(new Error('offline, no cache'));

      await expect(fetchRemotePreferences('uid-1')).rejects.toThrow('offline, no cache');
    });
  });

  describe('writeRemotePreferences', () => {
    it('calls setDoc with merge:true and a serverTimestamp()-derived updatedAt', async () => {
      mockedSetDoc.mockResolvedValue(undefined);
      const units = { distance: 'imperial', weight: 'metric' } as const;

      await writeRemotePreferences('uid-1', units);

      expect(mockedDoc).toHaveBeenCalledWith(
        mockFirestore,
        'users',
        'uid-1',
        'preferences',
        'settings',
      );
      expect(mockedSetDoc).toHaveBeenCalledWith(
        mockDocRef,
        { units, updatedAt: mockFieldValue },
        { merge: true },
      );
    });

    it('propagates a thrown write rather than swallowing it', async () => {
      mockedSetDoc.mockRejectedValue(new Error('permission denied'));

      await expect(
        writeRemotePreferences('uid-1', { distance: 'metric', weight: 'metric' }),
      ).rejects.toThrow('permission denied');
    });
  });
});
