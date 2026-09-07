import { act, cleanup, renderHook } from '@testing-library/react-native';
import { useNetInfo } from '@react-native-community/netinfo';

import { useNetworkStatus } from '@/hooks/use-network-status';

jest.mock('@react-native-community/netinfo');

const mockedUseNetInfo = useNetInfo as jest.MockedFunction<typeof useNetInfo>;

function mockNetInfo(overrides: Partial<ReturnType<typeof useNetInfo>> = {}) {
  mockedUseNetInfo.mockReturnValue({
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: null,
    ...overrides,
  } as ReturnType<typeof useNetInfo>);
}

describe('useNetworkStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedUseNetInfo.mockReset();
  });

  afterEach(async () => {
    // See use-live-heart-rate.test.ts: unmount before switching back to real
    // timers so no fake-timer-scheduled timeout leaks into later tests.
    await cleanup();
    jest.useRealTimers();
  });

  it('is online when isConnected and isInternetReachable are both true', async () => {
    mockNetInfo({ isConnected: true, isInternetReachable: true });

    const { result } = await renderHook(() => useNetworkStatus());

    expect(result.current).toEqual({ isOffline: false });
  });

  it('treats both isConnected and isInternetReachable being null as online', async () => {
    mockNetInfo({ isConnected: null, isInternetReachable: null });

    const { result } = await renderHook(() => useNetworkStatus());

    expect(result.current).toEqual({ isOffline: false });
  });

  it('does not go offline until the 2500ms debounce elapses when isConnected is false', async () => {
    mockNetInfo({ isConnected: false, isInternetReachable: null });

    const { result } = await renderHook(() => useNetworkStatus());
    expect(result.current).toEqual({ isOffline: false });

    await act(async () => {
      jest.advanceTimersByTime(2499);
    });
    expect(result.current).toEqual({ isOffline: false });

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toEqual({ isOffline: true });
  });

  it('treats isConnected: true with isInternetReachable: false (captive portal / dead wifi) as offline', async () => {
    mockNetInfo({ isConnected: true, isInternetReachable: false });

    const { result } = await renderHook(() => useNetworkStatus());

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    expect(result.current).toEqual({ isOffline: true });
  });

  it('recovers immediately, with no debounce, once online again', async () => {
    mockNetInfo({ isConnected: false, isInternetReachable: null });
    const { result, rerender } = await renderHook(() => useNetworkStatus());

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    expect(result.current).toEqual({ isOffline: true });

    mockNetInfo({ isConnected: true, isInternetReachable: true });
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current).toEqual({ isOffline: false });
  });

  it('never sets isOffline for a brief flap (offline then online before the debounce fires)', async () => {
    mockNetInfo({ isConnected: false, isInternetReachable: null });
    const { result, rerender } = await renderHook(() => useNetworkStatus());

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toEqual({ isOffline: false });

    mockNetInfo({ isConnected: true, isInternetReachable: true });
    await act(async () => {
      await rerender(undefined);
    });

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    expect(result.current).toEqual({ isOffline: false });
  });

  it('clears a pending debounce timer on unmount', async () => {
    mockNetInfo({ isConnected: false, isInternetReachable: null });
    const { unmount } = await renderHook(() => useNetworkStatus());

    await unmount();

    expect(() => {
      act(() => {
        jest.advanceTimersByTime(2500);
      });
    }).not.toThrow();
  });
});
