import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Defs, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

// An ambient radial wash of the brand yellow, fading to transparent, mounted
// absolutely behind the top of a screen. Non-interactive — decoration only.
//
// No zIndex is set here, deliberately: on this app's Android/Fabric build, a
// *negative* zIndex on an absolutely-positioned view causes it not to render
// at all, while an *unset* zIndex here paints it above normal-flow siblings
// regardless of JSX order (absolute positioning wins the stacking tie, not
// source order). So the fix lives on the content side, not here — callers
// give whatever must render above this an explicit `zIndex: 1`.
//
// The `<Svg>` also needs an explicit numeric width to render on native — a
// plain percentage width doesn't reliably resolve for an `Svg` nested inside
// an absolutely-positioned `View` (same constraint `scan-status-bar.tsx`'s
// `ScanSweep` already works around), so this measures its own width via
// `onLayout` and renders the `Svg` only once that's known.
export type GlowProps = {
  height?: number;
  top?: number;
  opacity?: number;
};

export function Glow({ height = 300, top = -40, opacity = 1 }: GlowProps) {
  const theme = useTheme();
  const gradientId = useId();
  const [width, setWidth] = useState(0);

  return (
    <View
      pointerEvents="none"
      style={[styles.wrapper, { height, top }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id={gradientId} cx="50%" cy="0%" rx="75%" ry="100%">
              <Stop offset="0" stopColor={theme.colors.primary} stopOpacity={0.1 * opacity} />
              <Stop offset="0.55" stopColor={theme.colors.primary} stopOpacity={0.05 * opacity} />
              <Stop offset="1" stopColor={theme.colors.primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
