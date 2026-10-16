import { buildWeightChartScale } from '@/weight/weight-chart';
import type { WeightEntry } from '@/weight/weight-store';

function entry(id: string, kg: number, recordedAt: number): WeightEntry {
  return { id, kg, recordedAt, healthConnect: { status: 'notWritten', recordId: null } };
}

describe('buildWeightChartScale', () => {
  it('returns null for zero entries', () => {
    expect(buildWeightChartScale([], 'metric')).toBeNull();
  });

  it('centres a single entry with ±1 unit padding', () => {
    const scale = buildWeightChartScale([entry('a', 70, 1000)], 'metric')!;
    expect(scale.points).toEqual([{ id: 'a', x: 0.5, y: 0.5, value: 70, recordedAt: 1000 }]);
    expect(scale.minValue).toBe(69);
    expect(scale.maxValue).toBe(71);
    expect(scale.startAt).toBe(1000);
    expect(scale.endAt).toBe(1000);
  });

  it('centres x for several entries at an identical timestamp', () => {
    const scale = buildWeightChartScale([entry('a', 70, 5), entry('b', 72, 5)], 'metric')!;
    expect(scale.points.map((p) => p.x)).toEqual([0.5, 0.5]);
  });

  it('pads a flat series by ±1 so the line sits mid-chart', () => {
    const scale = buildWeightChartScale([entry('a', 80, 0), entry('b', 80, 100)], 'metric')!;
    expect(scale.minValue).toBe(79);
    expect(scale.maxValue).toBe(81);
    expect(scale.points.map((p) => p.y)).toEqual([0.5, 0.5]);
  });

  it('pads a varying series by 10% of the range each side', () => {
    const scale = buildWeightChartScale([entry('a', 70, 0), entry('b', 80, 100)], 'metric')!;
    expect(scale.minValue).toBeCloseTo(69);
    expect(scale.maxValue).toBeCloseTo(81);
    expect(scale.points[0].y).toBeCloseTo(1 / 12);
    expect(scale.points[1].y).toBeCloseTo(11 / 12);
  });

  it('plots x proportionally to recordedAt, not evenly', () => {
    const scale = buildWeightChartScale(
      [entry('a', 70, 0), entry('b', 71, 10), entry('c', 72, 100)],
      'metric',
    )!;
    expect(scale.points.map((p) => p.x)).toEqual([0, 0.1, 1]);
  });

  it('handles descending series', () => {
    const scale = buildWeightChartScale([entry('a', 80, 0), entry('b', 70, 100)], 'metric')!;
    expect(scale.points[0].y).toBeGreaterThan(scale.points[1].y);
  });

  it('converts to pounds for the value and axis but leaves x unchanged', () => {
    const entries = [entry('a', 70, 0), entry('b', 80, 100)];
    const metric = buildWeightChartScale(entries, 'metric')!;
    const imperial = buildWeightChartScale(entries, 'imperial')!;
    expect(imperial.points[0].value).toBeCloseTo(154.32, 1);
    expect(imperial.points[1].value).toBeCloseTo(176.37, 1);
    expect(imperial.minValue).toBeGreaterThan(metric.minValue);
    expect(imperial.points.map((p) => p.x)).toEqual(metric.points.map((p) => p.x));
    expect(entries[0].kg).toBe(70);
  });
});
