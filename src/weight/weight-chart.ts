import { convertUnit } from '@/units/units';
import type { UnitSystem } from '@/units/units';
import type { WeightEntry } from '@/weight/weight-store';

/**
 * Framework-free scale for the weight history chart (no React import) —
 * unit conversion, time-proportional x, padded auto-scaled y. See
 * docs/specs/weight-history-chart/SPEC.md's Data Model.
 */

export type WeightChartPoint = {
  id: string; // WeightEntry.id, used as React key
  x: number; // 0–1 fraction of the time span; 0.5 when span is zero
  y: number; // 0–1 fraction of the padded value range, 0 = bottom
  value: number; // display-unit value (already converted)
  recordedAt: number;
};

export type WeightChartScale = {
  points: WeightChartPoint[];
  minValue: number; // padded axis bottom, display unit
  maxValue: number; // padded axis top, display unit
  startAt: number; // earliest recordedAt
  endAt: number; // latest recordedAt
};

const RANGE_PADDING_FRACTION = 0.1;
const FLAT_PADDING = 1; // display units either side when every value is equal

// Assumes `entries` is sorted ascending by `recordedAt` (as
// `loadWeightEntries` guarantees); does not re-sort.
export function buildWeightChartScale(
  entries: readonly WeightEntry[],
  system: UnitSystem,
): WeightChartScale | null {
  if (entries.length === 0) return null;

  const values = entries.map((entry) => convertUnit(entry.kg, 'weight', system));
  const startAt = entries[0].recordedAt;
  const endAt = entries[entries.length - 1].recordedAt;
  const span = endAt - startAt;

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const padding = hi === lo ? FLAT_PADDING : (hi - lo) * RANGE_PADDING_FRACTION;
  const minValue = lo - padding;
  const maxValue = hi + padding;

  const points = entries.map((entry, index) => ({
    id: entry.id,
    x: span === 0 ? 0.5 : (entry.recordedAt - startAt) / span,
    y: (values[index] - minValue) / (maxValue - minValue),
    value: values[index],
    recordedAt: entry.recordedAt,
  }));

  return { points, minValue, maxValue, startAt, endAt };
}
