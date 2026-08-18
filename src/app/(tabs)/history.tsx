import { useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SessionRow } from '@/components/session-row';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { deriveWorkoutSummary } from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';
import { loadWorkoutSessions } from '@/workout/workout-store';

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatMonth(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).toUpperCase();
}

function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function History() {
  const { t, i18n } = useTranslation();
  const isFocused = useIsFocused();
  const [sessions, setSessions] = useState<WorkoutRecord[] | undefined>(undefined);
  // undefined = not yet loaded this focus; WorkoutRecord[] (possibly []) =
  // loaded — mirrors use-device-pairing.ts's savedDevice undefined/null/value
  // three-state pattern, applied to a list instead of a single value.

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    loadWorkoutSessions().then((records) => {
      if (!cancelled) setSessions(records);
    });
    return () => {
      cancelled = true;
    };
  }, [isFocused]);

  return (
    <ThemedView style={styles.container}>
      {/* See index.tsx for why these sibling tab stubs share the h2 role. */}
      <ThemedText variant="h2">{t('tabs.history')}</ThemedText>
      <ThemedText variant="bodyMd" color="onSurfaceMuted" style={styles.subtitle}>
        {t('tabs.historySubtitle')}
      </ThemedText>

      {sessions?.length === 0 && (
        <ThemedText variant="bodyMd" color="onSurfaceMuted" style={styles.empty}>
          {t('history.sessions.empty')}
        </ThemedText>
      )}

      {sessions != null && sessions.length > 0 && (
        <FlatList
          data={sessions}
          keyExtractor={(record) => record.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: record }) => {
            const summary = deriveWorkoutSummary(record);
            const startedAtDate = new Date(record.startedAt);
            return (
              <SessionRow
                monthLabel={formatMonth(startedAtDate, i18n.language)}
                dayLabel={String(startedAtDate.getDate())}
                timeLabel={formatTime(startedAtDate, i18n.language)}
                durationLabel={formatDuration(summary.durationMs)}
                averageBpmLabel={
                  summary.averageBpm == null ? '--' : String(Math.round(summary.averageBpm))
                }
              />
            );
          }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
  empty: {
    marginTop: spacing.xl,
  },
  listContent: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
});
