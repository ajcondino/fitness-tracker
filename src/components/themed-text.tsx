import { Text, type TextProps } from 'react-native';

import type { ColorToken, TypographyVariant } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: ColorToken;
};

export function ThemedText({
  variant = 'bodyMd',
  color = 'onSurface',
  style,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text style={[theme.typography[variant], { color: theme.colors[color] }, style]} {...rest} />
  );
}
