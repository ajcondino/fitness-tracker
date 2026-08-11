import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

// DESIGN.md > Components > Device card. This ticket's only caller always
// passes 'disconnected' — 'connected' exists so the follow-up
// scanning/connection ticket only has to thread real state through, not
// touch this component's shape.
export type DeviceCardProps = {
  status: 'connected' | 'disconnected';
  title: string;
  subtitle: string;
  onPress: () => void;
};

export function DeviceCard({ status, title, subtitle, onPress }: DeviceCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID="device-card"
      // Pressed state shifts the border to `primary-wash`, per DESIGN.md.
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: pressed ? theme.colors.primaryWash : theme.colors.outlineStrong,
          borderRadius: theme.rounded.lg,
        },
      ]}
    >
      <View
        style={[
          styles.tile,
          { backgroundColor: theme.colors.surfaceTrack, borderRadius: theme.rounded.sm },
        ]}
      >
        <View
          testID="device-card-status-dot"
          style={[
            styles.statusDot,
            {
              backgroundColor: status === 'connected' ? theme.colors.success : theme.colors.danger,
              borderRadius: theme.rounded.full,
            },
          ]}
        />
      </View>
      <View style={styles.text}>
        <ThemedText variant="titleSm" color="onSurface">
          {title}
        </ThemedText>
        <ThemedText variant="dataMd" color="onSurfaceMuted">
          {subtitle}
        </ThemedText>
      </View>
      <ThemedText variant="titleMd" color="onSurfaceGhost">
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  tile: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
