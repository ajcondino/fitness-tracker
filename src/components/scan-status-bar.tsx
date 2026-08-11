import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { ColorToken } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import type { BlePermissionStatus } from '@/hooks/use-ble-permission-status';
import { useTheme } from '@/hooks/use-theme';

export type ScanStatusBarProps = {
  status: BlePermissionStatus;
  onRequestAccess: () => void;
  onOpenSettings: () => void;
};

// DESIGN.md has exactly two status colors (`success`, `danger`) and no
// dedicated warning color — the `partial-*` states are still broken states
// functionally, so they're styled identically to `denied`/`blocked` and
// differentiated from them by copy alone.
const COLOR_BY_STATUS: Record<BlePermissionStatus, ColorToken> = {
  undetermined: 'onSurfaceFaint',
  requesting: 'onSurfaceFaint',
  granted: 'success',
  'partial-scan-only': 'danger',
  'partial-connect-only': 'danger',
  denied: 'danger',
  blocked: 'danger',
};

// Filled once the OS has settled on an outcome (good or broken); hollow
// while nothing has been decided yet.
const FILLED_DOT_STATUSES = new Set<BlePermissionStatus>([
  'granted',
  'partial-scan-only',
  'partial-connect-only',
  'denied',
  'blocked',
]);

// `as const` (rather than annotating with `Record<BlePermissionStatus,
// string>`) keeps each value a string literal instead of widening it to
// `string`, which is what `t()`'s generated key union requires.
const COPY_KEY_BY_STATUS = {
  undetermined: 'pairing.scanStatus.undetermined',
  requesting: 'pairing.scanStatus.requesting',
  granted: 'pairing.scanStatus.granted',
  'partial-scan-only': 'pairing.scanStatus.partialScanOnly',
  'partial-connect-only': 'pairing.scanStatus.partialConnectOnly',
  denied: 'pairing.scanStatus.denied',
  blocked: 'pairing.scanStatus.blocked',
} as const satisfies Record<BlePermissionStatus, string>;

const DETAIL_KEY_BY_STATUS = {
  undetermined: null,
  requesting: null,
  granted: null,
  'partial-scan-only': 'pairing.scanStatus.partialScanOnlyDetail',
  'partial-connect-only': 'pairing.scanStatus.partialConnectOnlyDetail',
  denied: null,
  blocked: 'pairing.scanStatus.blockedDetail',
} as const satisfies Record<BlePermissionStatus, string | null>;

type Action = {
  labelKey:
    | 'pairing.scanStatus.grantAction'
    | 'pairing.scanStatus.retryAction'
    | 'pairing.scanStatus.openSettingsAction';
  onPress: (props: ScanStatusBarProps) => void;
};

// `undetermined` and the two `partial-*`/`denied` states all retry through
// the same `onRequestAccess` call — only `blocked` needs Settings, since a
// blocked permission can't be recovered by asking again.
const ACTION_BY_STATUS: Partial<Record<BlePermissionStatus, Action>> = {
  undetermined: {
    labelKey: 'pairing.scanStatus.grantAction',
    onPress: (props) => props.onRequestAccess(),
  },
  'partial-scan-only': {
    labelKey: 'pairing.scanStatus.retryAction',
    onPress: (props) => props.onRequestAccess(),
  },
  'partial-connect-only': {
    labelKey: 'pairing.scanStatus.retryAction',
    onPress: (props) => props.onRequestAccess(),
  },
  denied: {
    labelKey: 'pairing.scanStatus.retryAction',
    onPress: (props) => props.onRequestAccess(),
  },
  blocked: {
    labelKey: 'pairing.scanStatus.openSettingsAction',
    onPress: (props) => props.onOpenSettings(),
  },
};

export function ScanStatusBar(props: ScanStatusBarProps) {
  const { status } = props;
  const { t } = useTranslation();
  const theme = useTheme();

  const detailKey = DETAIL_KEY_BY_STATUS[status];
  const action = ACTION_BY_STATUS[status];

  return (
    <ThemedView
      background="surface"
      style={[
        styles.container,
        { borderColor: theme.colors.outline, borderRadius: theme.rounded.md },
      ]}
    >
      <View style={styles.message}>
        <ThemedText variant="actionSm" color={COLOR_BY_STATUS[status]}>
          {FILLED_DOT_STATUSES.has(status) ? '●' : '○'} {t(COPY_KEY_BY_STATUS[status])}
        </ThemedText>
        {detailKey ? (
          <ThemedText variant="bodySm" color="onSurfaceMuted">
            {t(detailKey)}
          </ThemedText>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => action.onPress(props)}
          testID="scan-status-bar-action"
        >
          <ThemedText variant="actionSm" color="primary">
            {t(action.labelKey)}
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  message: {
    flex: 1,
    gap: spacing.xs,
  },
});
