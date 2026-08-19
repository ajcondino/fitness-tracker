import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWorkoutSummary, describeSessionTime } from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';

// Shared stats display for a workout's `WorkoutRecord` — serves the
// just-finished, not-yet-saved session on Live Workout (`mode="review"`)
// and any already-saved session tapped from History (`mode="detail"`). See
// docs/specs/session-summary/SPEC.md's Data Model for why this takes a raw
// `record` and derives internally, rather than caller-formatted props like
// `SessionRow` does.
export type SessionSummaryProps =
  | { mode: 'review'; record: WorkoutRecord; onSave: () => void; onDiscard: () => void }
  | { mode: 'detail'; record: WorkoutRecord; onBack: () => void; onDone: () => void };

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
  const timeOfDay = describeSessionTime(new Date(record.startedAt));

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <ThemedText variant="labelCaps" color="success">
          {t(
            props.mode === 'review' ? 'sessionSummary.flag.complete' : 'sessionSummary.flag.saved',
          )}
        </ThemedText>
        <ThemedText variant="dataSm" color="onSurfaceDim">
          {formatDateTime(new Date(record.startedAt), i18n.language)}
        </ThemedText>
      </View>

      <View style={styles.heroBlock}>
        <ThemedText variant="h3" color="onSurface">
          {t(`sessionSummary.title.${timeOfDay}`)}
        </ThemedText>
        <View style={styles.heroDurationRow}>
          <ThemedText
            variant="displayLg"
            color="primary"
            style={[styles.heroDuration, { fontVariant: ['tabular-nums'] }]}
          >
            {formatDuration(summary.durationMs)}
          </ThemedText>
          <ThemedText variant="labelMicro" color="onSurfaceDim">
            {t('sessionSummary.stats.totalTime')}
          </ThemedText>
        </View>
      </View>

      {/* The trace-graph ticket slots its chart here, between the hero
          block and the stat cards — no reserved space until it lands. */}

      <View style={styles.statRow}>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.outlineEmphasis,
              borderRadius: theme.rounded.md,
            },
          ]}
        >
          <ThemedText variant="labelMicro" color="onSurfaceMuted">
            {t('sessionSummary.stats.avgBpm')}
          </ThemedText>
          <ThemedText
            variant="h3"
            color="primary"
            style={[styles.statValue, { fontVariant: ['tabular-nums'] }]}
          >
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
          <ThemedText
            variant="h3"
            color="onSurface"
            style={[styles.statValue, { fontVariant: ['tabular-nums'] }]}
          >
            {summary.maxBpm ?? '--'}
          </ThemedText>
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
                {
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.rounded.lg,
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

      {props.mode === 'detail' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={props.onBack}
            testID="session-summary-back"
            style={({ pressed }) => [
              styles.ghostButton,
              {
                borderColor: theme.colors.outlineEmphasis,
                borderRadius: theme.rounded.lg,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <ThemedText variant="actionSm" color="onSurfaceMuted">
              ‹ {t('sessionSummary.back')}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={props.onDone}
            testID="session-summary-done"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.rounded.lg,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <ThemedText variant="actionMd" color="onPrimary">
              {t('sessionSummary.done')}
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroBlock: {
    gap: 4,
  },
  heroDurationRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  heroDuration: {
    lineHeight: 56,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  statValue: {
    lineHeight: 26,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 'auto',
  },
  ghostButton: {
    width: 96,
    height: 56,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabledHint: {
    textAlign: 'center',
  },
});
