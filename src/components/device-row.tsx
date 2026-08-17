import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import type { ColorToken, Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// DESIGN.md > Components > Device card is the closest tappable-row
// precedent, but this is a repeated list row, not a hero card — so it uses
// the "resting" elevation tokens (`surface`/`outline`, `rounded.md`) rather
// than device-card.tsx's `surfaceRaised`/`outlineStrong`/`rounded.lg` —
// except once connected, when the row itself steps up to `surfaceRaised`
// (see the container style below).
export type DeviceRowProps = {
  name: string;
  isNameFallback: boolean; // dims the title when true — see copy table
  rssi: number;
  status: 'available' | 'connecting' | 'connected' | 'failed';
  disabled: boolean; // true when a different device is mid-connect
  onPress: () => void; // caller decides the verb: connect / cancel / retry
};

// 1 (weakest) – 4 (strongest). Drives both the leading tile's color and how
// many of the four signal bars render filled.
function signalLevel(rssi: number): 1 | 2 | 3 | 4 {
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

const SIGNAL_QUALIFIER_KEY_BY_LEVEL = {
  1: 'pairing.deviceRow.signalWeak',
  2: 'pairing.deviceRow.signalFair',
  3: 'pairing.deviceRow.signalGood',
  4: 'pairing.deviceRow.signalStrong',
} as const satisfies Record<ReturnType<typeof signalLevel>, string>;

// DESIGN.md > Shapes: signal bars are 3px wide, 1px radius, 5/8/11/14px
// heights, 2px gap.
const SIGNAL_BAR_HEIGHTS = [5, 8, 11, 14] as const;

const TRAILING_COPY_KEY_BY_STATUS = {
  available: 'pairing.deviceRow.connect',
  connecting: 'pairing.deviceRow.connecting',
  connected: 'pairing.deviceRow.connected',
  failed: 'pairing.deviceRow.retry',
} as const satisfies Record<DeviceRowProps['status'], string>;

type PillVisual = {
  backgroundColor: string;
  borderColor: string;
  labelColor: ColorToken;
};

// The pill's three-token look reads status + signal, not status alone: an
// available device with a strong (4-bar) signal gets the filled "ready to
// go" treatment, a weaker one gets the quieter outline.
function pillVisual(
  status: DeviceRowProps['status'],
  isStrongSignal: boolean,
  theme: Theme,
): PillVisual {
  switch (status) {
    case 'available':
      return isStrongSignal
        ? {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
            labelColor: 'onPrimary',
          }
        : {
            backgroundColor: 'transparent',
            borderColor: theme.colors.outline,
            labelColor: 'onSurfaceSoft',
          };
    case 'connecting':
      return {
        backgroundColor: theme.colors.primaryDim,
        borderColor: theme.colors.primaryDim,
        labelColor: 'onPrimary',
      };
    case 'connected':
      return {
        backgroundColor: 'transparent',
        borderColor: theme.colors.successOutline,
        labelColor: 'success',
      };
    case 'failed':
      return {
        backgroundColor: 'transparent',
        borderColor: theme.colors.primary,
        labelColor: 'primary',
      };
  }
}

// Pressed always wins (matches device-card.tsx's pressed treatment); at
// rest, connected is the one status that steps the border up to
// `successOutline` instead of the resting `outline`.
function getBorderColor(args: { pressed: boolean; isConnected: boolean; theme: Theme }): string {
  if (args.pressed) {
    return args.theme.colors.primaryWash;
  }
  return args.isConnected ? args.theme.colors.successOutline : args.theme.colors.outline;
}

// −48, not -48 — DESIGN.md's dBm figures use a true minus sign (U+2212),
// not the hyphen-minus JS's default number-to-string gives you.
function formatRssi(rssi: number): string {
  return String(rssi).replace('-', '−');
}

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
  const level = signalLevel(rssi);
  const isStrongSignal = level === 4;

  let tileColor: ColorToken = 'onSurfaceFaint';
  if (status === 'connected') {
    tileColor = 'success';
  } else if (isStrongSignal) {
    tileColor = 'primary';
  }
  const pill = pillVisual(status, isStrongSignal, theme);
  const isConnected = status === 'connected';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID="device-row"
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: isConnected ? theme.colors.surfaceRaised : theme.colors.surface,
          borderColor: getBorderColor({ pressed, isConnected, theme }),
          borderRadius: theme.rounded.md,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: theme.colors.surfaceMuted }]}>
        <View
          testID="device-row-signal-dot"
          style={[styles.tileDot, { backgroundColor: theme.colors[tileColor] }]}
        />
      </View>
      <View style={styles.text}>
        <ThemedText variant="titleSm" color={isNameFallback ? 'onSurfaceMuted' : 'onSurface'}>
          {name}
        </ThemedText>
        <View style={styles.meta}>
          <View style={styles.bars}>
            {SIGNAL_BAR_HEIGHTS.map((height, index) => (
              <View
                key={height}
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor:
                      index < level ? theme.colors.primary : theme.colors.outlineStrong,
                  },
                ]}
              />
            ))}
          </View>
          <ThemedText variant="dataMd" color="onSurfaceMuted" numberOfLines={1}>
            {t('pairing.deviceRow.rssi', {
              rssi: formatRssi(rssi),
              qualifier: t(SIGNAL_QUALIFIER_KEY_BY_LEVEL[level]),
            })}
          </ThemedText>
        </View>
      </View>
      <View
        style={[
          styles.pill,
          {
            borderRadius: theme.rounded.full,
            backgroundColor: pill.backgroundColor,
            borderColor: pill.borderColor,
          },
        ]}
      >
        {status === 'connecting' ? (
          <ActivityIndicator size="small" color={theme.colors.onPrimary} />
        ) : null}
        <ThemedText variant="actionSm" color={pill.labelColor}>
          {t(TRAILING_COPY_KEY_BY_STATUS[status])}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileDot: {
    width: 16,
    height: 16,
    borderRadius: 5,
  },
  text: {
    flex: 1,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexShrink: 0,
  },
});
