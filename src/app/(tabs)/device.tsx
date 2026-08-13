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
      {/* See index.tsx for why these sibling tab stubs share the h2 role. */}
      <ThemedText variant="h2">{t('tabs.device')}</ThemedText>
      <ThemedText variant="bodyMd" color="onSurfaceMuted" style={styles.subtitle}>
        {t('tabs.deviceSubtitle')}
      </ThemedText>

      <View style={styles.content}>
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
              <ThemedText variant="bodyMd" color="onSurfaceMuted">
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
            <ThemedText variant="bodyMd" color="onSurfaceMuted">
              {status === 'granted'
                ? t('pairing.previouslyPaired.emptyGranted')
                : t('pairing.previouslyPaired.emptyNoAccess')}
            </ThemedText>
          )}
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
  subtitle: {
    marginTop: spacing.sm,
  },
  content: {
    marginTop: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
});
