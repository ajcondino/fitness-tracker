import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import type { ColorToken } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// DESIGN.md > Components > Device card is the closest tappable-row
// precedent, but this is a repeated list row, not a hero card — so it uses
// the "resting" elevation tokens (`surface`/`outline`, `rounded.md`) rather
// than device-card.tsx's `surfaceRaised`/`outlineStrong`/`rounded.lg`.
export type DeviceRowProps = {
  name: string;
  isNameFallback: boolean; // dims the title when true — see copy table
  rssi: number;
  status: 'available' | 'connecting' | 'connected' | 'failed';
  disabled: boolean; // true when a different device is mid-connect
  onPress: () => void; // caller decides the verb: connect / cancel / retry
};

const TRAILING_COLOR_BY_STATUS: Record<DeviceRowProps['status'], ColorToken> = {
  available: 'onSurfaceGhost',
  connecting: 'onSurfaceFaint',
  connected: 'success',
  failed: 'primary',
};

const TRAILING_COPY_KEY_BY_STATUS = {
  connecting: 'pairing.deviceRow.connecting',
  connected: 'pairing.deviceRow.connected',
  failed: 'pairing.deviceRow.retry',
} as const satisfies Record<Exclude<DeviceRowProps['status'], 'available'>, string>;

export function DeviceRow({
  name,
  isNameFallback,
  rssi,
  status,
  disabled,
  onPress,
}: DeviceRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID="device-row"
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: pressed ? theme.colors.primaryWash : theme.colors.outline,
          borderRadius: theme.rounded.md,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.text}>
        <ThemedText variant="titleSm" color={isNameFallback ? 'onSurfaceMuted' : 'onSurface'}>
          {name}
        </ThemedText>
        <ThemedText variant="dataMd" color="onSurfaceMuted">
          {t('pairing.deviceRow.rssi', { rssi })}
        </ThemedText>
      </View>
      {status === 'available' ? (
        <ThemedText variant="titleMd" color={TRAILING_COLOR_BY_STATUS.available}>
          ›
        </ThemedText>
      ) : (
        <ThemedText variant="actionSm" color={TRAILING_COLOR_BY_STATUS[status]}>
          {t(TRAILING_COPY_KEY_BY_STATUS[status])}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
