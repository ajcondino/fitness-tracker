import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';

import {
  checkHealthConnectPermission,
  getHealthConnectAvailability,
  hasScreenLock,
  openHealthConnectApp,
  requestHealthConnectPermission,
} from '@/health/health-connect-client';
import {
  clearDeclineCount,
  loadDeclineCount,
  loadWriteBackEnabled,
  recordDeclinedAttempt,
  saveWriteBackEnabled,
} from '@/health/health-connect-store';
import { useHealthConnectSettings } from '@/hooks/use-health-connect-settings';

jest.mock('@/health/health-connect-client');
jest.mock('@/health/health-connect-store');

const mockedGetAvailability = getHealthConnectAvailability as jest.MockedFunction<
  typeof getHealthConnectAvailability
>;
const mockedHasScreenLock = hasScreenLock as jest.MockedFunction<typeof hasScreenLock>;
const mockedCheckPermission = checkHealthConnectPermission as jest.MockedFunction<
  typeof checkHealthConnectPermission
>;
const mockedRequestPermission = requestHealthConnectPermission as jest.MockedFunction<
  typeof requestHealthConnectPermission
>;
const mockedOpenHealthConnectApp = openHealthConnectApp as jest.MockedFunction<
  typeof openHealthConnectApp
>;
const mockedLoadWriteBackEnabled = loadWriteBackEnabled as jest.MockedFunction<
  typeof loadWriteBackEnabled
>;
const mockedSaveWriteBackEnabled = saveWriteBackEnabled as jest.MockedFunction<
  typeof saveWriteBackEnabled
>;
const mockedLoadDeclineCount = loadDeclineCount as jest.MockedFunction<typeof loadDeclineCount>;
const mockedRecordDeclinedAttempt = recordDeclinedAttempt as jest.MockedFunction<
  typeof recordDeclinedAttempt
>;
const mockedClearDeclineCount = clearDeclineCount as jest.MockedFunction<typeof clearDeclineCount>;

// Full control over the foreground signal, rather than relying on RN's real
// (native-backed) AppState module inside the test environment — mirrors
// use-ble-permission-status.test.ts's own helper.
function mockAppState() {
  let listener: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    listener = callback as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  return { triggerAppState: (state: string) => listener(state) };
}

// Configures the mocks so `deriveStatus()` resolves to the granted branch —
// most tests only care about a state below this point in the chain.
function mockGrantedChain(writeBackEnabled: boolean) {
  mockedGetAvailability.mockResolvedValue('available');
  mockedHasScreenLock.mockResolvedValue(true);
  mockedCheckPermission.mockResolvedValue(true);
  mockedLoadWriteBackEnabled.mockResolvedValue(writeBackEnabled);
}

describe('useHealthConnectSettings', () => {
  beforeEach(() => {
    mockedGetAvailability.mockReset();
    mockedHasScreenLock.mockReset();
    mockedCheckPermission.mockReset();
    mockedRequestPermission.mockReset();
    mockedOpenHealthConnectApp.mockReset();
    mockedLoadWriteBackEnabled.mockReset();
    mockedSaveWriteBackEnabled.mockReset().mockResolvedValue(undefined);
    mockedLoadDeclineCount.mockReset();
    mockedRecordDeclinedAttempt.mockReset();
    mockedClearDeclineCount.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves to unavailable, with no screen-lock/permission call, when the SDK is unavailable', async () => {
    mockedGetAvailability.mockResolvedValue('unavailable');

    const { result } = await renderHook(() => useHealthConnectSettings());

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(mockedHasScreenLock).not.toHaveBeenCalled();
    expect(mockedCheckPermission).not.toHaveBeenCalled();
  });

  it('resolves to noScreenLock when available but no screen lock is set', async () => {
    mockedGetAvailability.mockResolvedValue('available');
    mockedHasScreenLock.mockResolvedValue(false);

    const { result } = await renderHook(() => useHealthConnectSettings());

    await waitFor(() => expect(result.current.status).toBe('noScreenLock'));
    expect(mockedCheckPermission).not.toHaveBeenCalled();
  });

  it('resolves to grantedEnabled when granted and writeBackEnabled is true, and clears the decline count', async () => {
    mockGrantedChain(true);

    const { result } = await renderHook(() => useHealthConnectSettings());

    await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));
    expect(mockedClearDeclineCount).toHaveBeenCalled();
  });

  it('resolves to grantedDisabled when granted and writeBackEnabled is false', async () => {
    mockGrantedChain(false);

    const { result } = await renderHook(() => useHealthConnectSettings());

    await waitFor(() => expect(result.current.status).toBe('grantedDisabled'));
  });

  it('resolves to notGranted when not granted and the decline count is below the threshold', async () => {
    mockedGetAvailability.mockResolvedValue('available');
    mockedHasScreenLock.mockResolvedValue(true);
    mockedCheckPermission.mockResolvedValue(false);
    mockedLoadDeclineCount.mockResolvedValue(1);

    const { result } = await renderHook(() => useHealthConnectSettings());

    await waitFor(() => expect(result.current.status).toBe('notGranted'));
  });

  it('resolves to permissionExhausted when not granted and the decline count has reached 2', async () => {
    mockedGetAvailability.mockResolvedValue('available');
    mockedHasScreenLock.mockResolvedValue(true);
    mockedCheckPermission.mockResolvedValue(false);
    mockedLoadDeclineCount.mockResolvedValue(2);

    const { result } = await renderHook(() => useHealthConnectSettings());

    await waitFor(() => expect(result.current.status).toBe('permissionExhausted'));
  });

  it('never calls requestHealthConnectPermission from mount', async () => {
    mockedGetAvailability.mockResolvedValue('available');
    mockedHasScreenLock.mockResolvedValue(true);
    mockedCheckPermission.mockResolvedValue(false);
    mockedLoadDeclineCount.mockResolvedValue(0);

    await renderHook(() => useHealthConnectSettings());
    await waitFor(() => expect(mockedCheckPermission).toHaveBeenCalled());

    expect(mockedRequestPermission).not.toHaveBeenCalled();
  });

  it('re-runs the full precedence chain on every foreground transition', async () => {
    const { triggerAppState } = mockAppState();
    mockedGetAvailability.mockResolvedValue('available');
    mockedHasScreenLock.mockResolvedValue(true);
    mockedCheckPermission.mockResolvedValue(false);
    mockedLoadDeclineCount.mockResolvedValue(0);

    const { result } = await renderHook(() => useHealthConnectSettings());
    await waitFor(() => expect(result.current.status).toBe('notGranted'));

    // Simulates a revoke via system settings surfacing on foreground
    // re-entry, without a restart.
    mockedGetAvailability.mockResolvedValue('unavailable');
    await act(async () => {
      triggerAppState('active');
    });

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('does not re-run the chain on a transition to background', async () => {
    const { triggerAppState } = mockAppState();
    mockedGetAvailability.mockResolvedValue('available');
    mockedHasScreenLock.mockResolvedValue(true);
    mockedCheckPermission.mockResolvedValue(false);
    mockedLoadDeclineCount.mockResolvedValue(0);

    await renderHook(() => useHealthConnectSettings());
    await waitFor(() => expect(mockedGetAvailability).toHaveBeenCalledTimes(1));

    await act(async () => {
      triggerAppState('background');
    });

    expect(mockedGetAvailability).toHaveBeenCalledTimes(1);
  });

  describe('grantAccess', () => {
    it('is never invoked automatically — only requestHealthConnectPermission calls trace back to an explicit grantAccess() call', async () => {
      mockedGetAvailability.mockResolvedValue('available');
      mockedHasScreenLock.mockResolvedValue(true);
      mockedCheckPermission.mockResolvedValue(false);
      mockedLoadDeclineCount.mockResolvedValue(0);

      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('notGranted'));

      expect(mockedRequestPermission).not.toHaveBeenCalled();

      mockedRequestPermission.mockResolvedValue(true);
      await act(async () => {
        result.current.grantAccess();
      });

      expect(mockedRequestPermission).toHaveBeenCalledTimes(1);
    });

    it('on true: saves writeBackEnabled(true), clears the decline count, and sets grantedEnabled', async () => {
      mockedGetAvailability.mockResolvedValue('available');
      mockedHasScreenLock.mockResolvedValue(true);
      mockedCheckPermission.mockResolvedValue(false);
      mockedLoadDeclineCount.mockResolvedValue(0);
      mockedRequestPermission.mockResolvedValue(true);

      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('notGranted'));
      mockedClearDeclineCount.mockClear();

      await act(async () => {
        result.current.grantAccess();
      });

      await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));
      expect(mockedSaveWriteBackEnabled).toHaveBeenCalledWith(true);
      expect(mockedClearDeclineCount).toHaveBeenCalled();
    });

    it('on false: records a declined attempt and stays notGranted below the threshold', async () => {
      mockedGetAvailability.mockResolvedValue('available');
      mockedHasScreenLock.mockResolvedValue(true);
      mockedCheckPermission.mockResolvedValue(false);
      mockedLoadDeclineCount.mockResolvedValue(0);
      mockedRequestPermission.mockResolvedValue(false);
      mockedRecordDeclinedAttempt.mockResolvedValue(1);

      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('notGranted'));

      await act(async () => {
        result.current.grantAccess();
      });

      await waitFor(() => expect(mockedRecordDeclinedAttempt).toHaveBeenCalled());
      expect(result.current.status).toBe('notGranted');
    });

    it('a second declined call that reaches the threshold sets permissionExhausted', async () => {
      mockedGetAvailability.mockResolvedValue('available');
      mockedHasScreenLock.mockResolvedValue(true);
      mockedCheckPermission.mockResolvedValue(false);
      mockedLoadDeclineCount.mockResolvedValue(1);
      mockedRequestPermission.mockResolvedValue(false);
      mockedRecordDeclinedAttempt.mockResolvedValue(2);

      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('notGranted'));

      await act(async () => {
        result.current.grantAccess();
      });

      await waitFor(() => expect(result.current.status).toBe('permissionExhausted'));
    });
  });

  describe('setWriteBackEnabled', () => {
    it('persists the value and flips status from grantedEnabled to grantedDisabled', async () => {
      mockGrantedChain(true);

      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));

      await act(async () => {
        result.current.setWriteBackEnabled(false);
      });

      await waitFor(() => expect(result.current.status).toBe('grantedDisabled'));
      expect(mockedSaveWriteBackEnabled).toHaveBeenCalledWith(false);
    });

    it('persists the value and flips status from grantedDisabled to grantedEnabled', async () => {
      mockGrantedChain(false);

      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('grantedDisabled'));

      await act(async () => {
        result.current.setWriteBackEnabled(true);
      });

      await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));
      expect(mockedSaveWriteBackEnabled).toHaveBeenCalledWith(true);
    });
  });

  describe('action wrappers', () => {
    it('openHealthConnectApp calls the client function', async () => {
      mockGrantedChain(true);
      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));

      await act(async () => {
        result.current.openHealthConnectApp();
      });

      expect(mockedOpenHealthConnectApp).toHaveBeenCalledTimes(1);
    });

    it('openSecuritySettings sends the AOSP security-settings intent', async () => {
      mockGrantedChain(true);
      const sendIntent = jest.spyOn(Linking, 'sendIntent').mockResolvedValue();
      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));

      await act(async () => {
        result.current.openSecuritySettings();
      });

      expect(sendIntent).toHaveBeenCalledWith('android.settings.SECURITY_SETTINGS');
    });

    it('openPlayStore opens the market:// URL when supported', async () => {
      mockGrantedChain(true);
      jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));

      await act(async () => {
        result.current.openPlayStore();
      });

      expect(openURL).toHaveBeenCalledWith(
        'market://details?id=com.google.android.apps.healthdata',
      );
    });

    it('openPlayStore falls back to the https URL when market:// is unsupported', async () => {
      mockGrantedChain(true);
      jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const { result } = await renderHook(() => useHealthConnectSettings());
      await waitFor(() => expect(result.current.status).toBe('grantedEnabled'));

      await act(async () => {
        result.current.openPlayStore();
      });

      expect(openURL).toHaveBeenCalledWith(
        'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata',
      );
    });
  });
});
