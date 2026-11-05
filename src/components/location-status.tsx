import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { ColorToken } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LocationTrackingStatus } from '@/location/location-types';

export type LocationStatusProps = {
  status: LocationTrackingStatus;
  onRequestAccess: () => void;
  onOpenSettings: () => void;
  testID?: string;
};

type VisibleStatus = Exclude<LocationTrackingStatus, 'idle'>;

// DESIGN.md has exactly two status colors (`success`, `danger`) and no
// dedicated warning color — mirrors scan-status-bar.tsx's own COLOR_BY_STATUS.
const COLOR_BY_STATUS: Record<VisibleStatus, ColorToken> = {
  requesting: 'onSurfaceFaint',
  'permission-denied': 'danger',
  'permission-denied-permanently': 'danger',
  'gps-unavailable': 'danger',
  'acquiring-fix': 'onSurfaceMuted',
  sampling: 'success',
};

// `as const` keeps each value a string literal, which `t()`'s generated key
// union requires.
const COPY_KEY_BY_STATUS = {
  requesting: 'liveWorkout.location.requesting',
  'permission-denied': 'liveWorkout.location.permissionDenied',
  'permission-denied-permanently': 'liveWorkout.location.permissionDeniedPermanently',
  'gps-unavailable': 'liveWorkout.location.gpsUnavailable',
  'acquiring-fix': 'liveWorkout.location.acquiringFix',
  sampling: 'liveWorkout.location.sampling',
} as const satisfies Record<VisibleStatus, string>;

/**
 * One compact, non-modal status line for GPS route recording — never an
 * overlay or Alert, and never disables anything around it. Renders nothing
 * for `idle`. See docs/specs/foreground-location-gps-sampling/SPEC.md.
 */
export function LocationStatus({
  status,
  onRequestAccess,
  onOpenSettings,
  testID,
}: LocationStatusProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (status === 'idle') {
    return null;
  }

  const action =
    status === 'permission-denied'
      ? { label: t('liveWorkout.location.enableAction'), onPress: onRequestAccess }
      : status === 'permission-denied-permanently'
        ? { label: t('liveWorkout.location.openSettingsAction'), onPress: onOpenSettings }
        : null;

  return (
    <ThemedView
      testID={testID}
      background="surface"
      style={[
        styles.container,
        { borderColor: theme.colors.outline, borderRadius: theme.rounded.md },
      ]}
    >
      <View style={styles.message}>
        <ThemedText variant="actionSm" color={COLOR_BY_STATUS[status]}>
          ● {t(COPY_KEY_BY_STATUS[status])}
        </ThemedText>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          testID={testID ? `${testID}-action` : undefined}
        >
          <ThemedText variant="actionSm" color="primary">
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  message: {
    flex: 1,
  },
});
