import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { bleManager } from '@/ble/manager';
import { usePairingStore } from '@/ble/pairing-store';
import { selectDeviceDisplayName } from '@/ble/pairing-types';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { ColorToken } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLiveHeartRate } from '@/hooks/use-live-heart-rate';
import type { LiveHeartRateStatus } from '@/hooks/use-live-heart-rate';

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

export default function LiveWorkout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const connection = usePairingStore((state) => state.connection);
  const devices = usePairingStore((state) => state.devices);

  // No navigation param — reads the connected device straight from the
  // store, per SPEC.md.
  const deviceId = connection.kind === 'connected' ? connection.deviceId : null;
  const device = devices.find((candidate) => candidate.id === deviceId) ?? null;

  const { bpm, status } = useLiveHeartRate(deviceId);

  const discard = () => router.back();

  if (deviceId === null) {
    // Defensive edge case, not a designed flow — Home only enables
    // navigation here when a device is connected. See SPEC.md's Constraints.
    return (
      <ThemedView style={styles.container}>
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

  return (
    <ThemedView style={styles.container}>
      <View style={styles.titleRow}>
        <ThemedText variant="titleMd">{t('liveWorkout.title')}</ThemedText>
        <View
          style={[
            styles.deviceChip,
            { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.rounded.full },
          ]}
        >
          <ThemedText variant="dataSm" color="onSurfaceChip">
            {deviceName}
          </ThemedText>
        </View>
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
          onPress={() => {
            // Workout persistence is a separate future ticket — this is an
            // intentional, tappable no-op for this minimal spec.
          }}
          testID="live-workout-save"
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
            {t('liveWorkout.save')}
          </ThemedText>
        </Pressable>
      </View>

      {__DEV__ && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            bleManager.cancelDeviceConnection(deviceId).catch(() => {
              // Expected no-op if the connection already dropped or was
              // never fully established natively — not a bug to surface.
            });
          }}
          testID="live-workout-simulate-dropout"
          style={({ pressed }) => [
            styles.ghostButton,
            styles.devTrigger,
            {
              borderColor: theme.colors.outlineEmphasis,
              borderRadius: theme.rounded.lg,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <ThemedText variant="actionSm" color="onSurfaceMuted">
            {t('liveWorkout.devSimulateDropout')}
          </ThemedText>
        </Pressable>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  status: {
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  readoutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  devTrigger: {
    marginTop: spacing.md,
  },
});
