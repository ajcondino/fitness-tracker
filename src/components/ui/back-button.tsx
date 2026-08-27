import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type BackButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
};

// The 36×36 back-tile control (DESIGN.md > Components > Back button):
// surface-raised on a 1px outline, `md` radius, a centered ‹ chevron.
// Pressed state shifts the border to outlineEmphasis — DeviceCard/
// SessionRow's own pressed-border convention, applied here. Currently
// only Profile's header uses this exact tile — Device has no back control
// and Summary's is a full-width "‹ Back" ghost button, not a header tile —
// but it's extracted here so any screen that adopts this same header
// pattern later reuses it instead of re-implementing it per screen.
export function BackButton({ onPress, accessibilityLabel, testID }: BackButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: pressed ? theme.colors.outlineEmphasis : theme.colors.outline,
          borderRadius: theme.rounded.md,
        },
      ]}
    >
      <ThemedText variant="titleMd" color="onSurfaceMuted">
        ‹
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
