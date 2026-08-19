import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type PulseRingProps = ViewProps & {
  // Only alive while a workout is actually running — see DESIGN.md's
  // Motion section ("BPM ring"). Paused/idle fades out and hides entirely
  // rather than freezing mid-expansion; a ring frozen at a random size (or
  // left sitting there at rest) reads as broken chrome, not "at rest."
  active: boolean;
  size?: number;
};

// The BPM ring: an expanding, fading ring behind the live-workout BPM
// readout, on a 2.2s loop — DESIGN.md's Motion section. Deliberately not
// tied to the sampled heart rate itself: a ring beating in time with a
// 170bpm reading would read as flicker, not calm ambient motion. Follows
// live-dot.tsx's Animated (not reanimated) pattern, the one actually used
// in this codebase for ambient loops.
//
// Two separate Animated.Values, not one: `progress` is the 0->1 loop phase
// (drives scale and the pulse's own opacity ramp), `gate` is just "shown at
// all" (0 or 1). Collapsing these into a single value doesn't work — the
// loop phase and "visible" are different axes, and animating the loop phase
// itself to 0 on deactivate would drive the *opposite* end of the opacity
// ramp (progress: 0 is peak opacity, not zero), making the ring flash more
// visible right as it's supposed to disappear.
const PULSE_DURATION_MS = 2200;
const FADE_DURATION_MS = 200;
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.35;
const MAX_OPACITY = 0.9;

export function PulseRing({ active, size = 180, style, ...rest }: PulseRingProps) {
  const theme = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const gate = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  // Bumped on every effect run so a completion callback from a
  // superseded fade-out (active flipped back to true before the fade
  // finished) can tell it's stale and skip stopping the new loop.
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;

    if (active) {
      // Every session's ring starts from its smallest state, not wherever
      // the previous one happened to stop.
      progress.setValue(0);
      const loop = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: PULSE_DURATION_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loopRef.current = loop;
      loop.start();
      Animated.timing(gate, {
        toValue: 1,
        duration: FADE_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(gate, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        // Only stop the loop once the fade-out that requested it has
        // actually finished, and only if nothing re-activated in the
        // meantime — stopping synchronously here would freeze the ring
        // mid-expansion for the length of the fade instead of fading out
        // whatever frame it's currently on.
        if (generationRef.current === generation) {
          loopRef.current?.stop();
          loopRef.current = null;
        }
      });
    }

    // No cleanup here: this effect's cleanup would also fire on every
    // `active` toggle (React runs it right before the next effect, not
    // only on unmount), which would stop the loop synchronously on
    // deactivate — exactly the freeze-mid-expansion bug the fade-then-stop
    // callback above exists to avoid. The unmount-only safety net below
    // covers cleanup instead.
  }, [active, progress, gate]);

  // Unmount-only: stops any loop still running if the component goes away
  // mid-fade. Deliberately a separate effect with no deps so it never
  // re-runs (and never cleans up) on an `active` toggle — see the note above.
  useEffect(() => {
    return () => loopRef.current?.stop();
  }, []);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [MIN_SCALE, MAX_SCALE] });
  const pulseOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [MAX_OPACITY, 0],
  });
  const opacity = Animated.multiply(pulseOpacity, gate);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: theme.rounded.full,
          // Nearest theme token to "brand yellow at ~22% alpha" — no rgba
          // token exists, and the constraint is theme tokens only. This is
          // the same "muted yellow" wash used for pressed-card borders
          // elsewhere (see session-row.tsx).
          borderColor: theme.colors.primaryWash,
          transform: [{ scale }],
          opacity,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  // Centered on the parent's own center point regardless of the parent's
  // flex alignment — the parent only needs `position: 'relative'`. Fixed
  // negative margins (rather than relying on Yoga's absolute-child
  // alignment along the main axis) keep this centering unambiguous.
  ring: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    borderWidth: 1,
  },
});
