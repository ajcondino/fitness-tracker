import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ScanBarState } from '@/ble/pairing-types';
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
  scanBarState?: ScanBarState; // new, optional — only read when status === 'granted'
  onRetryScan?: () => void;
  onOpenBluetoothSettings?: () => void;
};

// The `granted` slot's live content, once a `scanBarState` is supplied — kept
// as one small record shape so the render body doesn't fork into two
// separate JSX trees for the legacy vs. live cases.
type GrantedRowContent = {
  text: string;
  detail?: string;
  color: ColorToken;
  filled: boolean;
  actionLabel?: string;
  onPress?: () => void;
};

function deriveGrantedRowContent(
  scanBarState: ScanBarState,
  t: ReturnType<typeof useTranslation>['t'],
  onRetryScan?: () => void,
  onOpenBluetoothSettings?: () => void,
): GrantedRowContent {
  switch (scanBarState.kind) {
    case 'checkingAdapter':
      return { text: t('pairing.scanBar.checkingAdapter'), color: 'onSurfaceFaint', filled: false };
    case 'adapterOff':
      return {
        text: t('pairing.scanBar.adapterOff'),
        detail: t('pairing.scanBar.adapterOffDetail'),
        color: 'danger',
        filled: true,
        actionLabel: t('pairing.scanBar.adapterOffAction'),
        onPress: onOpenBluetoothSettings,
      };
    case 'adapterResetting':
      // Never rendered as a failure — a real, non-error transient state.
      return {
        text: t('pairing.scanBar.adapterResetting'),
        color: 'onSurfaceFaint',
        filled: false,
      };
    case 'adapterUnsupported':
      return {
        text: t('pairing.scanBar.adapterUnsupported'),
        detail: t('pairing.scanBar.adapterUnsupportedDetail'),
        color: 'danger',
        filled: true,
      };
    case 'adapterUnauthorized':
      return {
        text: t('pairing.scanBar.adapterUnauthorized'),
        detail: t('pairing.scanBar.adapterUnauthorizedDetail'),
        color: 'danger',
        filled: true,
      };
    case 'scanning':
      return {
        text: t('pairing.scanBar.scanning', { count: scanBarState.count }),
        color: 'success',
        filled: true,
      };
    case 'scanIdle':
      return {
        text:
          scanBarState.count > 0
            ? t('pairing.scanBar.scanComplete', { count: scanBarState.count })
            : t('pairing.scanBar.scanReady'),
        color: 'onSurfaceMuted',
        filled: true,
        actionLabel: t('pairing.scanBar.scanAgainAction'),
        onPress: onRetryScan,
      };
    case 'scanError': {
      const textKey =
        scanBarState.reason === 'startFailed'
          ? 'pairing.scanBar.scanErrorStartFailed'
          : scanBarState.reason === 'locationServicesDisabled'
            ? 'pairing.scanBar.scanErrorLocationServicesDisabled'
            : 'pairing.scanBar.scanErrorUnknown';
      return {
        text: t(textKey),
        detail:
          scanBarState.reason === 'locationServicesDisabled'
            ? t('pairing.scanBar.scanErrorLocationServicesDisabledDetail')
            : undefined,
        color: 'danger',
        filled: true,
        actionLabel: t('pairing.scanBar.scanAgainAction'),
        onPress: onRetryScan,
      };
    }
    case 'connecting':
      return {
        text: t('pairing.scanBar.connectingTo', { name: scanBarState.name }),
        color: 'primary',
        filled: false,
      };
    case 'connected':
      return {
        text: t('pairing.scanBar.connectedTo', { name: scanBarState.name }),
        color: 'success',
        filled: true,
      };
  }
}

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
  const { status, scanBarState, onRetryScan, onOpenBluetoothSettings } = props;
  const { t } = useTranslation();
  const theme = useTheme();

  // The `granted` slot goes live once a `scanBarState` is supplied. If
  // `status === 'granted'` and none is passed (shouldn't happen once
  // device.tsx is updated, but kept safe for any other future caller), this
  // is `null` and the six-row logic below renders the original fixed
  // `granted` copy unchanged.
  const grantedContent =
    status === 'granted' && scanBarState
      ? deriveGrantedRowContent(scanBarState, t, onRetryScan, onOpenBluetoothSettings)
      : null;

  const detailKey = DETAIL_KEY_BY_STATUS[status];
  const legacyAction = ACTION_BY_STATUS[status];

  const color = grantedContent ? grantedContent.color : COLOR_BY_STATUS[status];
  const filled = grantedContent ? grantedContent.filled : FILLED_DOT_STATUSES.has(status);
  const text = grantedContent ? grantedContent.text : t(COPY_KEY_BY_STATUS[status]);
  const detail = grantedContent ? grantedContent.detail : detailKey ? t(detailKey) : undefined;
  const actionLabel = grantedContent
    ? grantedContent.actionLabel
    : legacyAction
      ? t(legacyAction.labelKey)
      : undefined;
  const onActionPress = grantedContent
    ? grantedContent.onPress
    : legacyAction
      ? () => legacyAction.onPress(props)
      : undefined;

  return (
    <ThemedView
      background="surface"
      style={[
        styles.container,
        { borderColor: theme.colors.outline, borderRadius: theme.rounded.md },
      ]}
    >
      <View style={styles.message}>
        <ThemedText variant="actionSm" color={color}>
          {filled ? '●' : '○'} {text}
        </ThemedText>
        {detail ? (
          <ThemedText variant="bodySm" color="onSurfaceMuted">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          testID="scan-status-bar-action"
        >
          <ThemedText variant="actionSm" color="primary">
            {actionLabel}
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
