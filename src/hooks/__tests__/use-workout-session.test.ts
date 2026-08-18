import { act, renderHook } from '@testing-library/react-native';

import { ELAPSED_TICK_INTERVAL_MS, useWorkoutSession } from '@/hooks/use-workout-session';

describe('useWorkoutSession', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns an inert idle snapshot before start() is called', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    expect(result.current.phase).toBe('idle');
    expect(result.current.startedAt).toBeNull();
    expect(result.current.samples).toEqual([]);
    expect(result.current.pauses).toEqual([]);
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.averageBpm).toBeNull();
    expect(result.current.maxBpm).toBeNull();
  });

  it('start() moves phase to running, sets startedAt, and elapsedMs begins advancing', async () => {
    const startedAt = Date.now();
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.start();
    });

    expect(result.current.phase).toBe('running');
    expect(result.current.startedAt).toBe(startedAt);
    expect(result.current.elapsedMs).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(ELAPSED_TICK_INTERVAL_MS * 3);
    });

    expect(result.current.elapsedMs).toBe(ELAPSED_TICK_INTERVAL_MS * 3);
  });

  it('start() is a no-op when not idle', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.start();
    });
    const startedAt = result.current.startedAt;

    await act(async () => {
      result.current.start();
    });

    expect(result.current.phase).toBe('running');
    expect(result.current.startedAt).toBe(startedAt);
  });

  it('appends a sample for a fresh (bpm, lastReadingAt) pair while running', async () => {
    let bpm: number | null = 120;
    let lastReadingAt: number | null = 1_000;
    const { result, rerender } = await renderHook(() => useWorkoutSession(bpm, lastReadingAt));

    await act(async () => {
      result.current.start();
    });

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

  it('does not append a sample while idle', async () => {
    const { result, rerender } = await renderHook(() => useWorkoutSession(120, 1_000));

    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.samples).toEqual([]);
  });

  it('does not append when bpm or lastReadingAt is null while running', async () => {
    const { result, rerender } = await renderHook(
      ({ bpm, lastReadingAt }: { bpm: number | null; lastReadingAt: number | null }) =>
        useWorkoutSession(bpm, lastReadingAt),
      { initialProps: { bpm: null, lastReadingAt: null } },
    );

    await act(async () => {
      result.current.start();
    });

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
      result.current.start();
    });

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

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      await rerender(undefined);
    });

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

  it('pause() while running freezes elapsedMs and moves phase to paused', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(ELAPSED_TICK_INTERVAL_MS * 3);
    });
    expect(result.current.elapsedMs).toBe(3_000);

    await act(async () => {
      result.current.pause();
    });

    expect(result.current.phase).toBe('paused');
    expect(result.current.elapsedMs).toBe(3_000);

    await act(async () => {
      jest.advanceTimersByTime(ELAPSED_TICK_INTERVAL_MS * 5);
    });

    expect(result.current.elapsedMs).toBe(3_000);
  });

  it('pause() is a no-op when not running', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.pause();
    });

    expect(result.current.phase).toBe('idle');
  });

  it('a fresh reading while paused does not append a sample', async () => {
    let bpm: number | null = 120;
    let lastReadingAt: number | null = 1_000;
    const { result, rerender } = await renderHook(() => useWorkoutSession(bpm, lastReadingAt));

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      await rerender(undefined);
    });
    expect(result.current.samples).toEqual([{ bpm: 120, timestamp: 1_000 }]);

    await act(async () => {
      result.current.pause();
    });

    bpm = 125;
    lastReadingAt = 2_000;
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.samples).toEqual([{ bpm: 120, timestamp: 1_000 }]);
  });

  it('resume() while paused continues elapsedMs from where it froze and appends a closed pause', async () => {
    const mountedAt = Date.now();
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });

    await act(async () => {
      result.current.pause();
    });
    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });

    await act(async () => {
      result.current.resume();
    });

    expect(result.current.phase).toBe('running');
    expect(result.current.pauses).toEqual([
      { startedAt: mountedAt + 2_000, endedAt: mountedAt + 6_000 },
    ]);
    expect(result.current.elapsedMs).toBe(2_000);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    expect(result.current.elapsedMs).toBe(5_000);
  });

  it('resume() is a no-op when not paused', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.start();
    });

    await act(async () => {
      result.current.resume();
    });

    expect(result.current.phase).toBe('running');
    expect(result.current.pauses).toEqual([]);
  });

  it('a fresh reading right after resume() is appended normally', async () => {
    let bpm: number | null = null;
    let lastReadingAt: number | null = null;
    const { result, rerender } = await renderHook(() => useWorkoutSession(bpm, lastReadingAt));

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.pause();
    });
    await act(async () => {
      result.current.resume();
    });

    bpm = 140;
    lastReadingAt = 9_999;
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.samples).toEqual([{ bpm: 140, timestamp: 9_999 }]);
  });

  it('stop() from running moves phase to ended and freezes elapsedMs', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.phase).toBe('ended');
    expect(result.current.elapsedMs).toBe(4_000);
    expect(result.current.pauses).toEqual([]);

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(result.current.elapsedMs).toBe(4_000);
  });

  it('stop() from paused moves phase to ended and appends the still-open pause', async () => {
    const mountedAt = Date.now();
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });

    await act(async () => {
      result.current.pause();
    });
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.phase).toBe('ended');
    expect(result.current.pauses).toEqual([
      { startedAt: mountedAt + 2_000, endedAt: mountedAt + 5_000 },
    ]);
    expect(result.current.elapsedMs).toBe(2_000);
  });

  it('stop() is a no-op when idle or already ended', async () => {
    const { result } = await renderHook(() => useWorkoutSession(null, null));

    await act(async () => {
      result.current.stop();
    });
    expect(result.current.phase).toBe('idle');

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });
    expect(result.current.phase).toBe('ended');

    await act(async () => {
      result.current.stop();
    });
    expect(result.current.phase).toBe('ended');
  });

  it('end-to-end: readings before start, during a pause, and after stop are all excluded from average/max', async () => {
    let bpm: number | null = null;
    let lastReadingAt: number | null = null;
    const { result, rerender } = await renderHook(() => useWorkoutSession(bpm, lastReadingAt));

    expect(result.current.samples).toEqual([]);

    await act(async () => {
      result.current.start();
    });

    bpm = 100;
    lastReadingAt = 1_000;
    await act(async () => {
      await rerender(undefined);
    });

    await act(async () => {
      result.current.pause();
    });

    bpm = 999; // arrives while paused — must be ignored
    lastReadingAt = 2_000;
    await act(async () => {
      await rerender(undefined);
    });

    // A fresh reading is already the current (bpm, lastReadingAt) pair by the
    // moment resume() flips phase back to 'running' in the same act — this
    // is the ordinary case per SPEC.md's reconnect-while-paused design
    // decision: "the very next fresh reading is appended normally."
    bpm = 120;
    lastReadingAt = 3_000;
    await act(async () => {
      result.current.resume();
    });

    await act(async () => {
      result.current.stop();
    });

    bpm = 999; // arrives after stop() — must be ignored
    lastReadingAt = 4_000;
    await act(async () => {
      await rerender(undefined);
    });

    expect(result.current.samples).toEqual([
      { bpm: 100, timestamp: 1_000 },
      { bpm: 120, timestamp: 3_000 },
    ]);
    expect(result.current.averageBpm).toBe(110);
    expect(result.current.maxBpm).toBe(120);
  });
});
