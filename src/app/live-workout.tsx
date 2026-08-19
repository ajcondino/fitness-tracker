import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { bleManager } from '@/ble/manager';
import { usePairingStore } from '@/ble/pairing-store';
import { selectDeviceDisplayName } from '@/ble/pairing-types';
import { DeviceChip, type DeviceChipStatus } from '@/components/device-chip';
import { SessionSummary } from '@/components/session-summary';
import { Glow } from '@/components/ui/glow';
import { PulseRing } from '@/components/ui/pulse-ring';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { ColorToken } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLiveHeartRate } from '@/hooks/use-live-heart-rate';
import type { LiveHeartRateStatus } from '@/hooks/use-live-heart-rate';
import { useWorkoutSession } from '@/hooks/use-workout-session';
import {
  WORKOUT_RECORD_SCHEMA_VERSION,
  createWorkoutId,
  describeSessionTime,
} from '@/workout/workout-record';
import type { WorkoutRecord } from '@/workout/workout-record';
import { saveWorkoutSession } from '@/workout/workout-store';

function selectStatusCopy(
  status: LiveHeartRateStatus,
  labels: { live: string; signalLost: string; waiting: string },
): { color: ColorToken; text: string } {
  switch (status) {
    case 'live':
      return { color: 'success', text: labels.live };
    case 'stale':
      return { color: 'danger', text: labels.signalLost };
    case 'awaitingFirstReading':
      return { color: 'onSurfaceMuted', text: labels.waiting };
  }
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function LiveWorkout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  // The root layout's SafeAreaView only consumes the top edge (see
  // _layout.tsx's comment) — as a screen pushed outside the tab bar's own
  // bottom-inset handling, this one is responsible for its own, so the
  // Discard/Save row isn't overlapped by the phone's gesture nav bar.
  const insets = useSafeAreaInsets();

  const devices = usePairingStore((state) => state.devices);
  const connection = usePairingStore((state) => state.connection);

  // No navigation param — reads the connected device straight from the
  // store, per SPEC.md. Captured once at mount rather than derived from a
  // live `connection` selector: `connection` can leave 'connected' mid-session
  // (see ble-connection-loss-detection's spec) and this screen's behavior
  // must not change when that happens.
  const [deviceId] = useState(() => {
    const connection = usePairingStore.getState().connection;
    return connection.kind === 'connected' ? connection.deviceId : null;
  });
  const device = devices.find((candidate) => candidate.id === deviceId) ?? null;

  // Scoped to the frozen device: whether it's currently connected, and
  // whether an auto-reconnect-after-drop retry is in flight for it. The
  // screen still does not otherwise react to `connection.kind` — see
  // auto-reconnect-after-drop's spec.
  const isConnected =
    deviceId != null && connection.kind === 'connected' && connection.deviceId === deviceId;
  const isReconnecting =
    deviceId != null && connection.kind === 'reconnecting' && connection.deviceId === deviceId;

  const { bpm, status, lastReadingAt } = useLiveHeartRate(deviceId, isConnected);
  const session = useWorkoutSession(bpm, lastReadingAt);

  // The session header's derived name (e.g. "Morning Workout"), memoized on
  // `startedAt` so it's computed once for the life of the session rather
  // than on every render — a session that crosses a time-of-day boundary
  // (e.g. starting 11:58, ending 12:20) keeps reading "Morning Workout" for
  // its whole duration. See workout-record.ts's describeSessionTime and
  // session-summary.tsx's identical use of it. Before the session actually
  // starts, `startedAt` is null, so this falls back to the current time —
  // there's no session identity yet to freeze.
  const sessionTimeOfDay = useMemo(
    () => describeSessionTime(new Date(session.startedAt ?? Date.now())),
    [session.startedAt],
  );

  // Whether Save/Discard has already been tapped — lets the beforeRemove
  // guard below allow that self-initiated navigation through without
  // re-prompting. See SPEC.md's "leaving the review screen" design decision.
  const [decided, setDecided] = useState(false);

  // The just-ended, not-yet-saved WorkoutRecord, computed exactly once for
  // the lifetime of the ended phase — `createWorkoutId` isn't idempotent, so
  // recomputing on every render would give the record a different `id` each
  // time. See SPEC.md's Data Model.
  const [record, setRecord] = useState<WorkoutRecord | null>(null);

  useEffect(() => {
    if (deviceId == null) return;
    const startedAt = session.startedAt;
    if (session.phase !== 'ended' || startedAt == null) return;
    const samples = session.samples;
    const pauses = session.pauses;
    setRecord((prev) => {
      if (prev != null) return prev;
      return {
        schemaVersion: WORKOUT_RECORD_SCHEMA_VERSION,
        id: createWorkoutId(startedAt),
        startedAt,
        samples,
        device: { id: deviceId, name: device?.name ?? device?.lastKnownName ?? null },
        pauses,
      };
    });
  }, [deviceId, device, session.phase, session.startedAt, session.samples, session.pauses]);

  const discard = () => {
    setDecided(true);
    router.back();
  };

  // Intercepts back gesture/hardware back while the review screen is showing
  // an ended, undecided session — confirms before discarding. See SPEC.md's
  // "leaving the review screen" design decision.
  useEffect(() => {
    if (session.phase !== 'ended') return undefined;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (decided) return;
      e.preventDefault();
      Alert.alert(
        t('sessionSummary.leaveConfirm.title'),
        t('sessionSummary.leaveConfirm.message'),
        [
          { text: t('sessionSummary.leaveConfirm.cancel'), style: 'cancel' },
          {
            text: t('sessionSummary.leaveConfirm.discard'),
            style: 'destructive',
            onPress: discard,
          },
        ],
      );
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, session.phase, decided, t]);

  if (deviceId === null) {
    // Defensive edge case, not a designed flow — Home only enables
    // navigation here when a device is connected. See SPEC.md's Constraints.
    return (
      <ThemedView
        testID="live-workout-container"
        style={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}
      >
        <View style={styles.guardContent}>
          <ThemedText variant="h2">{t('liveWorkout.noDevice.title')}</ThemedText>
          <ThemedText variant="bodyMd" color="onSurfaceMuted" style={styles.guardSubtitle}>
            {t('liveWorkout.noDevice.subtitle')}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={discard}
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
              {t('liveWorkout.discard')}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const deviceName = device
    ? selectDeviceDisplayName(device, t('pairing.deviceRow.unknownDevice')).text
    : t('pairing.deviceRow.unknownDevice');
  const statusCopy = selectStatusCopy(status, {
    live: t('liveWorkout.status.live'),
    signalLost: t('liveWorkout.status.signalLost'),
    waiting: t('liveWorkout.status.waiting'),
  });
  const chipStatus: DeviceChipStatus = isReconnecting
    ? 'reconnecting'
    : isConnected
      ? 'connected'
      : 'disconnected';

  const save = () => {
    if (record == null) return;
    setDecided(true);
    void saveWorkoutSession(record); // fire-and-forget — same contract as
    // use-device-pairing.ts's `void saveDevice(saved)`; the write is not
    // awaited before navigating back.
    router.back();
  };

  return (
    <ThemedView
      testID="live-workout-container"
      style={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      <Glow height={320} top={-70} />

      {/* Title row, status line, and BPM readout all hide once ended: the
          summary below is meant to read as its own screen, not a panel
          appended under the still-visible live session chrome — see
          docs/specs/session-summary/SPEC.md. */}
      {session.phase !== 'ended' && (
        <>
          <View style={styles.titleRow}>
            <View style={styles.sessionHeading}>
              <ThemedText variant="labelCaps" color="onSurfaceDim" style={styles.eyebrow}>
                {t('liveWorkout.sessionLabel')}
              </ThemedText>
              <ThemedText variant="titleMd" color="onSurface">
                {t(`sessionSummary.title.${sessionTimeOfDay}`)}
              </ThemedText>
            </View>
            <DeviceChip
              deviceName={deviceName}
              status={chipStatus}
              onSimulateDropout={() => {
                bleManager.cancelDeviceConnection(deviceId).catch(() => {
                  // Expected no-op if the connection already dropped or was
                  // never fully established natively — not a bug to surface.
                });
              }}
            />
          </View>

          <ThemedText variant="dataSm" color={statusCopy.color} style={styles.status}>
            {statusCopy.text}
          </ThemedText>

          <View style={styles.readoutContainer}>
            <PulseRing active={session.phase === 'running'} />
            {/* Never dimmed/re-colored when stale — the status line alone
                carries "this is frozen," per SPEC.md. */}
            <ThemedText variant="displayXl" color="primary">
              {bpm ?? '--'}
            </ThemedText>
            <ThemedText variant="dataSm" color="onSurfaceMuted">
              {t('liveWorkout.bpmUnit')}
            </ThemedText>
          </View>
        </>
      )}

      {/* Removed once ended: replaced below by <SessionSummary mode="review" />,
          which shows its own title, hero duration, and avg/max stat cards —
          see docs/specs/session-summary/SPEC.md. */}
      {session.phase !== 'ended' && (
        <View style={styles.statsRow}>
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
              {t('liveWorkout.stats.elapsed')}
            </ThemedText>
            <ThemedText variant="h3" color="onSurface">
              {formatElapsed(session.elapsedMs)}
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
              {t('liveWorkout.stats.avgBpm')}
            </ThemedText>
            <ThemedText variant="h3" color="onSurface">
              {session.averageBpm == null ? '--' : Math.round(session.averageBpm)}
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
              {t('liveWorkout.stats.maxBpm')}
            </ThemedText>
            <ThemedText variant="h3" color="onSurface">
              {session.maxBpm ?? '--'}
            </ThemedText>
          </View>
        </View>
      )}

      {/* The left slot is a fixed 64x64 square in every phase — only what's
          inside it (and what it's wired to) changes. Pre-start there is no
          session yet, so nothing there is destructive: it's a plain back
          button to router.back() via the existing discard() (same one the
          no-device guard above uses), not a variant of Stop. Once running or
          paused, the same slot becomes the red Stop square. See the ticket's
          "idle controls" decision. */}
      {session.phase === 'idle' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('liveWorkout.discard')}
            onPress={discard}
            testID="live-workout-discard"
            style={({ pressed }) => [
              styles.squareButton,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.outline,
                borderRadius: theme.rounded.xl,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <ThemedText variant="titleMd" color="onSurfaceMuted">
              ‹
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={session.start}
            testID="live-workout-start"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.rounded.xl,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={[styles.playTriangle, { borderLeftColor: theme.colors.onPrimary }]} />
            <ThemedText variant="actionLg" color="onPrimary">
              {t('liveWorkout.start')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {session.phase === 'running' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('liveWorkout.stop')}
            onPress={session.stop}
            testID="live-workout-stop"
            style={({ pressed }) => [
              styles.squareButton,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: pressed ? theme.colors.danger : theme.colors.outlineEmphasis,
                borderRadius: theme.rounded.xl,
              },
            ]}
          >
            <View style={[styles.stopSquare, { backgroundColor: theme.colors.danger }]} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={session.pause}
            testID="live-workout-pause"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.rounded.xl,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={styles.pauseBars}>
              <View style={[styles.pauseBar, { backgroundColor: theme.colors.onPrimary }]} />
              <View style={[styles.pauseBar, { backgroundColor: theme.colors.onPrimary }]} />
            </View>
            <ThemedText variant="actionLg" color="onPrimary">
              {t('liveWorkout.pause')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {session.phase === 'paused' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('liveWorkout.stop')}
            onPress={session.stop}
            testID="live-workout-stop"
            style={({ pressed }) => [
              styles.squareButton,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: pressed ? theme.colors.danger : theme.colors.outlineEmphasis,
                borderRadius: theme.rounded.xl,
              },
            ]}
          >
            <View style={[styles.stopSquare, { backgroundColor: theme.colors.danger }]} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={session.resume}
            testID="live-workout-resume"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.rounded.xl,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={[styles.playTriangle, { borderLeftColor: theme.colors.onPrimary }]} />
            <ThemedText variant="actionLg" color="onPrimary">
              {t('liveWorkout.resume')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {session.phase === 'ended' && record != null && (
        <View style={styles.summaryContainer}>
          <SessionSummary mode="review" record={record} onSave={save} onDiscard={discard} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  guardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  guardSubtitle: {
    textAlign: 'center',
  },
  // zIndex: 1 on this screen's direct children of `container` — renders
  // above <Glow />, whose own absence of a zIndex is deliberate; see
  // glow.tsx's stacking note.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  sessionHeading: {
    gap: 2,
  },
  eyebrow: {
    textTransform: 'uppercase',
  },
  status: {
    marginTop: spacing.lg,
    textAlign: 'center',
    zIndex: 1,
  },
  readoutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    zIndex: 1,
    // Gives <PulseRing />'s absolute positioning a frame to center within —
    // see pulse-ring.tsx's own centering note.
    position: 'relative',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.lg,
    zIndex: 1,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    padding: 14,
    gap: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    zIndex: 1,
  },
  // Only used by the no-device guard screen's own Discard button, above —
  // unrelated to the phase-conditional row below it.
  ghostButton: {
    height: 56,
    borderWidth: 1,
  },
  // The fixed-width left slot of the phase-conditional row: a plain back
  // chevron pre-start, the red Stop square once running/paused.
  squareButton: {
    width: 64,
    height: 64,
    borderWidth: 1,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  primaryButton: {
    flex: 1,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pauseBars: {
    flexDirection: 'row',
    gap: 5,
  },
  pauseBar: {
    width: 6,
    height: 20,
    borderRadius: 2,
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  summaryContainer: {
    flex: 1,
    zIndex: 1,
  },
});
