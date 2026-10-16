import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WeightHistoryChart } from '@/components/ui/weight-history-chart';
import type { WeightEntry } from '@/weight/weight-store';

function entry(id: string, kg: number, isoDate: string): WeightEntry {
  return {
    id,
    kg,
    recordedAt: new Date(isoDate).getTime(),
    healthConnect: { status: 'notWritten', recordId: null },
  };
}

async function layout(width = 300) {
  await act(async () => {
    fireEvent(screen.getByTestId('chart'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 160 } },
    });
  });
}

const TWO = [entry('a', 70, '2026-08-01T12:00:00'), entry('b', 72, '2026-08-15T12:00:00')];

describe('<WeightHistoryChart />', () => {
  it('shows only the empty line for zero entries', async () => {
    await render(<WeightHistoryChart entries={[]} unit="metric" testID="chart" />);

    expect(screen.getByText('No weight entries yet.')).toBeOnTheScreen();
    expect(screen.queryByTestId('chart-line')).not.toBeOnTheScreen();
  });

  it('renders nothing but the container before layout', async () => {
    await render(<WeightHistoryChart entries={TWO} unit="metric" testID="chart" />);

    expect(screen.queryByTestId('chart-line')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('chart-dot-a')).not.toBeOnTheScreen();
  });

  it('shows one dot with value and date, and no line, for a single entry', async () => {
    await render(
      <WeightHistoryChart
        entries={[entry('a', 70, '2026-08-01T12:00:00')]}
        unit="metric"
        testID="chart"
      />,
    );
    await layout();

    expect(screen.getByTestId('chart-dot-a')).toBeOnTheScreen();
    expect(screen.queryByTestId('chart-line')).not.toBeOnTheScreen();
    expect(screen.getByText('70.0 kg · Aug 1')).toBeOnTheScreen();
  });

  it('renders one polyline and a dot per entry for 2+ entries', async () => {
    const entries = [...TWO, entry('c', 71, '2026-08-20T12:00:00')];
    await render(<WeightHistoryChart entries={entries} unit="metric" testID="chart" />);
    await layout();

    expect(screen.getByTestId('chart-line')).toBeOnTheScreen();
    for (const id of ['a', 'b', 'c']) {
      expect(screen.getByTestId(`chart-dot-${id}`)).toBeOnTheScreen();
    }
    expect(screen.getByText('Aug 1')).toBeOnTheScreen();
    expect(screen.getByText('Aug 20')).toBeOnTheScreen();
  });

  it('labels y ticks in the chosen unit', async () => {
    const { rerender } = await render(
      <WeightHistoryChart entries={TWO} unit="metric" testID="chart" />,
    );
    await layout();
    // 70–72 kg padded by 10% of the range: 69.8 / 71.0 / 72.2.
    expect(screen.getByText('69.8')).toBeOnTheScreen();
    expect(screen.getByText('72.2')).toBeOnTheScreen();

    await rerender(<WeightHistoryChart entries={TWO} unit="imperial" testID="chart" />);
    // 70 kg = 154.3 lb, 72 kg = 158.7 lb.
    expect(screen.queryByText('69.8')).not.toBeOnTheScreen();
    expect(screen.getByText('153.9')).toBeOnTheScreen();
    expect(screen.getByText('159.2')).toBeOnTheScreen();
  });

  it('exposes a single descriptive accessibility label', async () => {
    await render(<WeightHistoryChart entries={TWO} unit="metric" testID="chart" />);

    expect(screen.getByTestId('chart').props.accessibilityLabel).toBe(
      'Weight history, 2 entries. 70.0 to 72.0 kg, from Aug 1 to Aug 15.',
    );
  });
});
