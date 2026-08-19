import { render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { colors, rounded } from '@/constants/theme';
import { PulseRing } from '@/components/ui/pulse-ring';

describe('<PulseRing />', () => {
  it('defaults to a 180px circle with a primaryWash border, ignoring touches', async () => {
    await render(<PulseRing testID="ring" active={false} />);

    const node = screen.getByTestId('ring');
    expect(node.props.pointerEvents).toBe('none');
    expect(node.props.style).toEqual(
      expect.objectContaining({
        width: 180,
        height: 180,
        borderRadius: rounded.full,
        borderColor: colors.primaryWash,
      }),
    );
  });

  it('applies a requested size', async () => {
    await render(<PulseRing testID="ring" active={false} size={64} />);

    const node = screen.getByTestId('ring');
    expect(node.props.style).toEqual(
      expect.objectContaining({ width: 64, height: 64, marginLeft: -32, marginTop: -32 }),
    );
  });

  // DESIGN.md's "BPM ring" — 2200ms, ease-out, looping, native driver.
  // Asserted against the `Animated` config passed rather than the
  // interpolated value over fake timers — see live-dot.test.tsx's identical
  // note on why (`useNativeDriver: true` isn't driven by Jest's fake clock).
  it('starts a looping 2200ms ease-out scale/opacity animation and fades the gate in while active', async () => {
    const timingSpy = jest.spyOn(Animated, 'timing');
    const loopSpy = jest.spyOn(Animated, 'loop');

    await render(<PulseRing testID="ring" active />);

    expect(timingSpy).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 1, duration: 2200, useNativeDriver: true }),
    );
    // The gate fading in (0 -> 1, 200ms) — a distinct value from the loop
    // phase above, same toValue but a different duration.
    expect(timingSpy).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 1, duration: 200, useNativeDriver: true }),
    );
    expect(loopSpy).toHaveBeenCalled();

    timingSpy.mockRestore();
    loopSpy.mockRestore();
  });

  // The bug this guards against: collapsing the loop phase and "shown at
  // all" into one Animated.Value means animating that value toward 0 on
  // deactivate actually drives the *opposite* end of the opacity ramp
  // (phase 0 is peak opacity), leaving a fully visible, non-animating ring
  // sitting there instead of hiding it.
  it('hides entirely when inactive, without looping', async () => {
    const timingSpy = jest.spyOn(Animated, 'timing');
    const loopSpy = jest.spyOn(Animated, 'loop');

    await render(<PulseRing testID="ring" active={false} />);

    expect(loopSpy).not.toHaveBeenCalled();
    // Only the gate fades out (1 -> 0 — starts at 0 already, but the same
    // call fires regardless of the starting value); the loop phase itself
    // is never touched while inactive.
    expect(timingSpy).toHaveBeenCalledTimes(1);
    expect(timingSpy).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 0, duration: 200, useNativeDriver: true }),
    );

    timingSpy.mockRestore();
    loopSpy.mockRestore();
  });

  it('stops the loop only after the deactivate fade finishes, not synchronously', async () => {
    const timingSpy = jest.spyOn(Animated, 'timing');
    const loopSpy = jest.spyOn(Animated, 'loop');
    const stopSpy = jest.fn();
    loopSpy.mockImplementation((animation) => ({
      ...animation,
      start: (callback?: Animated.EndCallback) => {
        animation.start(callback);
      },
      stop: stopSpy,
      reset: jest.fn(),
    }));

    const { rerender } = await render(<PulseRing testID="ring" active />);
    await rerender(<PulseRing testID="ring" active={false} />);

    // The fade-out timing was started, but its completion callback (which
    // is what actually stops the loop) hasn't fired synchronously.
    expect(stopSpy).not.toHaveBeenCalled();

    timingSpy.mockRestore();
    loopSpy.mockRestore();
  });
});
