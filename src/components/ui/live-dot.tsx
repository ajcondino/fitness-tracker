import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewProps } from 'react-native';

import type { ColorToken } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type LiveDotProps = ViewProps & {
  color?: ColorToken;
  size?: number;
};

// DESIGN.md > Components > "Live dot": a 7px circle looping opacity
// 1 -> 0.35 -> 1 over 1400ms, ease-in-out, native driver. `success` is the
// documented default (a live connection); callers signaling a different
// kind of "live" (e.g. an in-progress scan) pass a different color token.
const PULSE_DURATION_MS = 1400;
const DIMMED_OPACITY = 0.35;

export function LiveDot({ color = 'success', size = 7, style, ...rest }: LiveDotProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: DIMMED_OPACITY,
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: theme.rounded.full,
          backgroundColor: theme.colors[color],
          opacity,
        },
        style,
      ]}
      {...rest}
    />
  );
}
