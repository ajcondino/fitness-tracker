import { View, type ViewProps } from 'react-native';

import type { ColorToken } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  background?: ColorToken;
};

export function ThemedView({ background = 'background', style, ...rest }: ThemedViewProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme.colors[background] }, style]} {...rest} />;
}
