import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

// Renders `DESIGN.md`'s `row-session`/`row-session-meta` tokens in full,
// including the trailing chevron. Otherwise presentational, mirroring
// `SavedDeviceRow`'s division of labor: every label arrives pre-formatted
// from the caller, no date math, no `Intl` — the one exception is the "avg"
// unit suffix, a single i18n lookup done here.
//
// Pressed/selected state (only relevant when `onPress` is provided) is
// `surfaceRaised` fill with the border shifted to `primaryWash` — DESIGN.md's
// "muted yellow, pressed-state border on tappable cards" token.
export type SessionRowProps = {
  monthLabel: string; // e.g. "AUG" — caller-formatted, already uppercase
  dayLabel: string; // e.g. "17"
  timeLabel: string; // e.g. "6:42 PM" — this row's title line
  durationLabel: string; // e.g. "42:10" — mm:ss, same convention as Live Workout
  averageBpmLabel: string; // e.g. "134", or "--" for a null average
  onPress?: () => void; // omitted keeps the row exactly as non-interactive as before
};

export function SessionRow({
  monthLabel,
  dayLabel,
  timeLabel,
  durationLabel,
  averageBpmLabel,
  onPress,
}: SessionRowProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      testID="session-row"
      disabled={onPress == null}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed && onPress ? theme.colors.surfaceRaised : theme.colors.surface,
          borderColor: pressed && onPress ? theme.colors.primaryWash : theme.colors.outline,
          borderRadius: theme.rounded.md,
        },
      ]}
    >
      <View style={styles.dateColumn}>
        <ThemedText variant="labelMicro" color="onSurfaceDim">
          {monthLabel}
        </ThemedText>
        <ThemedText
          variant="statSm"
          color="onSurface"
          style={{ lineHeight: theme.typography.statSm.fontSize * 1.1 }}
        >
          {dayLabel}
        </ThemedText>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

      <View style={styles.content}>
        <ThemedText variant="titleSm" color="onSurface" numberOfLines={1}>
          {timeLabel}
        </ThemedText>
        <View style={styles.meta}>
          <ThemedText variant="dataMd" color="onSurfaceMuted">
            {durationLabel}
          </ThemedText>
          <View style={[styles.dot, { backgroundColor: theme.colors.outline }]} />
          <ThemedText variant="dataMd" color="primary">
            {`${averageBpmLabel} ${t('history.sessionRow.avgSuffix')}`}
          </ThemedText>
        </View>
      </View>

      <ThemedText variant="titleMd" color="onSurfaceDim">
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 14,
  },
  dateColumn: {
    width: 44,
    flexShrink: 0,
    alignItems: 'center',
    gap: 1,
  },
  divider: {
    width: 1,
    height: 34,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
