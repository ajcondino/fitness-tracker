import { View, type StyleProp, type ViewStyle } from 'react-native';

import { ProfileIcon } from '@/components/icons';
import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type AvatarSize = 'sm' | 'lg';

type AvatarBaseProps = {
  size: AvatarSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type AvatarProps =
  | (AvatarBaseProps & { variant?: 'initial'; initial: string })
  | (AvatarBaseProps & { variant: 'placeholder' });

const PLACEHOLDER_GLYPH_SIZE: Record<AvatarSize, number> = { sm: 17, lg: 26 };

// The single shared avatar mark (DESIGN.md > Components > Avatar):
// surface-raised tile on a 1px outline, centered. `sm` is Home's header
// profile control (also a Pressable there — this component is
// presentation-only, so Home wraps it); `lg` is Profile's identity block.
// Sizing is the only thing that varies between the two sizes — never
// re-implement this tile per screen.
//
// Two content variants, same tile: `initial` (default) renders one
// uppercase initial in primary yellow, as before. `placeholder` renders
// ProfileIcon's outline person glyph in `onSurfaceMuted` instead, for a
// not-signed-in user with no initial to show — same tile size/border/
// background in both, only the contents change.
export function Avatar(props: AvatarProps) {
  const theme = useTheme();
  const { size, style, testID } = props;
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
      {props.variant === 'placeholder' ? (
        <ProfileIcon color={theme.colors.onSurfaceMuted} size={PLACEHOLDER_GLYPH_SIZE[size]} />
      ) : (
        <ThemedText variant={size === 'lg' ? 'avatarLg' : 'actionSm'} color="primary">
          {props.initial.toUpperCase()}
        </ThemedText>
      )}
    </View>
  );
}
