import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';

import type { BlePermissionResult } from '@/ble/permissions';
import { checkBlePermissions, requestBlePermissions } from '@/ble/permissions';
import { useBlePermissionStatus } from '@/hooks/use-ble-permission-status';

jest.mock('@/ble/permissions');

const mockedCheck = checkBlePermissions as jest.MockedFunction<typeof checkBlePermissions>;
const mockedRequest = requestBlePermissions as jest.MockedFunction<typeof requestBlePermissions>;

// Full control over the foreground signal, rather than relying on RN's real
// (native-backed) AppState module inside the test environment.
function mockAppState() {
  let listener: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    listener = callback as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  return { triggerAppState: (state: string) => listener(state) };
}

describe('useBlePermissionStatus', () => {
  beforeEach(() => {
    // `jest.mock('@/ble/permissions')` automocks once for the whole file —
    // without this, call counts and resolved values leak across tests.
    mockedCheck.mockReset();
    mockedRequest.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checks (never requests) permissions on mount', async () => {
    mockedCheck.mockResolvedValue('denied');

    const { result } = await renderHook(() => useBlePermissionStatus());

    await waitFor(() => expect(mockedCheck).toHaveBeenCalledTimes(1));
    expect(mockedRequest).not.toHaveBeenCalled();
    expect(result.current.status).toBe('undetermined');
  });

  it('resolves granted on mount when already granted', async () => {
    mockedCheck.mockResolvedValue('granted');

    const { result } = await renderHook(() => useBlePermissionStatus());

    await waitFor(() => expect(result.current.status).toBe('granted'));
  });

  it('shows undetermined, not denied, for a not-granted read before any ask this session', async () => {
    mockedCheck.mockResolvedValue('denied');

    const { result } = await renderHook(() => useBlePermissionStatus());

    await waitFor(() => expect(result.current.status).toBe('undetermined'));
  });

  it('re-checks, without requesting, on every foreground transition', async () => {
    const { triggerAppState } = mockAppState();
    mockedCheck.mockResolvedValue('denied');

    const { result } = await renderHook(() => useBlePermissionStatus());
    await waitFor(() => expect(mockedCheck).toHaveBeenCalledTimes(1));

    mockedCheck.mockResolvedValue('partial-scan-only');
    await act(async () => {
      triggerAppState('active');
    });

    await waitFor(() => expect(result.current.status).toBe('partial-scan-only'));
    expect(mockedCheck).toHaveBeenCalledTimes(2);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('does not re-check on a transition to background', async () => {
    const { triggerAppState } = mockAppState();
    mockedCheck.mockResolvedValue('denied');

    await renderHook(() => useBlePermissionStatus());
    await waitFor(() => expect(mockedCheck).toHaveBeenCalledTimes(1));

    await act(async () => {
      triggerAppState('background');
    });

    expect(mockedCheck).toHaveBeenCalledTimes(1);
  });

  it('requestAccess moves to requesting, then to the resolved result, and marks this session as asked', async () => {
    mockedCheck.mockResolvedValue('denied');
    let resolveRequest!: (value: BlePermissionResult) => void;
    mockedRequest.mockImplementation(
      () =>
        new Promise<BlePermissionResult>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const { result } = await renderHook(() => useBlePermissionStatus());
    await waitFor(() => expect(result.current.status).toBe('undetermined'));

    await act(() => {
      result.current.requestAccess();
    });
    expect(result.current.status).toBe('requesting');

    await act(async () => {
      resolveRequest('granted');
    });

    await waitFor(() => expect(result.current.status).toBe('granted'));
  });

  it('shows denied, not undetermined, for a not-granted read once this session has asked', async () => {
    mockedCheck.mockResolvedValue('denied');
    mockedRequest.mockResolvedValue('denied');

    const { result } = await renderHook(() => useBlePermissionStatus());
    await waitFor(() => expect(result.current.status).toBe('undetermined'));

    await act(async () => {
      result.current.requestAccess();
    });

    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  it('keeps status blocked through a later partial/denied read, and clears it only on a granted read', async () => {
    const { triggerAppState } = mockAppState();
    mockedCheck.mockResolvedValue('denied');
    mockedRequest.mockResolvedValue('blocked');

    const { result } = await renderHook(() => useBlePermissionStatus());
    await waitFor(() => expect(result.current.status).toBe('undetermined'));

    await act(async () => {
      result.current.requestAccess();
    });
    await waitFor(() => expect(result.current.status).toBe('blocked'));

    mockedCheck.mockResolvedValue('partial-scan-only');
    await act(async () => {
      triggerAppState('active');
    });
    expect(result.current.status).toBe('blocked');

    mockedCheck.mockResolvedValue('denied');
    await act(async () => {
      triggerAppState('active');
    });
    expect(result.current.status).toBe('blocked');

    mockedCheck.mockResolvedValue('granted');
    await act(async () => {
      triggerAppState('active');
    });
    await waitFor(() => expect(result.current.status).toBe('granted'));
  });

  it('openSettings calls Linking.openSettings()', async () => {
    mockedCheck.mockResolvedValue('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    const { result } = await renderHook(() => useBlePermissionStatus());

    await act(() => {
      result.current.openSettings();
    });

    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
