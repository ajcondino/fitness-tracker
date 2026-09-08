import { render, screen } from '@testing-library/react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { TabBar, type TabBarProps } from '@/components/tab-bar';
import { layout } from '@/constants/theme';

// No <SafeAreaProvider> in this test tree — mocked with a representative
// bottom inset, same precedent as history.test.tsx.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

// Mocks just useWindowDimensions out of an otherwise-real react-native — see
// screen.test.tsx's identical mock for why this targets the internal module
// path rather than the whole 'react-native' package.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

function mockWidth(width: number) {
  jest.mocked(useWindowDimensions).mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 });
}

// Minimal fake of expo-router's <Tabs> tabBar render prop — only the shape
// TabBar itself reads: one route per tab, keyed by the route names the
// shared icon map (tab-bar.tsx's ICONS) expects.
function makeProps(): TabBarProps {
  const routes = ['index', 'history', 'device'].map((name) => ({ key: name, name }));
  return {
    state: { routes, index: 0 },
    descriptors: Object.fromEntries(
      routes.map((route) => [route.key, { options: { title: route.name.toUpperCase() } }]),
    ),
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
  } as unknown as TabBarProps;
}

function barStyle() {
  return StyleSheet.flatten(screen.getByTestId('tab-bar').props.style);
}

describe('<TabBar />', () => {
  it('pins to the horizontal insets below the breakpoint', async () => {
    mockWidth(400);
    await render(<TabBar {...makeProps()} />);

    const style = barStyle();
    expect(style.left).toBe(layout.tabBarHorizontalInset);
    expect(style.right).toBe(layout.tabBarHorizontalInset);
    expect(style.width).toBeUndefined();
  });

  it('caps and centres the bar width above the breakpoint', async () => {
    mockWidth(1024);
    await render(<TabBar {...makeProps()} />);

    const style = barStyle();
    expect(style.left).toBeUndefined();
    expect(style.right).toBeUndefined();
    expect(style.alignSelf).toBe('center');
    expect(style.width).toBe(layout.tabBarMaxWidth);
  });

  it('caps at tabBarMaxWidth rather than the horizontal-inset bound on a viewport only slightly past the breakpoint', async () => {
    // At a width just past the breakpoint, `width - insets*2` (692) is still
    // well above `tabBarMaxWidth` (400) — Math.min() picks tabBarMaxWidth,
    // exactly the "don't let the bar grow toward contentMaxWidth" behaviour
    // this cap exists for (see theme.ts's layout comment).
    mockWidth(layout.contentMaxWidth + 20);
    await render(<TabBar {...makeProps()} />);

    const style = barStyle();
    expect(style.width).toBe(layout.tabBarMaxWidth);
  });
});
