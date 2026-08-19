import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWorkoutSummary } from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';

// Shared stats display for a workout's `WorkoutRecord` — serves the
// just-finished, not-yet-saved session on Live Workout (`mode="review"`)
// and any already-saved session tapped from History (`mode="detail"`). See
// docs/specs/session-summary/SPEC.md's Data Model for why this takes a raw
// `record` and derives internally, rather than caller-formatted props like
// `SessionRow` does.
export type SessionSummaryProps =
  | { mode: 'review'; record: WorkoutRecord; onSave: () => void; onDiscard: () => void }
  | { mode: 'detail'; record: WorkoutRecord; onBack: () => void };

// mm:ss — identical to history.tsx's/index.tsx's own private copies (see
// SPEC.md's Style & Conventions for why this isn't extracted into a shared
// util).
function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// e.g. "AUG 19 · 6:42 PM".
function formatDateTime(date: Date, locale: string): string {
  const datePart = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
    .format(date)
    .toUpperCase();
  const timePart = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    date,
  );
  return `${datePart} · ${timePart}`;
}

export function SessionSummary(props: SessionSummaryProps) {
  const { record } = props;
  const theme = useTheme();
  const { t, i18n } = useTranslation();

  const summary = deriveWorkoutSummary(record);
  const canSave = record.samples.length > 0;
  const deviceName = record.device.name ?? t('pairing.deviceRow.unknownDevice');
  const hasPauses = record.pauses.length > 0;

  return (
    <View style={styles.container}>
      {props.mode === 'detail' && (
        <Pressable
          accessibilityRole="button"
          onPress={props.onBack}
          testID="session-summary-back"
          style={styles.backButton}
        >
          <ThemedText variant="titleMd" color="onSurfaceDim">
            ‹
          </ThemedText>
        </Pressable>
      )}

      <ThemedText variant="titleSm" color="onSurface" style={styles.dateTime}>
        {formatDateTime(new Date(record.startedAt), i18n.language)}
      </ThemedText>

      <ThemedText variant="labelMicro" color="onSurfaceDim" style={styles.heroCaption}>
        {t('sessionSummary.stats.activeDuration')}
      </ThemedText>
      <ThemedText variant="displayLg" color="primary" style={styles.heroDuration}>
        {formatDuration(summary.durationMs)}
      </ThemedText>

      {/* Reserved for the trace-graph ticket — deliberately empty, no
          placeholder chrome. */}
      <View style={styles.chartPlaceholder} />

      <View style={styles.statGrid}>
        <View style={styles.statRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.rounded.md,
              },
            ]}
          >
            <ThemedText variant="labelMicro" color="onSurfaceDim">
              {t('sessionSummary.stats.avgBpm')}
            </ThemedText>
            <ThemedText variant="h3" color="onSurface">
              {summary.averageBpm == null ? '--' : String(Math.round(summary.averageBpm))}
            </ThemedText>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.rounded.md,
              },
            ]}
          >
            <ThemedText variant="labelMicro" color="onSurfaceDim">
              {t('sessionSummary.stats.maxBpm')}
            </ThemedText>
            <ThemedText variant="h3" color="onSurface">
              {summary.maxBpm ?? '--'}
            </ThemedText>
          </View>
        </View>

        <View style={styles.statRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.rounded.md,
              },
            ]}
          >
            <ThemedText variant="labelMicro" color="onSurfaceDim">
              {t('sessionSummary.stats.device')}
            </ThemedText>
            <ThemedText variant="h3" color="onSurface">
              {deviceName}
            </ThemedText>
          </View>
          {hasPauses && (
            <View
              style={[
                styles.statCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outline,
                  borderRadius: theme.rounded.md,
                },
              ]}
            >
              <ThemedText variant="labelMicro" color="onSurfaceDim">
                {t('sessionSummary.stats.pausedTime')}
              </ThemedText>
              <ThemedText variant="h3" color="onSurface">
                {formatDuration(summary.pausedMs)}
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {props.mode === 'review' && (
        <>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={props.onDiscard}
              testID="live-workout-discard"
              style={({ pressed }) => [
                styles.ghostButton,
                styles.actionButton,
                {
                  borderColor: theme.colors.outlineEmphasis,
                  borderRadius: theme.rounded.lg,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <ThemedText variant="actionSm" color="onSurfaceMuted">
                {t('sessionSummary.discard')}
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={props.onSave}
              testID="live-workout-save"
              style={({ pressed }) => [
                styles.primaryButton,
                styles.actionButton,
                {
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.rounded.xl,
                  opacity: pressed && canSave ? 0.82 : 1,
                },
              ]}
            >
              <ThemedText variant="actionMd" color="onPrimary">
                {t('sessionSummary.save')}
              </ThemedText>
            </Pressable>
          </View>

          {!canSave && (
            <ThemedText variant="bodySm" color="onSurfaceMuted" style={styles.saveDisabledHint}>
              {t('sessionSummary.saveDisabledHint')}
            </ThemedText>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  dateTime: {
    textAlign: 'center',
  },
  heroCaption: {
    textAlign: 'center',
  },
  heroDuration: {
    textAlign: 'center',
  },
  chartPlaceholder: {
    minHeight: 120,
  },
  statGrid: {
    gap: 10,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    padding: 14,
    gap: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButton: {
    height: 56,
    borderWidth: 1,
  },
  primaryButton: {
    height: 60,
  },
  saveDisabledHint: {
    textAlign: 'center',
  },
});
