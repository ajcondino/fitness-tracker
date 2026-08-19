import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { usePairingStore } from '@/ble/pairing-store';
import { selectConnectedDeviceName } from '@/ble/pairing-types';
import { DeviceCard } from '@/components/device-card';
import { SessionRow } from '@/components/session-row';
import { Glow } from '@/components/ui/glow';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWorkoutSummary } from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';
import { loadWorkoutSessions } from '@/workout/workout-store';

const RECENT_SESSION_COUNT = 3;

// Mocked — there's no user/profile feature yet. Source both from the
// signed-in user once auth/profile lands.
const MOCK_USER_NAME = 'AJ';
const MOCK_USER_INITIAL = MOCK_USER_NAME[0];

function getGreetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function formatMonth(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).toUpperCase();
}

function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function Index() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const isFocused = useIsFocused();

  const connection = usePairingStore((state) => state.connection);
  const devices = usePairingStore((state) => state.devices);

  // undefined = not yet loaded this focus; WorkoutRecord[] (possibly []) =
  // loaded — same three-state pattern as history.tsx's own session list.
  const [sessions, setSessions] = useState<WorkoutRecord[] | undefined>(undefined);

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

  const { isConnected, deviceName: connectedDeviceName } = selectConnectedDeviceName(
    { connection, devices },
    t('pairing.deviceRow.unknownDevice'),
  );

  const goToDevice = () => router.navigate('/device');
  const goToLiveWorkout = () => router.navigate('/live-workout');
  const goToHistory = () => router.navigate('/history');

  const heroOnPress = isConnected ? goToLiveWorkout : goToDevice;
  const heroLabel = isConnected ? t('home.startWorkoutCta') : t('home.connectCta');

  const greetingText = t(`home.greeting.${getGreetingKey(new Date().getHours())}`, {
    name: MOCK_USER_NAME,
  });
  const recentSessions = sessions?.slice(0, RECENT_SESSION_COUNT);

  return (
    <ThemedView style={styles.container}>
      <Glow height={300} top={-40} />

      <View style={styles.topBar}>
        <ThemedText variant="wordmark" color="primary">
          {t('home.wordmark')}
        </ThemedText>
        <Pressable
          accessibilityLabel={t('home.profile.label')}
          testID="home-profile-control"
          style={[
            styles.profileControl,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.rounded.sm,
              borderWidth: 1,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          <ThemedText variant="actionSm" color="primary">
            {MOCK_USER_INITIAL}
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.greeting}>
        <ThemedText variant="h1">{greetingText}</ThemedText>
        <ThemedText variant="bodyMd" color="onSurfaceMuted">
          {t('home.greeting.subtitle')}
        </ThemedText>
      </View>

      <View style={styles.content}>
        {isConnected ? (
          <DeviceCard
            status="connected"
            title={connectedDeviceName}
            subtitle={t('home.deviceCard.connectedSubtitle')}
            onPress={goToDevice}
          />
        ) : (
          <DeviceCard
            status="disconnected"
            title={t('home.deviceCard.title')}
            subtitle={t('home.deviceCard.subtitle')}
            onPress={goToDevice}
          />
        )}

        <Pressable
          accessibilityRole="button"
          onPress={heroOnPress}
          testID="home-hero-cta"
          style={({ pressed }) => [
            styles.heroButton,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: theme.rounded.xl,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <View style={[styles.heroTriangle, { borderLeftColor: theme.colors.onPrimary }]} />
          <ThemedText variant="actionLg" color="onPrimary">
            {heroLabel}
          </ThemedText>
        </Pressable>

        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <ThemedText variant="labelCaps" color="onSurfaceFaint">
              {t('home.recent.header')}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={goToHistory}
              testID="home-recent-see-all"
            >
              <ThemedText variant="labelCaps" color="primary">
                {t('home.recent.seeAll')}
              </ThemedText>
            </Pressable>
          </View>

          {recentSessions?.length === 0 && (
            <ThemedText variant="bodyMd" color="onSurfaceMuted">
              {t('home.recent.empty')}
            </ThemedText>
          )}

          {recentSessions != null &&
            recentSessions.length > 0 &&
            recentSessions.map((record) => {
              const summary = deriveWorkoutSummary(record);
              const startedAtDate = new Date(record.startedAt);
              return (
                <SessionRow
                  key={record.id}
                  monthLabel={formatMonth(startedAtDate, i18n.language)}
                  dayLabel={String(startedAtDate.getDate())}
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
            })}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1, // renders above <Glow /> — see glow.tsx's stacking note
  },
  profileControl: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    marginTop: spacing.lg,
    gap: spacing.xs,
    zIndex: 1, // renders above <Glow /> — see glow.tsx's stacking note
  },
  content: {
    marginTop: spacing.xl,
    gap: spacing.lg,
    zIndex: 1, // renders above <Glow /> — see glow.tsx's stacking note
  },
  heroButton: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  heroTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  recentSection: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
