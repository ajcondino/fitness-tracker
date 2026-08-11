import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScanStatusBar } from '@/components/scan-status-bar';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useBlePermissionStatus } from '@/hooks/use-ble-permission-status';

export default function Device() {
  const { t } = useTranslation();
  const { status, requestAccess, openSettings } = useBlePermissionStatus();

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
        />

        {/* No scanning happens yet (see SPEC.md's Constraints) — this
            section only ever shows once permission is granted, and only
            its empty copy, since there's nothing to scan for regardless. */}
        {status === 'granted' ? (
          <View style={styles.section}>
            <ThemedText variant="labelCaps" color="onSurfaceFaint">
              {t('pairing.nearbyDevices.header')}
            </ThemedText>
            <ThemedText variant="bodyMd" color="onSurfaceMuted">
              {t('pairing.nearbyDevices.empty')}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.section}>
          <ThemedText variant="labelCaps" color="onSurfaceFaint">
            {t('pairing.previouslyPaired.header')}
          </ThemedText>
          <ThemedText variant="bodyMd" color="onSurfaceMuted">
            {status === 'granted'
              ? t('pairing.previouslyPaired.emptyGranted')
              : t('pairing.previouslyPaired.emptyNoAccess')}
          </ThemedText>
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
