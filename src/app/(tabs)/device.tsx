import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ConnectionState, DiscoveredDevice } from '@/ble/pairing-types';
import { selectDeviceDisplayName } from '@/ble/pairing-types';
import { DeviceRow } from '@/components/device-row';
import type { DeviceRowProps } from '@/components/device-row';
import { ScanStatusBar } from '@/components/scan-status-bar';
import { SavedDeviceRow } from '@/components/saved-device-row';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useBlePermissionStatus } from '@/hooks/use-ble-permission-status';
import { useDevicePairing } from '@/hooks/use-device-pairing';

function selectRowStatus(
  device: DiscoveredDevice,
  connection: ConnectionState,
): DeviceRowProps['status'] {
  if (connection.kind === 'connected' && connection.deviceId === device.id) {
    return 'connected';
  }
  if (connection.kind === 'connecting' && connection.deviceId === device.id) {
    return 'connecting';
  }
  if (connection.kind === 'connectionFailed' && connection.deviceId === device.id) {
    return 'failed';
  }
  return 'available';
}

export default function Device() {
  const { t } = useTranslation();
  const { status, requestAccess, openSettings } = useBlePermissionStatus();
  const {
    scanBarState,
    devices,
    connection,
    connect,
    cancelConnect,
    retryScan,
    openBluetoothSettings,
    savedDevice,
    forgetDevice,
  } = useDevicePairing(status === 'granted');

  return (
    <ThemedView style={styles.container}>
      <View>
        <ThemedText variant="labelCaps" color="onSurfaceDim" style={styles.eyebrow}>
          {t('tabs.device')}
        </ThemedText>
        <ThemedText variant="h2" accessibilityRole="header" style={styles.title}>
          {t('pairing.title')}
        </ThemedText>
      </View>

      <ScanStatusBar
        status={status}
        onRequestAccess={requestAccess}
        onOpenSettings={openSettings}
        scanBarState={scanBarState}
        onRetryScan={retryScan}
        onOpenBluetoothSettings={openBluetoothSettings}
      />

      {status === 'granted' ? (
        <View style={styles.section}>
          <ThemedText variant="labelCaps" color="onSurfaceFaint">
            {t('pairing.nearbyDevices.header')}
          </ThemedText>
          {devices.length > 0 ? (
            devices.map((device) => {
              const rowStatus = selectRowStatus(device, connection);
              const { text, isFallback } = selectDeviceDisplayName(
                device,
                t('pairing.deviceRow.unknownDevice'),
              );

              return (
                <DeviceRow
                  key={device.id}
                  name={text}
                  isNameFallback={isFallback}
                  rssi={device.medianRssi}
                  status={rowStatus}
                  disabled={connection.kind === 'connecting' && connection.deviceId !== device.id}
                  onPress={() => {
                    if (rowStatus === 'connecting') {
                      cancelConnect();
                    } else if (rowStatus === 'available' || rowStatus === 'failed') {
                      connect(device.id);
                    }
                  }}
                />
              );
            })
          ) : (
            <ThemedText variant="bodySm" color="onSurfaceMuted" style={styles.emptyState}>
              {t('pairing.nearbyDevices.empty')}
            </ThemedText>
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <ThemedText variant="labelCaps" color="onSurfaceFaint">
          {t('pairing.previouslyPaired.header')}
        </ThemedText>
        {status === 'granted' && savedDevice != null ? (
          <SavedDeviceRow
            name={savedDevice.name ?? t('pairing.deviceRow.unknownDevice')}
            isNameFallback={savedDevice.name == null}
            onForget={forgetDevice}
          />
        ) : (
          <ThemedText variant="bodySm" color="onSurfaceMuted" style={styles.emptyState}>
            {status === 'granted'
              ? t('pairing.previouslyPaired.emptyGranted')
              : t('pairing.previouslyPaired.emptyNoAccess')}
          </ThemedText>
        )}
      </View>

      {/* No CONTINUE/proceed CTA here by design: connecting a device doesn't
          navigate anywhere. Home's hero button is the single entry point
          into a workout, and it already flips to "Start workout" once a
          device is connected (see index.tsx). Don't reintroduce a second
          CTA on this screen. */}
      <ThemedText variant="dataSm" color="onSurfaceDim" style={styles.footerNote}>
        {t('pairing.bleProfileNote')}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: 0,
    gap: 22,
  },
  eyebrow: {
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 6,
  },
  section: {
    gap: 10, // spacing.sm is 8, not 10 — the mock wants a hair more room here
  },
  emptyState: {
    paddingVertical: 10,
  },
  footerNote: {
    marginTop: 'auto',
    alignSelf: 'center',
    textAlign: 'center',
  },
});
