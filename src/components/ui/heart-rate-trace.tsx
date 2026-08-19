import { StyleSheet, View } from 'react-native';

import type { ColorToken } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const HR_TRACE_MIN_BPM = 80; // resting floor — real sessions cluster
// in [80, 180]; narrower than a raw physiological range so the trace's
// peak-to-valley relief actually reads, matching the mock.
export const HR_TRACE_MAX_BPM = 180; // high-effort ceiling; both fixed
// across every session so two sessions are visually comparable, per the
// ticket — not auto-scaled per render.

// Per-bar intensity thresholds, matching DESIGN.md's "Trace chart" prose
// ("Color by threshold: ≥152bpm primary, ≥130 primary-dim, below that a
// near-ground grey"). Named constants, not magic numbers, so a future zones
// ticket can retune them in one place.
export const HR_TRACE_HIGH_THRESHOLD = 152;
export const HR_TRACE_MID_THRESHOLD = 130;

export type HeartRateTraceProps = {
  values: ReadonlyArray<number | null>; // one entry per bucket, chronological
  minBpm?: number; // default HR_TRACE_MIN_BPM
  maxBpm?: number; // default HR_TRACE_MAX_BPM
  // Optional uniform-color override for every *populated* bar (e.g. a
  // future skeleton/loading state). Omitted — the default — each populated
  // bar is colored by its own value against HR_TRACE_HIGH_THRESHOLD/
  // HR_TRACE_MID_THRESHOLD below. An empty bucket is always
  // `onSurfaceGhost` regardless of this prop — DESIGN.md's own named
  // "empty trace bars" color is never parameterized.
  barColor?: ColorToken;
  height?: number; // default 72
  testID?: string;
};

const MIN_BAR_HEIGHT = 3; // DESIGN.md Shapes: "3px minimum height so an
// empty slot still reads as a slot" — the empty/no-data case only; a
// populated bar's floor is a *percentage* of height (MIN_BAR_FRACTION), not
// this fixed pixel value.
const MIN_BAR_FRACTION = 0.12; // percentage floor for a populated bar, so a
// low reading stays visible without over-inflating a tall one.
const BAR_RADIUS = 2; // DESIGN.md: "2px-radius columns"
const BAR_GAP = 3; // gap between bars, not a per-bar horizontal margin — the
// first/last bar sit flush with the container's own edges.

function thresholdColor(value: number): ColorToken {
  if (value >= HR_TRACE_HIGH_THRESHOLD) return 'primary';
  if (value >= HR_TRACE_MID_THRESHOLD) return 'primaryDim';
  return 'onSurfaceGhost';
}

// Presentational bar renderer: takes an already-bucketed values array (see
// workout-record.ts's bucketHeartRateSamples), no session-shape awareness —
// mirrors PulseRing's own "takes primitives" pattern. Serves both Session
// Summary's static, full-session trace and Live Workout's rolling-window
// trace via the exact same renderer.
export function HeartRateTrace({
  values,
  minBpm = HR_TRACE_MIN_BPM,
  maxBpm = HR_TRACE_MAX_BPM,
  barColor,
  height = 72,
  testID,
}: HeartRateTraceProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.row, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {values.map((value, index) => {
        const isEmpty = value == null;
        const fraction = isEmpty
          ? 0
          : Math.max(0, Math.min(1, (value - minBpm) / (maxBpm - minBpm)));
        const barHeight = isEmpty ? MIN_BAR_HEIGHT : Math.max(MIN_BAR_FRACTION, fraction) * height;
        const colorToken: ColorToken = isEmpty
          ? 'onSurfaceGhost'
          : (barColor ?? thresholdColor(value));
        return (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: theme.colors[colorToken],
                borderRadius: BAR_RADIUS,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BAR_GAP,
  },
  bar: {
    flex: 1,
  },
});
