import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';

import { layout } from '@/constants/theme';

export type ScreenProps = ViewProps;

/**
 * Constrain-and-centre content wrapper (docs/specs/tablet-layout/SPEC.md).
 * A plain `View`, not a `ThemedView` — it has no background of its own, so
 * it never interferes with whatever background a screen has already drawn
 * around it. Below `layout.contentMaxWidth` this is a no-op: content renders
 * exactly as it did before this component existed.
 */
export function Screen({ style, children, ...rest }: ScreenProps) {
  const { width } = useWindowDimensions();
  const isConstrained = width > layout.contentMaxWidth;

  return (
    <View style={[styles.base, isConstrained && styles.constrained, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, width: '100%' },
  constrained: { maxWidth: layout.contentMaxWidth, alignSelf: 'center' },
});
