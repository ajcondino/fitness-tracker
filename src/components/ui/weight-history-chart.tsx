import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { ThemedText } from '@/components/ui/themed-text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { UnitSystem } from '@/units/units';
import { buildWeightChartScale } from '@/weight/weight-chart';
import type { WeightEntry } from '@/weight/weight-store';

export type WeightHistoryChartProps = {
  entries: readonly WeightEntry[];
  unit: UnitSystem;
  height?: number; // default 160
  testID?: string;
};

const Y_GUTTER = 48; // left room for the y tick labels
const PLOT_INSET = 6; // keeps edge dots from clipping against the viewBox
const LINE_WIDTH = 2;
const DOT_RADIUS = 3.5;
const GRID_WIDTH = 1;
const TICK_LABEL_HEIGHT = 14; // dataSm line box, for vertical centring on a gridline

function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
    new Date(timestamp),
  );
}

// Standalone SVG line chart — deliberately not sharing code with
// HeartRateTrace. See docs/specs/weight-history-chart/SPEC.md.
export function WeightHistoryChart({
  entries,
  unit,
  height = 160,
  testID,
}: WeightHistoryChartProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const scale = buildWeightChartScale(entries, unit);

  if (scale == null) {
    return (
      <View testID={testID} style={[styles.empty, { height }]}>
        <ThemedText variant="bodySm" color="onSurfaceMuted">
          {t('weight.history.empty')}
        </ThemedText>
      </View>
    );
  }

  const { points, minValue, maxValue, startAt, endAt } = scale;
  const isSingle = points.length === 1;
  const unitLabel = t(`weight.history.unit.${unit}`);
  const first = points[0];
  const latest = points[points.length - 1];
  const firstDate = formatDate(startAt, i18n.language);
  const lastDate = formatDate(endAt, i18n.language);

  const plotLeft = isSingle ? 0 : Y_GUTTER;
  const plotWidth = Math.max(0, width - plotLeft - PLOT_INSET * 2);
  const plotHeight = height - PLOT_INSET * 2;
  const toX = (fraction: number) => plotLeft + PLOT_INSET + fraction * plotWidth;
  const toY = (fraction: number) => PLOT_INSET + (1 - fraction) * plotHeight;

  const ticks = [maxValue, (minValue + maxValue) / 2, minValue];

  const a11yLabel = t('weight.history.a11y', {
    count: points.length,
    first: first.value.toFixed(1),
    latest: latest.value.toFixed(1),
    unit: unitLabel,
    start: firstDate,
    end: lastDate,
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={a11yLabel}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <>
          <View style={{ height }}>
            <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
              {!isSingle &&
                ticks.map((tick, index) => {
                  const y = toY((tick - minValue) / (maxValue - minValue));
                  return (
                    <Line
                      key={index}
                      x1={plotLeft}
                      x2={width}
                      y1={y}
                      y2={y}
                      stroke={theme.colors.outline}
                      strokeWidth={GRID_WIDTH}
                    />
                  );
                })}
              {!isSingle && (
                <Polyline
                  testID={testID ? `${testID}-line` : undefined}
                  points={points.map((p) => `${toX(p.x)},${toY(p.y)}`).join(' ')}
                  fill="none"
                  stroke={theme.colors.primary}
                  strokeWidth={LINE_WIDTH}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {points.map((p) => (
                <Circle
                  key={p.id}
                  testID={testID ? `${testID}-dot-${p.id}` : undefined}
                  cx={isSingle ? width / 2 : toX(p.x)}
                  cy={toY(p.y)}
                  r={DOT_RADIUS}
                  fill={theme.colors.primary}
                />
              ))}
            </Svg>
            {!isSingle &&
              ticks.map((tick, index) => (
                <ThemedText
                  key={index}
                  variant="dataSm"
                  color="onSurfaceDim"
                  style={[
                    styles.tickLabel,
                    {
                      top: toY((tick - minValue) / (maxValue - minValue)) - TICK_LABEL_HEIGHT / 2,
                    },
                  ]}
                >
                  {tick.toFixed(1)}
                </ThemedText>
              ))}
          </View>
          {isSingle ? (
            <ThemedText variant="dataSm" color="onSurfaceDim" style={styles.singleLabel}>
              {t('weight.history.single', {
                value: first.value.toFixed(1),
                unit: unitLabel,
                date: firstDate,
              })}
            </ThemedText>
          ) : (
            <View style={[styles.dateRow, { paddingLeft: plotLeft + PLOT_INSET }]}>
              <ThemedText variant="dataSm" color="onSurfaceDim">
                {firstDate}
              </ThemedText>
              <ThemedText variant="dataSm" color="onSurfaceDim">
                {lastDate}
              </ThemedText>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickLabel: {
    position: 'absolute',
    left: 0,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  singleLabel: {
    textAlign: 'center',
    paddingTop: spacing.xs,
  },
});
