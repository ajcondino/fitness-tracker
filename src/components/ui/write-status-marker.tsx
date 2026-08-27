import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { HealthConnectWriteStatus } from '@/workout/workout-record';

// Three-state status primitive — extends health-connect-section.tsx's
// existing filled-dot/hollow-dot visual language with a third, triangular
// shape for 'failed'. Follows Toggle's exact primitive shape: sits under
// `src/components/ui/`, caller-supplied `accessibilityLabel`, no internal
// i18n, no animation (DESIGN.md's motion restriction — live dot, BPM ring,
// scan-bar sweep only). No new color token: 'written'/'notWritten' reuse
// success/outlineEmphasis exactly as health-connect-section.tsx's dot
// convention does; 'failed' reuses danger, this app's only other status
// color.
export type WriteStatusMarkerProps = {
  status: HealthConnectWriteStatus;
  // Omitted marks the marker purely decorative (importantForAccessibility
  // = 'no') — used where adjacent text already states the status in words.
  // Provided wherever the marker is the only indicator (SessionRow, which
  // carries no status text).
  accessibilityLabel?: string;
  size?: number; // default 9 — DESIGN.md's status-dot range is 7-9px
};

const DEFAULT_SIZE = 9;

export function WriteStatusMarker({
  status,
  accessibilityLabel,
  size = DEFAULT_SIZE,
}: WriteStatusMarkerProps) {
  const theme = useTheme();
  const isDecorative = accessibilityLabel == null;

  if (status === 'written') {
    return (
      <View
        testID="write-status-marker-written"
        accessibilityLabel={accessibilityLabel}
        importantForAccessibility={isDecorative ? 'no' : 'yes'}
        style={{
          width: size,
          height: size,
          borderRadius: theme.rounded.full,
          backgroundColor: theme.colors.success,
        }}
      />
    );
  }

  if (status === 'notWritten') {
    return (
      <View
        testID="write-status-marker-not-written"
        accessibilityLabel={accessibilityLabel}
        importantForAccessibility={isDecorative ? 'no' : 'yes'}
        style={{
          width: size,
          height: size,
          borderRadius: theme.rounded.full,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: theme.colors.outlineEmphasis,
        }}
      />
    );
  }

  // 'failed' — filled triangle via the zero-size-View-plus-border technique
  // already used by live-workout.tsx's playTriangle/index.tsx's heroTriangle,
  // sized to roughly match the two circles' footprint.
  return (
    <View
      testID="write-status-marker-failed"
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={isDecorative ? 'no' : 'yes'}
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size / 2,
        borderRightWidth: size / 2,
        borderBottomWidth: size,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: theme.colors.danger,
      }}
    />
  );
}
