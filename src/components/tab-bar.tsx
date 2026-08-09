import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import type { Tabs } from 'expo-router';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useTheme } from '@/hooks/use-theme';

// Derived from `Tabs`'s own `tabBar` render prop rather than importing
// react-navigation types directly — expo-router vendors those internally and
// doesn't re-export them from its public entry point.
type TabsProps = ComponentProps<typeof Tabs>;
type TabBarRenderProp = NonNullable<TabsProps['tabBar']>;
export type TabBarProps = Parameters<TabBarRenderProp>[0];

// Per DESIGN.md > Components > Tab bar: device's glyph is a circle, the
// others are squares.
const CIRCLE_ROUTES = new Set(['device']);

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView
      background="surfaceMuted"
      style={[
        styles.bar,
        {
          left: theme.layout.tabBarHorizontalInset,
          right: theme.layout.tabBarHorizontalInset,
          bottom: insets.bottom + theme.layout.tabBarBottomOffset,
          height: theme.layout.tabBarHeight,
          borderRadius: theme.rounded.xl,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const isFocused = state.index === index;
        const tint = isFocused ? 'primary' : 'onSurfaceFaint';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={styles.item}
          >
            <View
              style={[
                styles.glyph,
                {
                  backgroundColor: theme.colors[tint],
                  borderRadius: CIRCLE_ROUTES.has(route.name)
                    ? theme.rounded.full
                    : theme.rounded.sm,
                },
              ]}
            />
            <ThemedText variant="tabLabel" color={tint} style={styles.label}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  glyph: {
    width: 18,
    height: 18,
  },
  label: {
    textTransform: 'uppercase',
  },
});
