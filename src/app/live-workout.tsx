import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { bleManager } from '@/ble/manager';
import { usePairingStore } from '@/ble/pairing-store';
import { selectDeviceDisplayName } from '@/ble/pairing-types';
import { DeviceChip, type DeviceChipStatus } from '@/components/device-chip';
import { Glow } from '@/components/ui/glow';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { ColorToken } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLiveHeartRate } from '@/hooks/use-live-heart-rate';
import type { LiveHeartRateStatus } from '@/hooks/use-live-heart-rate';
import { useWorkoutSession } from '@/hooks/use-workout-session';
import { WORKOUT_RECORD_SCHEMA_VERSION, createWorkoutId } from '@/workout/workout-record';
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

  const discard = () => router.back();

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

  const canSave = session.phase === 'ended' && session.samples.length > 0;
  const save = () => {
    if (!canSave || session.startedAt == null) return; // Pressable is already
    // `disabled`; defensive, matches the same double-guard `home.tsx`'s
    // goToLiveWorkout already uses. `startedAt` is guaranteed non-null once
    // phase === 'ended' (only reachable via start()); the null check exists
    // purely to satisfy its `number | null` type.
    const record: WorkoutRecord = {
      schemaVersion: WORKOUT_RECORD_SCHEMA_VERSION,
      id: createWorkoutId(session.startedAt),
      startedAt: session.startedAt,
      samples: session.samples,
      device: { id: deviceId, name: device?.name ?? device?.lastKnownName ?? null },
      pauses: session.pauses,
    };
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

      <View style={styles.titleRow}>
        <ThemedText variant="titleMd">{t('liveWorkout.title')}</ThemedText>
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
        {/* Never dimmed/re-colored when stale — the status line alone
            carries "this is frozen," per SPEC.md. */}
        <ThemedText variant="displayXl" color="primary">
          {bpm ?? '--'}
        </ThemedText>
        <ThemedText variant="dataSm" color="onSurfaceMuted">
          {t('liveWorkout.bpmUnit')}
        </ThemedText>
      </View>

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

      {session.phase === 'idle' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={discard}
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
              {t('liveWorkout.discard')}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={session.start}
            testID="live-workout-start"
            style={({ pressed }) => [
              styles.primaryButton,
              styles.actionButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.rounded.xl,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <ThemedText variant="actionMd" color="onPrimary">
              {t('liveWorkout.start')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {session.phase === 'running' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={session.pause}
            testID="live-workout-pause"
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
              {t('liveWorkout.pause')}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={session.stop}
            testID="live-workout-stop"
            style={({ pressed }) => [
              styles.primaryButton,
              styles.actionButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.rounded.xl,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <ThemedText variant="actionMd" color="onPrimary">
              {t('liveWorkout.stop')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {session.phase === 'paused' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={session.stop}
            testID="live-workout-stop"
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
              {t('liveWorkout.stop')}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={session.resume}
            testID="live-workout-resume"
            style={({ pressed }) => [
              styles.primaryButton,
              styles.actionButton,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.rounded.xl,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <ThemedText variant="actionMd" color="onPrimary">
              {t('liveWorkout.resume')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {session.phase === 'ended' && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={discard}
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
              {t('liveWorkout.discard')}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            disabled={!canSave}
            onPress={save}
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
              {t('liveWorkout.save')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {session.phase === 'ended' && !canSave && (
        <ThemedText variant="bodySm" color="onSurfaceMuted" style={styles.saveDisabledHint}>
          {t('liveWorkout.saveDisabledHint')}
        </ThemedText>
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
    gap: spacing.md,
    zIndex: 1,
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
    marginTop: spacing.sm,
    textAlign: 'center',
    zIndex: 1,
  },
});
