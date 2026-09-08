import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { layout } from '@/constants/theme';
import { Screen } from '@/components/ui/screen';

// Mocks just useWindowDimensions out of an otherwise-real react-native —
// same intent as live-workout.test.tsx's react-native-safe-area-context mock
// (docs/specs/tablet-layout/SPEC.md's Implementation Steps), but at this
// internal path rather than the whole 'react-native' package: re-mocking the
// entire package re-triggers native module registration (TurboModuleRegistry
// 'DevMenu') that jest-expo's own react-native mock has already set up.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

function mockWidth(width: number) {
  jest.mocked(useWindowDimensions).mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 });
}

describe('<Screen />', () => {
  it('renders unconstrained at the breakpoint width', async () => {
    mockWidth(layout.contentMaxWidth);
    await render(
      <Screen testID="screen">
        <Text>content</Text>
      </Screen>,
    );

    const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
    expect(style.maxWidth).toBeUndefined();
    expect(style.alignSelf).toBeUndefined();
  });

  it('renders unconstrained below the breakpoint width', async () => {
    mockWidth(400);
    await render(
      <Screen testID="screen">
        <Text>content</Text>
      </Screen>,
    );

    const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
    expect(style.maxWidth).toBeUndefined();
    expect(style.alignSelf).toBeUndefined();
  });

  it('constrains and centres just above the breakpoint width', async () => {
    mockWidth(layout.contentMaxWidth + 1);
    await render(
      <Screen testID="screen">
        <Text>content</Text>
      </Screen>,
    );

    const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
    expect(style.maxWidth).toBe(layout.contentMaxWidth);
    expect(style.alignSelf).toBe('center');
  });

  it('constrains and centres well above the breakpoint width', async () => {
    mockWidth(1024);
    await render(
      <Screen testID="screen">
        <Text>content</Text>
      </Screen>,
    );

    const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
    expect(style.maxWidth).toBe(layout.contentMaxWidth);
    expect(style.alignSelf).toBe('center');
  });

  it('forwards a passed-in style prop alongside the base styles', async () => {
    mockWidth(400);
    await render(
      <Screen testID="screen" style={{ zIndex: 1 }}>
        <Text>content</Text>
      </Screen>,
    );

    const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
    expect(style.zIndex).toBe(1);
    expect(style.flex).toBe(1);
  });
});
