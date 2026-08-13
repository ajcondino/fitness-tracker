import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

// device-row.tsx is the closest existing row precedent, but its prop shape
// (`rssi`, a required `status`) is scan-specific — this is a new, narrower
// sibling for a not-currently-scanning saved device, per SPEC.md's Context.
export type SavedDeviceRowProps = {
  name: string;
  isNameFallback: boolean; // dims the name, mirrors DeviceRowProps
  onForget: () => void;
};

export function SavedDeviceRow({ name, isNameFallback, onForget }: SavedDeviceRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View
      testID="saved-device-row"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outline,
          borderRadius: theme.rounded.md,
        },
      ]}
    >
      <ThemedText
        variant="titleSm"
        color={isNameFallback ? 'onSurfaceMuted' : 'onSurface'}
        style={styles.name}
      >
        {name}
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onForget} testID="saved-device-row-forget">
        <ThemedText variant="actionSm" color="danger">
          {t('pairing.previouslyPaired.forgetAction')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  name: {
    flex: 1,
  },
});
