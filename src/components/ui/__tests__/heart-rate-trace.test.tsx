import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';
import { HeartRateTrace } from '@/components/ui/heart-rate-trace';

// The trace root is accessibilityElementsHidden, which RNTL's queries
// exclude by default (see accessibility.ts) — `hidden: true` opts back in.
function getTrace() {
  return screen.getByTestId('trace', { hidden: true });
}

// screen.getByTestId(...).children is (TestInstance | string)[] — every bar
// rendered here is a host View, never a text node.
function barStyle(index: number) {
  const bar = getTrace().children[index];
  if (typeof bar === 'string') throw new Error('expected a host element, got a text node');
  return StyleSheet.flatten(bar.props.style);
}

describe('<HeartRateTrace />', () => {
  it('renders exactly one bar per entry in values, including consecutive nulls', async () => {
    await render(<HeartRateTrace testID="trace" values={[null, null, 120, null, 140, null]} />);

    expect(getTrace().children.length).toBe(6);
  });

  it('hides the whole row from the accessibility tree', async () => {
    await render(<HeartRateTrace testID="trace" values={[120]} />);

    const node = getTrace();
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('spaces bars with a gap on the row, not a per-bar horizontal margin', async () => {
    await render(<HeartRateTrace testID="trace" values={[120, 140]} />);

    const row = StyleSheet.flatten(getTrace().props.style);
    expect(row.gap).toBe(3);
    const bar = barStyle(0);
    expect(bar.marginHorizontal).toBeUndefined();
  });

  it('renders a null entry at the fixed minimum height in the empty-bucket color', async () => {
    await render(<HeartRateTrace testID="trace" values={[null]} />);

    const bar = barStyle(0);
    expect(bar.height).toBe(3);
    expect(bar.backgroundColor).toBe(colors.onSurfaceGhost);
  });

  describe('per-bar intensity coloring', () => {
    it('colors a bar >= 152 primary', async () => {
      await render(<HeartRateTrace testID="trace" values={[152]} />);

      expect(barStyle(0).backgroundColor).toBe(colors.primary);
    });

    it('colors a bar in [130, 152) primaryDim', async () => {
      await render(<HeartRateTrace testID="trace" values={[130]} />);

      expect(barStyle(0).backgroundColor).toBe(colors.primaryDim);
    });

    it('colors a bar below 130 onSurfaceGhost', async () => {
      await render(<HeartRateTrace testID="trace" values={[129]} />);

      expect(barStyle(0).backgroundColor).toBe(colors.onSurfaceGhost);
    });
  });

  it('uses the given barColor override for every populated bar, but never for an empty one', async () => {
    await render(<HeartRateTrace testID="trace" values={[100, null]} barColor="primary" />);

    expect(barStyle(0).backgroundColor).toBe(colors.primary);
    expect(barStyle(1).backgroundColor).toBe(colors.onSurfaceGhost);
  });

  it('renders a numeric entry scaled between the percentage floor and the container height', async () => {
    // Midpoint of the default [80, 180] range -> 50% of the default 72
    // height container.
    await render(<HeartRateTrace testID="trace" values={[130]} />);

    expect(barStyle(0).height).toBe(36);
  });

  it('clamps a value at or above maxBpm to the full container height', async () => {
    await render(<HeartRateTrace testID="trace" values={[500]} height={100} />);

    expect(barStyle(0).height).toBe(100);
  });

  it('floors a value at or below minBpm to the percentage floor, never negative or zero', async () => {
    await render(<HeartRateTrace testID="trace" values={[0]} height={100} />);

    expect(barStyle(0).height).toBe(12); // MIN_BAR_FRACTION (0.12) * 100
  });

  it('respects custom minBpm/maxBpm and height when scaling', async () => {
    await render(
      <HeartRateTrace testID="trace" values={[75]} minBpm={50} maxBpm={100} height={50} />,
    );

    expect(barStyle(0).height).toBe(25); // (75 - 50) / (100 - 50) = 0.5 -> 25/50
  });
});
