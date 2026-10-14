import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { HeartRateTrace } from '@/components/ui/heart-rate-trace';
import { SummaryCard } from '@/components/ui/summary-card';
import { ThemedText } from '@/components/ui/themed-text';
import { WriteStatusMarker } from '@/components/ui/write-status-marker';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveSessionTitle } from '@/workout/session-title';
import {
  bucketHeartRateSamples,
  deriveWorkoutSummary,
  describeSessionTime,
} from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';

// Fixed bucket *count*, not bucket width, so the rendered bar density is the
// same for a 5-minute and a 90-minute session — bucket duration simply
// scales with the session's own length. See docs/specs/heart-rate-trace-graph.
const TRACE_BUCKET_COUNT = 48;

// Shared stats display for a workout's `WorkoutRecord` — serves the
// just-finished, not-yet-saved session on Live Workout (`mode="review"`)
// and any already-saved session tapped from History (`mode="detail"`). See
// docs/specs/session-summary/SPEC.md's Data Model for why this takes a raw
// `record` and derives internally, rather than caller-formatted props like
// `SessionRow` does.
export type SessionSummaryProps =
  | { mode: 'review'; record: WorkoutRecord; onSave: () => void; onDiscard: () => void }
  | {
      mode: 'detail';
      record: WorkoutRecord;
      onBack: () => void;
      onDone: () => void;
      onSync: () => void;
      isSyncing: boolean;
    };

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

  // The chart's span is wall-clock (start to last reading), not the "active
  // duration" shown in the hero above — see SPEC.md's Design decision for
  // why the two intentionally diverge whenever the session had a pause. The
  // axis row below labels this same span, not summary.durationMs, so it
  // never shows a number the bars themselves don't actually cover.
  const lastSampleAt = record.samples[record.samples.length - 1]?.timestamp ?? record.startedAt;
  const traceSpanMs = lastSampleAt - record.startedAt;
  const traceValues = bucketHeartRateSamples(
    record.samples,
    { start: record.startedAt, end: lastSampleAt },
    TRACE_BUCKET_COUNT,
  );

  return (
    <View style={styles.container}>
      {/*
        Section order is fixed in code, not data-driven. A section renders
        null when its data is absent, and the gap closes over it. Slots:
          1 header · 2 hero · 3 effort (trace, stat row) · 4 course · 5 sync
        Footer is pinned outside the scroll. `course` (route map, then
        altitude + ascent/descent) inserts between effort and sync, behind
        its own presence check. See
        docs/specs/session-summary-information-architecture/SPEC.md.
      */}
      <ScrollView
        testID="session-summary-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusRow}>
          <ThemedText variant="labelCaps" color="success">
            {t(
              props.mode === 'review'
                ? 'sessionSummary.flag.complete'
                : 'sessionSummary.flag.saved',
            )}
          </ThemedText>
          <ThemedText variant="dataSm" color="onSurfaceDim">
            {formatDateTime(new Date(record.startedAt), i18n.language)}
          </ThemedText>
        </View>

        <View style={styles.heroBlock}>
          <ThemedText variant="h3" color="onSurface">
            {deriveSessionTitle(timeOfDay, record.activityType, t)}
          </ThemedText>
          <View style={styles.heroDurationRow}>
            <ThemedText
              testID="session-summary-hero-duration"
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

        <SummaryCard
          label={t('sessionSummary.trace.label')}
          trailing={t('sessionSummary.trace.unit')}
        >
          <HeartRateTrace testID="session-summary-trace" values={traceValues} height={120} />
          <View style={styles.traceCardAxis}>
            <ThemedText variant="dataSm" color="onSurfaceDim">
              {formatDuration(0)}
            </ThemedText>
            <ThemedText variant="dataSm" color="onSurfaceDim">
              {formatDuration(traceSpanMs)}
            </ThemedText>
          </View>
        </SummaryCard>

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

        {/* course — route + altitude tickets insert here */}

        {props.mode === 'detail' && (
          <SummaryCard>
            <View style={styles.writeStatusRow}>
              <WriteStatusMarker status={record.healthConnect.status} size={11} />
              <View style={styles.writeStatusText}>
                <ThemedText variant="bodyMd" color="onSurface">
                  {t(`sessionSummary.writeStatus.${record.healthConnect.status}.title`)}
                </ThemedText>
                <ThemedText variant="dataSm" color="onSurfaceMuted">
                  {t(`sessionSummary.writeStatus.${record.healthConnect.status}.caption`)}
                </ThemedText>
              </View>
              {record.healthConnect.status !== 'written' && (
                <Pressable
                  accessibilityRole="button"
                  testID="session-summary-sync"
                  disabled={props.isSyncing}
                  onPress={props.onSync}
                  style={({ pressed }) => ({ opacity: pressed && !props.isSyncing ? 0.82 : 1 })}
                >
                  <ThemedText variant="actionSm" color="primary">
                    {t(
                      props.isSyncing
                        ? 'sessionSummary.writeStatus.syncing'
                        : 'sessionSummary.writeStatus.syncAction',
                    )}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </SummaryCard>
        )}
      </ScrollView>

      <View testID="session-summary-footer" style={styles.footer}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  footer: {
    gap: spacing.md,
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
  traceCardAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  writeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  writeStatusText: {
    flex: 1,
    gap: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
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
