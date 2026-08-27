import { View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type AvatarSize = 'sm' | 'lg';

export type AvatarProps = {
  size: AvatarSize;
  initial: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// The single shared avatar mark (DESIGN.md > Components > Avatar):
// surface-raised tile on a 1px outline, one uppercase initial in primary
// yellow, centered. `sm` is Home's header profile control (also a
// Pressable there — this component is presentation-only, so Home wraps
// it); `lg` is Profile's identity block. Sizing is the only thing that
// varies between them — never re-implement this tile per screen.
export function Avatar({ size, initial, style, testID }: AvatarProps) {
  const theme = useTheme();
  const dimension = size === 'lg' ? 56 : 34;
  const radius = size === 'lg' ? theme.rounded.lg : theme.rounded.sm;

  return (
    <View
      testID={testID}
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceRaised,
          borderWidth: 1,
          borderColor: theme.colors.outline,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <ThemedText variant={size === 'lg' ? 'avatarLg' : 'actionSm'} color="primary">
        {initial.toUpperCase()}
      </ThemedText>
    </View>
  );
}
