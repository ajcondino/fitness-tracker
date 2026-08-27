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
// — the other three stay text links, each as an InfoCard (title + body +
// control). The granted states have a live status to show, so instead of
// an InfoCard they collapse to a single row: a status dot (filled
// `success` when enabled, hollow `outlineEmphasis` ring when disabled —
// echoing DeviceCard's status-dot convention rather than a third dot
// treatment) beside a title/caption pair and the toggle, with no separate
// body — the caption already says what the body said. See SPEC.md's
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

  let content: ReactNode;

  switch (status) {
    case 'notGranted':
      content = (
        <InfoCard
          title={t('healthConnect.notGranted.title')}
          body={t('healthConnect.notGranted.body')}
          control={
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
          }
        />
      );
      break;
    case 'grantedEnabled':
      content = (
        <View style={styles.connectedRow}>
          <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
          <View style={styles.connectedText}>
            <ThemedText variant="bodyMd" color="onSurface">
              {t('healthConnect.granted.enabledTitle')}
            </ThemedText>
            <ThemedText variant="dataSm" color="onSurfaceMuted">
              {t('healthConnect.granted.enabledCaption')}
            </ThemedText>
          </View>
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
      content = (
        <View style={styles.connectedRow}>
          <View
            style={[
              styles.statusDot,
              styles.statusDotHollow,
              { borderColor: theme.colors.outlineEmphasis },
            ]}
          />
          <View style={styles.connectedText}>
            <ThemedText variant="bodyMd" color="onSurface">
              {t('healthConnect.granted.disabledTitle')}
            </ThemedText>
            <ThemedText variant="dataSm" color="onSurfaceMuted">
              {t('healthConnect.granted.disabledCaption')}
            </ThemedText>
          </View>
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
      content = (
        <InfoCard
          title={t('healthConnect.notAvailableTitle')}
          body={t('healthConnect.unavailable.body')}
          control={
            <Pressable
              accessibilityRole="button"
              onPress={onOpenPlayStore}
              testID="health-connect-action"
            >
              <ThemedText variant="actionSm" color="primary">
                {t('healthConnect.unavailable.action')}
              </ThemedText>
            </Pressable>
          }
        />
      );
      break;
    case 'noScreenLock':
      content = (
        <InfoCard
          title={t('healthConnect.notAvailableTitle')}
          body={t('healthConnect.noScreenLock.body')}
          control={
            <Pressable
              accessibilityRole="button"
              onPress={onOpenSecuritySettings}
              testID="health-connect-action"
            >
              <ThemedText variant="actionSm" color="primary">
                {t('healthConnect.noScreenLock.action')}
              </ThemedText>
            </Pressable>
          }
        />
      );
      break;
    case 'permissionExhausted':
      content = (
        <InfoCard
          title={t('healthConnect.notAvailableTitle')}
          body={t('healthConnect.permissionExhausted.body')}
          control={
            <Pressable
              accessibilityRole="button"
              onPress={onOpenHealthConnectApp}
              testID="health-connect-action"
            >
              <ThemedText variant="actionSm" color="primary">
                {t('healthConnect.permissionExhausted.action')}
              </ThemedText>
            </Pressable>
          }
        />
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
        {content}
      </ThemedView>
    </View>
  );
}

// The shared shape for every status that has no live state to show inline:
// a title, a muted body, then that status's control. Only notGranted/
// unavailable/noScreenLock/permissionExhausted use this — the granted
// states render their own single-row layout instead (see the switch
// above).
function InfoCard({ title, body, control }: { title: string; body: string; control: ReactNode }) {
  return (
    <>
      <ThemedText variant="titleSm" color="onSurface">
        {title}
      </ThemedText>
      <ThemedText variant="bodySm" color="onSurfaceMuted">
        {body}
      </ThemedText>
      {control}
    </>
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
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectedText: {
    flex: 1,
    gap: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusDotHollow: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
});
