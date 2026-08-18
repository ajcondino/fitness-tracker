import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

// Renders `DESIGN.md`'s `row-session`/`row-session-meta` tokens minus the
// trailing chevron: this ticket's rows are not tappable yet — see SPEC.md's
// UI decision. Purely presentational, mirroring `SavedDeviceRow`'s division
// of labor: every label arrives pre-formatted from the caller, no date math,
// no `Intl`, no i18n lookups in here.
export type SessionRowProps = {
  monthLabel: string; // e.g. "AUG" — caller-formatted, already uppercase
  dayLabel: string; // e.g. "17"
  timeLabel: string; // e.g. "6:42 PM" — this row's title line
  durationLabel: string; // e.g. "42:10" — mm:ss, same convention as Live Workout
  averageBpmLabel: string; // e.g. "134", or "--" for a null average
};

export function SessionRow({
  monthLabel,
  dayLabel,
  timeLabel,
  durationLabel,
  averageBpmLabel,
}: SessionRowProps) {
  const theme = useTheme();

  return (
    <View
      testID="session-row"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outline,
          borderRadius: theme.rounded.md,
        },
      ]}
    >
      <View style={styles.dateColumn}>
        <ThemedText variant="labelMicro" color="onSurfaceDim">
          {monthLabel}
        </ThemedText>
        <ThemedText variant="statSm" color="onSurface">
          {dayLabel}
        </ThemedText>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

      <View style={styles.content}>
        <ThemedText variant="titleSm" color="onSurface">
          {timeLabel}
        </ThemedText>
        <View style={styles.meta}>
          <ThemedText variant="dataMd" color="onSurfaceMuted">
            {durationLabel}
          </ThemedText>
          <View style={[styles.dot, { backgroundColor: theme.colors.onSurfaceMuted }]} />
          <ThemedText variant="dataMd" color="primary">
            {averageBpmLabel}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  dateColumn: {
    width: 44,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 34,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
