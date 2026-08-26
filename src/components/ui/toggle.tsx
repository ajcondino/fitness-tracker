import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
};

// Generic on/off switch primitive — sits under `src/components/ui/` (not
// tied to Health Connect) per CLAUDE.md's primitive/composed split. Built
// entirely from existing DESIGN.md color tokens; no new token added.
//
// No animation: DESIGN.md's Do's and Don'ts restricts motion to the live
// dot, the BPM ring, and the scan-bar sweep — a sliding thumb would be a
// fourth. The thumb's position is a plain conditional style, snapping
// instantly.
//
// Track/thumb are sized smaller than DESIGN.md's 34px touch-target floor (a
// native-scale switch, ~44x26 visual), so the `Pressable` carries `hitSlop`
// out to a 34px+ effective hit area instead of inflating the visual element.
const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const TRACK_PADDING = 3;
const THUMB_SIZE = TRACK_HEIGHT - TRACK_PADDING * 2;
const HIT_SLOP_VERTICAL = (34 - TRACK_HEIGHT) / 2;
const HIT_SLOP_HORIZONTAL = (34 - TRACK_WIDTH) / 2;

export function Toggle({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  testID,
}: ToggleProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      hitSlop={{
        top: Math.max(HIT_SLOP_VERTICAL, 0),
        bottom: Math.max(HIT_SLOP_VERTICAL, 0),
        left: Math.max(HIT_SLOP_HORIZONTAL, 0),
        right: Math.max(HIT_SLOP_HORIZONTAL, 0),
      }}
      testID={testID}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View
        testID={testID ? `${testID}-track` : undefined}
        style={[
          styles.track,
          {
            backgroundColor: value ? theme.colors.success : theme.colors.surfaceTrackIdle,
            borderColor: value ? theme.colors.success : theme.colors.outlineStrong,
            borderRadius: theme.rounded.full,
            alignItems: value ? 'flex-end' : 'flex-start',
          },
        ]}
      >
        <View
          style={[
            styles.thumb,
            { backgroundColor: theme.colors.onSurface, borderRadius: theme.rounded.full },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderWidth: 1,
    padding: TRACK_PADDING,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
});
