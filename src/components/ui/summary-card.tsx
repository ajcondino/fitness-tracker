import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SummaryCardProps = {
  label?: string; // label-caps / onSurfaceDim header, left. Omitted = no header row.
  trailing?: string; // label-caps / onSurfaceDim, right of the header (e.g. "bpm"). Ignored when label is omitted.
  children: ReactNode;
  testID?: string;
};

// Shared card chrome for every session-summary section. Presentational only:
// callers decide whether a section exists before creating the card. See
// docs/specs/session-summary-information-architecture/SPEC.md.
export function SummaryCard({ label, trailing, children, testID }: SummaryCardProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outline,
          borderRadius: theme.rounded.lg,
        },
      ]}
    >
      {label != null && (
        <View style={styles.header}>
          <ThemedText variant="labelCaps" color="onSurfaceDim">
            {label}
          </ThemedText>
          {trailing != null && (
            <ThemedText variant="labelCaps" color="onSurfaceDim">
              {trailing}
            </ThemedText>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
