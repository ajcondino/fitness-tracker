import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Toggle } from '@/components/ui/toggle';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import type { HealthConnectSectionStatus } from '@/hooks/use-health-connect-settings';
import { useTheme } from '@/hooks/use-theme';

export type HealthConnectSectionProps = {
  status: HealthConnectSectionStatus;
  onGrantAccess: () => void;
  onToggleWriteBack: (enabled: boolean) => void;
  onOpenHealthConnectApp: () => void;
  onOpenSecuritySettings: () => void;
  onOpenPlayStore: () => void;
};

// Renders null for 'checking' — mirrors index.tsx's "renders nothing
// further while loading" convention. Chrome matches ScanStatusBar's bar
// (surface/outline/md-radius), not DeviceCard's raised chrome — this is an
// informational/status row, not a tappable navigation card. No status dot
// for any of the six states: notGranted/unavailable/noScreenLock/
// permissionExhausted are all "informative, not error," and the granted
// states communicate on/off via the Toggle alone. See SPEC.md's
// Interfaces/API copy table.
export function HealthConnectSection({
  status,
  onGrantAccess,
  onToggleWriteBack,
  onOpenHealthConnectApp,
  onOpenSecuritySettings,
  onOpenPlayStore,
}: HealthConnectSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (status === 'checking') {
    return null;
  }

  let body: string;
  let control: ReactNode;

  switch (status) {
    case 'notGranted':
      body = t('healthConnect.notGranted.body');
      control = (
        <Pressable
          accessibilityRole="button"
          onPress={onGrantAccess}
          testID="health-connect-grant-action"
        >
          <ThemedText variant="actionSm" color="primary">
            {t('healthConnect.notGranted.grantAction')}
          </ThemedText>
        </Pressable>
      );
      break;
    case 'grantedEnabled':
      body = t('healthConnect.granted.enabledBody');
      control = (
        <View style={styles.toggleRow}>
          <ThemedText variant="bodySm" color="onSurfaceMuted">
            {t('healthConnect.granted.toggleLabel')}
          </ThemedText>
          <Toggle
            value={true}
            onValueChange={() => onToggleWriteBack(false)}
            accessibilityLabel={t('healthConnect.granted.toggleLabel')}
            testID="health-connect-toggle"
          />
        </View>
      );
      break;
    case 'grantedDisabled':
      body = t('healthConnect.granted.disabledBody');
      control = (
        <View style={styles.toggleRow}>
          <ThemedText variant="bodySm" color="onSurfaceMuted">
            {t('healthConnect.granted.toggleLabel')}
          </ThemedText>
          <Toggle
            value={false}
            onValueChange={() => onToggleWriteBack(true)}
            accessibilityLabel={t('healthConnect.granted.toggleLabel')}
            testID="health-connect-toggle"
          />
        </View>
      );
      break;
    case 'unavailable':
      body = t('healthConnect.unavailable.body');
      control = (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenPlayStore}
          testID="health-connect-action"
        >
          <ThemedText variant="actionSm" color="primary">
            {t('healthConnect.unavailable.action')}
          </ThemedText>
        </Pressable>
      );
      break;
    case 'noScreenLock':
      body = t('healthConnect.noScreenLock.body');
      control = (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenSecuritySettings}
          testID="health-connect-action"
        >
          <ThemedText variant="actionSm" color="primary">
            {t('healthConnect.noScreenLock.action')}
          </ThemedText>
        </Pressable>
      );
      break;
    case 'permissionExhausted':
      body = t('healthConnect.permissionExhausted.body');
      control = (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenHealthConnectApp}
          testID="health-connect-action"
        >
          <ThemedText variant="actionSm" color="primary">
            {t('healthConnect.permissionExhausted.action')}
          </ThemedText>
        </Pressable>
      );
      break;
  }

  return (
    <View style={styles.section}>
      <ThemedText variant="labelCaps" color="onSurfaceFaint">
        {t('healthConnect.sectionHeader')}
      </ThemedText>
      <ThemedView
        background="surface"
        style={[
          styles.container,
          { borderColor: theme.colors.outline, borderRadius: theme.rounded.md },
        ]}
      >
        <ThemedText variant="bodySm" color="onSurfaceMuted">
          {body}
        </ThemedText>
        {control}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  container: {
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
