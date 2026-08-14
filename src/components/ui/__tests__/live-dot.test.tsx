import { render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { colors, rounded } from '@/constants/theme';
import { LiveDot } from '@/components/ui/live-dot';

describe('<LiveDot />', () => {
  it('defaults to a 7px success circle', async () => {
    await render(<LiveDot testID="dot" />);

    const node = screen.getByTestId('dot');
    expect(node.props.style).toEqual(
      expect.objectContaining({
        width: 7,
        height: 7,
        borderRadius: rounded.full,
        backgroundColor: colors.success,
      }),
    );
  });

  it('applies a requested color token', async () => {
    await render(<LiveDot testID="dot" color="primary" />);

    const node = screen.getByTestId('dot');
    expect(node.props.style).toEqual(expect.objectContaining({ backgroundColor: colors.primary }));
  });

  it('applies a requested size', async () => {
    await render(<LiveDot testID="dot" size={12} />);

    const node = screen.getByTestId('dot');
    expect(node.props.style).toEqual(expect.objectContaining({ width: 12, height: 12 }));
  });

  // DESIGN.md > Components > "Live dot": opacity 1 -> 0.35 -> 1, 1400ms,
  // ease-in-out, native driver, looping. Asserted against the `Animated`
  // config passed rather than the interpolated value over fake timers —
  // `useNativeDriver: true` animations aren't actually driven by the JS
  // fake-timer clock under the test renderer (no native bridge in Jest).
  it('starts a looping 1400ms ease-in-out opacity animation on the native driver', async () => {
    const timingSpy = jest.spyOn(Animated, 'timing');
    const loopSpy = jest.spyOn(Animated, 'loop');

    await render(<LiveDot testID="dot" />);

    expect(timingSpy).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 0.35, duration: 700, useNativeDriver: true }),
    );
    expect(timingSpy).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 1, duration: 700, useNativeDriver: true }),
    );
    expect(loopSpy).toHaveBeenCalled();

    timingSpy.mockRestore();
    loopSpy.mockRestore();
  });
});
