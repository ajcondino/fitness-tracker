import { act, renderHook } from '@testing-library/react-native';

import type { AccountSectionStatus } from '@/auth/auth-types';
import { usePreferencesSync } from '@/hooks/use-preferences-sync';
import { fetchRemotePreferences, writeRemotePreferences } from '@/sync/preferences-store';

jest.mock('@/sync/preferences-store');

const mockedFetchRemotePreferences = fetchRemotePreferences as jest.MockedFunction<
  typeof fetchRemotePreferences
>;
const mockedWriteRemotePreferences = writeRemotePreferences as jest.MockedFunction<
  typeof writeRemotePreferences
>;

type Props = {
  authStatus: AccountSectionStatus;
  uid: string | null;
  distance: 'metric' | 'imperial';
  weight: 'metric' | 'imperial';
  setDistanceUnit: (system: 'metric' | 'imperial') => void;
  setWeightUnit: (system: 'metric' | 'imperial') => void;
};

function renderPreferencesSync(props: Props) {
  return renderHook((p: Props) => usePreferencesSync(p), { initialProps: props });
}

describe('usePreferencesSync', () => {
  const setDistanceUnit = jest.fn();
  const setWeightUnit = jest.fn();

  beforeEach(() => {
    setDistanceUnit.mockClear();
    setWeightUnit.mockClear();
    mockedFetchRemotePreferences.mockReset();
    mockedWriteRemotePreferences.mockReset();
  });

  it('makes no Firestore call while signed out, including across a distance/weight change', async () => {
    const { rerender } = await renderPreferencesSync({
      authStatus: 'signedOut',
      uid: null,
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await act(async () => {
      await rerender({
        authStatus: 'signedOut',
        uid: null,
        distance: 'imperial',
        weight: 'imperial',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    expect(mockedFetchRemotePreferences).not.toHaveBeenCalled();
    expect(mockedWriteRemotePreferences).not.toHaveBeenCalled();
  });

  it('makes no Firestore call while checking', async () => {
    await renderPreferencesSync({
      authStatus: 'checking',
      uid: null,
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    expect(mockedFetchRemotePreferences).not.toHaveBeenCalled();
    expect(mockedWriteRemotePreferences).not.toHaveBeenCalled();
  });

  it('pulls and applies the remote values on a transition to signedIn when a remote document exists', async () => {
    mockedFetchRemotePreferences.mockResolvedValue({
      units: { distance: 'imperial', weight: 'imperial' },
      updatedAt: {} as never,
    });
    mockedWriteRemotePreferences.mockResolvedValue(undefined);

    const { rerender } = await renderPreferencesSync({
      authStatus: 'checking',
      uid: null,
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await act(async () => {
      await rerender({
        authStatus: 'signedIn',
        uid: 'uid-1',
        distance: 'metric',
        weight: 'metric',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    expect(mockedFetchRemotePreferences).toHaveBeenCalledWith('uid-1');
    expect(setDistanceUnit).toHaveBeenCalledWith('imperial');
    expect(setWeightUnit).toHaveBeenCalledWith('imperial');
  });

  it('seeds a never-synced account by pushing the current local values, without calling the setters', async () => {
    mockedFetchRemotePreferences.mockResolvedValue(null);
    mockedWriteRemotePreferences.mockResolvedValue(undefined);

    const { rerender } = await renderPreferencesSync({
      authStatus: 'checking',
      uid: null,
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await act(async () => {
      await rerender({
        authStatus: 'signedIn',
        uid: 'uid-1',
        distance: 'metric',
        weight: 'metric',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    expect(mockedWriteRemotePreferences).toHaveBeenCalledWith('uid-1', {
      distance: 'metric',
      weight: 'metric',
    });
    expect(setDistanceUnit).not.toHaveBeenCalled();
    expect(setWeightUnit).not.toHaveBeenCalled();
  });

  it('swallows a rejected pull and still allows the push effect to run', async () => {
    mockedFetchRemotePreferences.mockRejectedValue(new Error('offline'));
    mockedWriteRemotePreferences.mockResolvedValue(undefined);

    const { rerender } = await renderPreferencesSync({
      authStatus: 'checking',
      uid: null,
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await act(async () => {
      await rerender({
        authStatus: 'signedIn',
        uid: 'uid-1',
        distance: 'metric',
        weight: 'metric',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    expect(mockedWriteRemotePreferences).toHaveBeenCalledWith('uid-1', {
      distance: 'metric',
      weight: 'metric',
    });
    expect(setDistanceUnit).not.toHaveBeenCalled();
    expect(setWeightUnit).not.toHaveBeenCalled();
  });

  it('pushes again on a distance/weight change while already signedIn', async () => {
    mockedFetchRemotePreferences.mockResolvedValue(null);
    mockedWriteRemotePreferences.mockResolvedValue(undefined);

    const { rerender } = await renderPreferencesSync({
      authStatus: 'signedIn',
      uid: 'uid-1',
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await act(async () => {
      await rerender({
        authStatus: 'signedIn',
        uid: 'uid-1',
        distance: 'imperial',
        weight: 'metric',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    expect(mockedWriteRemotePreferences).toHaveBeenLastCalledWith('uid-1', {
      distance: 'imperial',
      weight: 'metric',
    });
  });

  it('does not throw when a push is rejected', async () => {
    mockedFetchRemotePreferences.mockResolvedValue(null);
    mockedWriteRemotePreferences.mockRejectedValue(new Error('offline'));

    const { rerender } = await renderPreferencesSync({
      authStatus: 'signedIn',
      uid: 'uid-1',
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await act(async () => {
      await rerender({
        authStatus: 'signedIn',
        uid: 'uid-1',
        distance: 'imperial',
        weight: 'metric',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    expect(mockedWriteRemotePreferences).toHaveBeenCalled();
  });

  it('triggers no further Firestore call on a transition to signedOut', async () => {
    mockedFetchRemotePreferences.mockResolvedValue(null);
    mockedWriteRemotePreferences.mockResolvedValue(undefined);

    const { rerender } = await renderPreferencesSync({
      authStatus: 'signedIn',
      uid: 'uid-1',
      distance: 'metric',
      weight: 'metric',
      setDistanceUnit,
      setWeightUnit,
    });

    await act(async () => {
      await rerender({
        authStatus: 'signedOut',
        uid: null,
        distance: 'metric',
        weight: 'metric',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    mockedFetchRemotePreferences.mockClear();
    mockedWriteRemotePreferences.mockClear();
    setDistanceUnit.mockClear();
    setWeightUnit.mockClear();

    await act(async () => {
      await rerender({
        authStatus: 'signedOut',
        uid: null,
        distance: 'imperial',
        weight: 'imperial',
        setDistanceUnit,
        setWeightUnit,
      });
    });

    expect(mockedFetchRemotePreferences).not.toHaveBeenCalled();
    expect(mockedWriteRemotePreferences).not.toHaveBeenCalled();
    expect(setDistanceUnit).not.toHaveBeenCalled();
    expect(setWeightUnit).not.toHaveBeenCalled();
  });
});
