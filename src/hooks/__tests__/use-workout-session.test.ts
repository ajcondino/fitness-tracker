import { act, renderHook } from '@testing-library/react-native';

import { ELAPSED_TICK_INTERVAL_MS, useWorkoutSession } from '@/hooks/use-workout-session';

describe('useWorkoutSession', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns an inert snapshot for null bpm/lastReadingAt, captured at mount', async () => {
    const mountedAt = Date.now();
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    expect(result.current).toEqual({
      startedAt: mountedAt,
      samples: [],
      elapsedMs: 0,
      averageBpm: null,
      maxBpm: null,
    });
  });

  it('appends exactly one sample per distinct (bpm, lastReadingAt) pair, in arrival order', async () => {
    let bpm: number | null = 120;
    let lastReadingAt: number | null = 1_000;
    const { result, rerender } = await renderHook(() => useWorkoutSession(bpm, lastReadingAt));

    bpm = 125;
    lastReadingAt = 2_000;
    await act(async () => {
      await rerender(undefined);
    });

    bpm = 130;
    lastReadingAt = 3_000;
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.samples).toEqual([
      { bpm: 120, timestamp: 1_000 },
      { bpm: 125, timestamp: 2_000 },
      { bpm: 130, timestamp: 3_000 },
    ]);
  });

  it('does not append when bpm or lastReadingAt is null', async () => {
    const { result, rerender } = await renderHook(
      ({ bpm, lastReadingAt }: { bpm: number | null; lastReadingAt: number | null }) =>
        useWorkoutSession(bpm, lastReadingAt),
      { initialProps: { bpm: null, lastReadingAt: null } },
    );

    await act(async () => {
      await rerender({ bpm: 120, lastReadingAt: null });
    });
    await act(async () => {
      await rerender({ bpm: null, lastReadingAt: 1_000 });
    });

    expect(result.current.samples).toEqual([]);
  });

  it('does not append a second sample when re-rendered with the same (bpm, lastReadingAt) pair', async () => {
    const { result, rerender } = await renderHook(() => useWorkoutSession(120, 1_000));

    await act(async () => {
      await rerender(undefined);
    });
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.samples).toEqual([{ bpm: 120, timestamp: 1_000 }]);
  });

  it('computes averageBpm and maxBpm from all appended samples, recomputing as more are appended', async () => {
    let bpm: number | null = 100;
    let lastReadingAt: number | null = 1_000;
    const { result, rerender } = await renderHook(() => useWorkoutSession(bpm, lastReadingAt));

    expect(result.current.averageBpm).toBe(100);
    expect(result.current.maxBpm).toBe(100);

    bpm = 150;
    lastReadingAt = 2_000;
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.averageBpm).toBe(125);
    expect(result.current.maxBpm).toBe(150);

    bpm = 110;
    lastReadingAt = 3_000;
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.averageBpm).toBeCloseTo(120);
    expect(result.current.maxBpm).toBe(150);
  });

  it('advances elapsedMs as time passes even with no new sample', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    expect(result.current.elapsedMs).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(ELAPSED_TICK_INTERVAL_MS * 3);
    });

    expect(result.current.elapsedMs).toBe(ELAPSED_TICK_INTERVAL_MS * 3);
  });
});
