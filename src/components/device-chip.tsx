import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LiveDot } from '@/components/ui/live-dot';
import { ThemedText } from '@/components/ui/themed-text';
import type { ColorToken, Theme } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DeviceChipStatus = 'connected' | 'reconnecting' | 'disconnected';

export type DeviceChipProps = {
  deviceName: string;
  status: DeviceChipStatus;
  // Only ever reachable via the chip's own Pressable, which only exists at
  // all when `__DEV__` — see the render branch below.
  onSimulateDropout: () => void;
};

type ChipVisual = {
  label: string;
  labelColor: ColorToken;
  borderColor: string | null; // null = no border, i.e. `connected`'s normal styling
  dotColor: ColorToken;
  pulse: boolean; // false only for the disconnected/danger bucket — nothing "live" to animate
};

// `connectionLost`, `reconnectFailed`, and the defensive `disconnected`/
// `connectionFailed` cases all collapse into one `disconnected` bucket —
// same convention scan-status-bar.tsx uses to fold `denied`/`blocked`/
// `partial-*` into identical `danger` styling.
function chipVisual(
  status: DeviceChipStatus,
  deviceName: string,
  theme: Theme,
  labels: { reconnecting: string; disconnected: string },
): ChipVisual {
  switch (status) {
    case 'connected':
      return {
        label: deviceName,
        labelColor: 'onSurfaceChip',
        borderColor: null,
        dotColor: 'success',
        pulse: true,
      };
    case 'reconnecting':
      return {
        label: labels.reconnecting,
        labelColor: 'primary',
        borderColor: theme.colors.primary,
        dotColor: 'primary',
        pulse: true,
      };
    case 'disconnected':
      return {
        label: labels.disconnected,
        labelColor: 'danger',
        borderColor: theme.colors.danger,
        dotColor: 'danger',
        pulse: false,
      };
  }
}

export function DeviceChip({ deviceName, status, onSimulateDropout }: DeviceChipProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const visual = chipVisual(status, deviceName, theme, {
    reconnecting: t('liveWorkout.deviceChip.reconnecting'),
    disconnected: t('liveWorkout.deviceChip.disconnected'),
  });

  const chipStyle = [
    styles.chip,
    {
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: theme.rounded.full,
      borderWidth: visual.borderColor ? 1 : 0,
      borderColor: visual.borderColor ?? 'transparent',
    },
  ];

  const content = (
    <>
      {visual.pulse ? (
        <LiveDot color={visual.dotColor} size={7} testID="device-chip-dot" />
      ) : (
        <View
          testID="device-chip-dot"
          style={[
            styles.staticDot,
            { backgroundColor: theme.colors[visual.dotColor], borderRadius: theme.rounded.full },
          ]}
        />
      )}
      <ThemedText variant="dataSm" color={visual.labelColor}>
        {visual.label}
      </ThemedText>
    </>
  );

  // `__DEV__` gates the render shape itself, not just the handler: outside
  // `__DEV__` this is a plain `View` — no `Pressable`, no
  // `accessibilityRole`, no pressed-opacity feedback. A user tapping their
  // device chip mid-workout must not be able to disconnect their monitor.
  if (__DEV__) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onSimulateDropout}
        testID="live-workout-device-chip"
        style={({ pressed }) => [...chipStyle, { opacity: pressed ? 0.82 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID="live-workout-device-chip" style={chipStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  staticDot: {
    width: 7,
    height: 7,
  },
});
