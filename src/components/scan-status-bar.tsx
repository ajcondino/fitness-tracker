import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import type { ScanBarState } from '@/ble/pairing-types';
import { LiveDot } from '@/components/ui/live-dot';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { ColorToken } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import type { BlePermissionStatus } from '@/hooks/use-ble-permission-status';
import { useTheme } from '@/hooks/use-theme';

// DESIGN.md > Motion > "Scan-bar sweep": a soft `primary` gradient band
// sweeping left-to-right across the bar while a scan is in progress — the
// one motion exception outside the live dot / BPM ring.
const SWEEP_DURATION_MS = 2400;
const SWEEP_WIDTH_RATIO = 0.3;
const SWEEP_PEAK_OPACITY = 0.1;

function ScanSweep() {
  const theme = useTheme();
  const gradientId = useId();
  const [width, setWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (width === 0) {
      return undefined;
    }
    translateX.setValue(0);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration: SWEEP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [width, translateX]);

  const bandWidth = width * SWEEP_WIDTH_RATIO;
  const translate = translateX.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, width || 1],
  });

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Animated.View
          style={[styles.sweepBand, { width: bandWidth, transform: [{ translateX: translate }] }]}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={theme.colors.primary} stopOpacity={0} />
                <Stop
                  offset="0.5"
                  stopColor={theme.colors.primary}
                  stopOpacity={SWEEP_PEAK_OPACITY}
                />
                <Stop offset="1" stopColor={theme.colors.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

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
      // Unused for display — `deriveLiveRowContent` below renders `scanning`
      // via its own dedicated row instead. Kept here only so this switch
      // stays exhaustive over `ScanBarState.kind`.
      return {
        text: `${t('pairing.scanBar.scanningLabel')} ${t('pairing.scanBar.foundCount', { count: scanBarState.count })}`,
        color: 'primary',
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
      // Unused for display — `deriveLiveRowContent` below renders
      // `connecting` via its own dedicated row instead. Kept here only so
      // this switch stays exhaustive over `ScanBarState.kind`.
      return {
        text: t('pairing.scanBar.connecting'),
        color: 'primary',
        filled: false,
      };
    case 'connected':
      // Unused for display — `deriveLiveRowContent` below renders
      // `connected` via its own dedicated row instead. Kept here only so
      // this switch stays exhaustive over `ScanBarState.kind`.
      return {
        text: `${t('pairing.scanBar.connectedLabel')} ${t('pairing.scanBar.foundCount', { count: scanBarState.count })}`,
        color: 'success',
        filled: true,
      };
  }
}

// The three `ScanBarState` kinds rendered via the dedicated "live row"
// (LiveDot + label on the left, a second line of text on the right) instead
// of the shared text-line layout every other kind above uses — see
// ble-device-scanning/SPEC.md. `scanning` and `connecting` additionally get
// the animated gradient sweep; `connected` doesn't (a settled connection
// isn't "in progress"). All three reuse the same `color` for the dot and
// the label, per this app's "a status is a dot plus a word, same color"
// convention. `connecting` borrows `scanning`'s own label and sweep —
// scanning has just stopped to make room for the connect attempt, so the
// bar keeps reading as "still working," with the right-hand text swapping
// from a found-count to the word "connecting" to say what's actually
// happening now.
type LiveRowContent = {
  color: ColorToken;
  label: string;
  rightText: string;
  sweep: boolean;
};

function deriveLiveRowContent(
  scanBarState: ScanBarState,
  t: ReturnType<typeof useTranslation>['t'],
): LiveRowContent | null {
  switch (scanBarState.kind) {
    case 'scanning':
      return {
        color: 'primary',
        label: t('pairing.scanBar.scanningLabel'),
        rightText: t('pairing.scanBar.foundCount', { count: scanBarState.count }),
        sweep: true,
      };
    case 'connecting':
      return {
        color: 'primary',
        label: t('pairing.scanBar.scanningLabel'),
        rightText: t('pairing.scanBar.connecting'),
        sweep: true,
      };
    case 'connected':
      return {
        color: 'success',
        label: t('pairing.scanBar.connectedLabel'),
        rightText: t('pairing.scanBar.foundCount', { count: scanBarState.count }),
        sweep: false,
      };
    default:
      return null;
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

  // `scanning` and `connected` are rendered via their own "live row" —
  // LiveDot + label on the left, found-count on the right — instead of the
  // shared text-line layout every other kind below uses. See
  // ble-device-scanning/SPEC.md.
  const liveRow =
    status === 'granted' && scanBarState ? deriveLiveRowContent(scanBarState, t) : null;

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
      {liveRow ? (
        <>
          {liveRow.sweep ? <ScanSweep /> : null}
          <View style={styles.liveRowLeft}>
            <LiveDot color={liveRow.color} testID="scan-status-bar-live-dot" />
            <ThemedText variant="actionSm" color={liveRow.color}>
              {liveRow.label}
            </ThemedText>
          </View>
          <ThemedText variant="dataMd" color="onSurfaceMuted">
            {liveRow.rightText}
          </ThemedText>
        </>
      ) : (
        <>
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
        </>
      )}
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
    // Clips the scanning-state gradient sweep to the bar's own rounded
    // corners — surface, border, radius, and padding are unchanged.
    overflow: 'hidden',
  },
  message: {
    flex: 1,
    gap: spacing.xs,
  },
  liveRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sweepBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
