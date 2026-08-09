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
  // `fontWeight` isn't forwarded to the rendered style: each variant's
  // `fontFamily` already points at the specific static font file for that
  // weight (see constants/theme.ts). Requesting a numeric fontWeight on top
  // of a custom Android typeface loaded this way triggers synthetic
  // ("fake") bold on top of an already-bold static font.
  const { fontWeight: _fontWeight, ...typographyStyle } = theme.typography[variant];

  return <Text style={[typographyStyle, { color: theme.colors[color] }, style]} {...rest} />;
}
