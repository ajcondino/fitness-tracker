import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePairingStore } from '@/ble/pairing-store';
import { selectConnectedDeviceName } from '@/ble/pairing-types';
import { SessionRow } from '@/components/session-row';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { layout, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WorkoutRecord } from '@/workout/workout-record';
import {
  deriveWeeklyTotals,
  deriveWorkoutSummary,
  describeSessionTime,
} from '@/workout/workout-record';
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

// h:mm, not zero-padded on the hour (e.g. "4:12") — distinct from
// formatDuration's mm:ss, used for the 7-day stat card's total.
function formatHoursMinutes(durationMs: number): string {
  const totalMinutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

export default function History() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const isFocused = useIsFocused();
  // The root layout's SafeAreaView only consumes the top edge, and the
  // floating tab bar's own bottom offset doesn't clear list content behind
  // it — per DESIGN.md, scrollable tab screens reserve tabBarClearance in
  // addition to the safe-area bottom inset themselves.
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<WorkoutRecord[] | undefined>(undefined);
  // undefined = not yet loaded this focus; WorkoutRecord[] (possibly []) =
  // loaded — mirrors use-device-pairing.ts's savedDevice undefined/null/value
  // three-state pattern, applied to a list instead of a single value.

  const connection = usePairingStore((state) => state.connection);
  const devices = usePairingStore((state) => state.devices);

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

  const { isConnected, deviceName } = selectConnectedDeviceName(
    { connection, devices },
    t('pairing.deviceRow.unknownDevice'),
  );

  const weeklyTotals = sessions != null ? deriveWeeklyTotals(sessions, Date.now()) : null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText variant="h1">{t('tabs.history')}</ThemedText>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              borderRadius: theme.rounded.full,
            },
          ]}
        >
          <View
            testID="history-pill-dot"
            style={[
              styles.pillDot,
              {
                backgroundColor: isConnected ? theme.colors.success : theme.colors.danger,
                borderRadius: theme.rounded.full,
              },
            ]}
          />
          <ThemedText variant="dataSm" color="onSurfaceMuted">
            {deviceName}
          </ThemedText>
        </View>
      </View>

      {weeklyTotals != null && (
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              borderRadius: theme.rounded.lg,
            },
          ]}
        >
          <View style={styles.statColumn}>
            <ThemedText variant="labelMicro" color="onSurfaceDim">
              {t('history.stats.sevenDayLabel')}
            </ThemedText>
            <ThemedText variant="statMd" color="onSurface" style={styles.statValue}>
              {formatHoursMinutes(weeklyTotals.totalDurationMs)}
            </ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
          <View style={styles.statColumn}>
            <ThemedText variant="labelMicro" color="onSurfaceDim">
              {t('history.stats.sessionsLabel')}
            </ThemedText>
            <ThemedText variant="statMd" color="onSurface" style={styles.statValue}>
              {String(weeklyTotals.sessionCount)}
            </ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
          <View style={styles.statColumn}>
            <ThemedText variant="labelMicro" color="onSurfaceDim">
              {t('history.stats.avgHrLabel')}
            </ThemedText>
            <ThemedText variant="statMd" color="primary" style={styles.statValue}>
              {weeklyTotals.averageBpm == null ? '--' : String(Math.round(weeklyTotals.averageBpm))}
            </ThemedText>
          </View>
        </View>
      )}

      {sessions?.length === 0 && (
        <ThemedText variant="bodyMd" color="onSurfaceMuted">
          {t('history.sessions.empty')}
        </ThemedText>
      )}

      {sessions != null && sessions.length > 0 && (
        <View style={styles.listWrapper}>
          <FlatList
            data={sessions}
            keyExtractor={(record) => record.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: layout.tabBarClearance + insets.bottom },
            ]}
            ListHeaderComponent={
              <ThemedText variant="labelCaps" color="onSurfaceDim">
                {t('history.sessions.header')}
              </ThemedText>
            }
            renderItem={({ item: record }) => {
              const summary = deriveWorkoutSummary(record);
              const startedAtDate = new Date(record.startedAt);
              return (
                <SessionRow
                  monthLabel={formatMonth(startedAtDate, i18n.language)}
                  dayLabel={String(startedAtDate.getDate())}
                  titleLabel={t(`sessionSummary.title.${describeSessionTime(startedAtDate)}`)}
                  timeLabel={formatTime(startedAtDate, i18n.language)}
                  durationLabel={formatDuration(summary.durationMs)}
                  averageBpmLabel={
                    summary.averageBpm == null ? '--' : String(Math.round(summary.averageBpm))
                  }
                  onPress={() =>
                    router.push({ pathname: '/session/[id]', params: { id: record.id } })
                  }
                />
              );
            }}
          />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: 0,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  pillDot: {
    width: 7,
    height: 7,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    padding: spacing.lg,
    gap: 10,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  statValue: {
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
  },
  listWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  listContent: {
    gap: spacing.md,
  },
});
