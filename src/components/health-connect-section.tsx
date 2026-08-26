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
// informational/status row, not a tappable navigation card; md-radius is
// kept deliberately (DESIGN.md's Session row is the same surface/outline/
// md-radius combination for the same "informational, not a nav card"
// reason — there's no separate "one consistent card radius" convention to
// match here). notGranted/unavailable/noScreenLock/permissionExhausted are
// all "informative, not error," but notGranted is the one actionable CTA
// in this set, so its control is a filled button rather than a text link
// — the other three stay text links. The granted states get a small
// status dot (filled `success` when enabled, hollow `outlineEmphasis` ring
// when disabled) above the toggle row, echoing DeviceCard's status-dot
// convention rather than introducing a third dot treatment. See SPEC.md's
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

  let title: string;
  let body: string;
  let control: ReactNode;

  switch (status) {
    case 'notGranted':
      title = t('healthConnect.notGranted.title');
      body = t('healthConnect.notGranted.body');
      control = (
        <Pressable
          accessibilityRole="button"
          onPress={onGrantAccess}
          testID="health-connect-grant-action"
          style={[
            styles.primaryButton,
            { backgroundColor: theme.colors.primary, borderRadius: theme.rounded.md },
          ]}
        >
          <ThemedText variant="actionSm" color="onPrimary">
            {t('healthConnect.notGranted.grantAction')}
          </ThemedText>
        </Pressable>
      );
      break;
    case 'grantedEnabled':
      title = t('healthConnect.granted.enabledTitle');
      body = t('healthConnect.granted.enabledBody');
      control = (
        <>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
            <ThemedText variant="dataSm" color="onSurfaceMuted">
              {t('healthConnect.granted.enabledCaption')}
            </ThemedText>
          </View>
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
        </>
      );
      break;
    case 'grantedDisabled':
      title = t('healthConnect.granted.disabledTitle');
      body = t('healthConnect.granted.disabledBody');
      control = (
        <>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                styles.statusDotHollow,
                { borderColor: theme.colors.outlineEmphasis },
              ]}
            />
            <ThemedText variant="dataSm" color="onSurfaceMuted">
              {t('healthConnect.granted.disabledCaption')}
            </ThemedText>
          </View>
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
        </>
      );
      break;
    case 'unavailable':
      title = t('healthConnect.notAvailableTitle');
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
      title = t('healthConnect.notAvailableTitle');
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
      title = t('healthConnect.notAvailableTitle');
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
        <ThemedText variant="titleSm" color="onSurface">
          {title}
        </ThemedText>
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
    gap: 10,
  },
  primaryButton: {
    height: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotHollow: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
