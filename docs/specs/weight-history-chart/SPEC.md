# Feature: Weight History Chart

Issue: [#69](https://github.com/ajcondino/fitness-tracker/issues/69) (Milestone 3: Optional Stretch)

## Intent

Profile shows a line chart of every saved body-weight entry across calendar time, in the person's chosen weight unit, with a clear empty state for zero entries and a sensible single-point state for one — built standalone, with the differences from the heart-rate trace written down for the follow-up extraction ticket.

## Context

- **Problem statement:** Weight entries are stored (`WeightEntry[]` in `src/weight/weight-store.ts`, key `weight.entries`, canonical kg, `recordedAt` epoch ms) but nothing shows more than the latest value: `WeightSection` renders only `weight-current`, and `useWeight` exposes only `latestKg`. There is no chart of any kind other than the bar-based `HeartRateTrace`.
- **Current code:**
  - `src/weight/weight-store.ts` — `loadWeightEntries()` already returns all entries sorted ascending by `recordedAt` (ties keep insertion order). Entries are append-only (`addWeightEntry`), never edited. Range is 20–500 kg (`MIN_WEIGHT_KG`/`MAX_WEIGHT_KG`).
  - `src/hooks/use-weight.ts` — loads only `getLatestWeightKg()` on mount; `save()` calls `saveWeightAndSync` and sets `latestKg`. It does not hold the entry list, so a chart fed from it would not update after a save.
  - `src/units/units.ts` — `convertUnit(value, 'weight', system)` (kg → display) and `formatUnit` (1 decimal, `kg`/`lb`). The weight preference comes from `useUnitsPreference().weight` (`UnitSystem`), already read in `src/app/profile.tsx`.
  - `src/components/ui/heart-rate-trace.tsx` — flex-row-of-`View`-bars renderer taking a pre-bucketed `values` array, fixed 80–180 bpm range, hidden from accessibility. Not reused here (see Constraints).
  - `src/components/ui/summary-card.tsx` — `SummaryCard` (label + trailing header, `surface`/`outline`/`lg` card) is the established chart card chrome per DESIGN.md "Trace chart".
  - `react-native-svg` is already a dependency (`icons.tsx`, `glow.tsx`, `scan-status-bar.tsx`, `google-logo.tsx`).
  - `src/app/profile.tsx` composes `AccountSection`, `HealthConnectSection`, `UnitsSection`, `WeightSection` inside `<Screen>`.
- **User impact:** A person can see their weight trend over weeks; toggling kg/lb in Profile immediately re-labels and re-scales the chart.
- **Dependencies:** `weight-capture-health-connect` (#67, entries and `useWeight`) and `units-preference` — both already merged on this branch's base. No new packages.
- **Placement (decision, not stated in the issue):** a new card directly below `WeightSection` on Profile, since that is the only screen that owns weight today. Confirm during review; moving it later is a one-line change in `profile.tsx`.

## Data Model

No persistence changes. No new stored fields.

```ts
// src/weight/weight-chart.ts (pure, no React)
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
```

Invariants: entries are plotted by real `recordedAt` (time-proportional, not evenly spaced); `value = convertUnit(kg, 'weight', system)`; the stored kg is never modified; the axis is auto-scaled to the data with padding so a flat or narrow series still reads (see Interfaces for the rule).

## Interfaces / API

**`buildWeightChartScale(entries: readonly WeightEntry[], system: UnitSystem): WeightChartScale | null`** — pure.

- Returns `null` for zero entries.
- Converts each entry via `convertUnit`. `x = (recordedAt − startAt) / (endAt − startAt)`, or `0.5` when `endAt === startAt` (one entry, or several at an identical timestamp).
- Axis range: `min`/`max` of the converted values, padded by 10% of the range on each side; when `max === min` (one entry or all equal) pad by a fixed ±1 display unit so the point sits mid-chart. `y = (value − minValue) / (maxValue − minValue)`.
- Assumes entries sorted ascending (as `loadWeightEntries` guarantees); does not re-sort.

**`<WeightHistoryChart />`** — `src/components/ui/weight-history-chart.tsx`, presentational, takes primitives/derived data only:

```ts
export type WeightHistoryChartProps = {
  entries: readonly WeightEntry[];
  unit: UnitSystem;
  height?: number; // default 160
  testID?: string;
};
```

Rendering, by entry count:

- **0 entries:** no SVG; a centered `bodySm` / `onSurfaceMuted` line `weight.history.empty`, in a box of the same `height` so the card does not jump when the first entry lands.
- **1 entry:** one `primary` dot at the chart centre plus its value and date as text (`weight.history.single`); no line, no axis ticks.
- **2+ entries:** `react-native-svg` `Polyline` in `primary`, round joins, a `primary` dot per entry, hairline horizontal gridlines at the axis min/mid/max in `outline`, y tick labels (`dataSm`, `onSurfaceDim`) in display units at 1 decimal, and x labels for the first and last date only (`dataSm`, `onSurfaceDim`, via `Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })`, the pattern `session-summary.tsx` uses).
- Size comes from `onLayout` width; SVG viewBox is built from measured width × `height`. Before the first layout, render only the empty-size container.
- Accessibility: the chart group exposes one `accessibilityLabel` (`weight.history.a11y`: count, first→latest value and unit, date range) — unlike the HR trace, which is hidden from accessibility.

**`useWeight()`** gains one field: `entries: WeightEntry[] | undefined` (undefined = loading). `latestKg` and `save` keep their signatures and behaviour; `latestKg` is derived from the same load; `save` appends the returned `entry` to `entries`.

**Card:** `SummaryCard` with `label={t('weight.history.title')}` and `trailing` = unit suffix from `weight.history.unit.{metric|imperial}` (`kg` / `lb`).

Errors: none thrown; corrupt stored entries are already dropped by `parseEntry`.

## Files Created

| File                                                        | Purpose                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/weight/weight-chart.ts`                                | Pure `buildWeightChartScale` + types: unit conversion, time-proportional x, padded auto y-range. |
| `src/weight/__tests__/weight-chart.test.ts`                 | Unit tests for the scale function.                                                               |
| `src/components/ui/weight-history-chart.tsx`                | Standalone SVG line chart with empty / single / multi states.                                    |
| `src/components/ui/__tests__/weight-history-chart.test.tsx` | Component tests for the three states, unit toggle, a11y label.                                   |

## Files Modified

| File                                     | Change                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/hooks/use-weight.ts`                | Load all entries via `loadWeightEntries()`; expose `entries`; derive `latestKg`; append on `save`. |
| `src/hooks/__tests__/use-weight.test.ts` | Cover `entries` loading and post-save append.                                                      |
| `src/app/profile.tsx`                    | Render the chart card below `WeightSection`, passing `entries` and `weight` unit. Additive only.   |
| `src/app/__tests__/profile.test.tsx`     | Assert the chart card renders.                                                                     |
| `src/i18n/locales/en.json`               | Add `weight.history.{title, empty, single, a11y, unit.metric, unit.imperial}`.                     |
| `DESIGN.md`                              | Add a "Weight history chart" component entry (prose only; no new colour/type/spacing tokens).      |

## Implementation Steps

1. Add `DESIGN.md` prose for the weight history chart (reuses `primary`, `outline`, `on-surface-dim`, `data-sm`, `surface` card; CLAUDE.md requires design language to exist there first).
2. Add `weight.history.*` strings to `en.json`.
3. Write `weight-chart.ts` and its tests first: zero entries → `null`; one entry → x 0.5, y 0.5; two entries same timestamp; flat series (all equal); ascending/descending series; imperial conversion changes `value` and axis but not x; padding bounds.
4. Extend `useWeight` with `entries`; update its tests (loading → `undefined`, loaded list, `save` appends and updates `latestKg`).
5. Build `WeightHistoryChart` using only theme tokens via `useTheme`; tests: empty text, single-point text and no polyline, 2+ entries render polyline + N dots, kg vs lb tick labels, a11y label content. Mock/await per CLAUDE.md (`await render(...)`).
6. Wire into `profile.tsx` inside `SummaryCard`; extend the profile test.
7. Fill in the "Extraction Notes" section below with what actually differed from the HR trace during the build.
8. Run `pnpm lint && pnpm typecheck && pnpm test`; smoke-test on a dev client: 0, 1, 2, and ~10 entries, plus the kg↔lb toggle.

## Style & Conventions

- `AGENTS.md`/`CLAUDE.md`: kebab-case component files; presentational primitive under `src/components/ui/`; `@/` aliases; `StyleSheet.create` fed from `constants/theme.ts`; no hardcoded colours/spacing in the screen; dark-only, no `useColorScheme`; every string via `t('weight.history.*')`; React Compiler on, so no manual `useMemo`.
- Pure logic lives outside the component in a framework-free module, as `weight-store.ts` and `units.ts` do.
- Tests colocated in `__tests__/`, `@testing-library/react-native` v14 with async `render`.
- Additive diff to `profile.tsx` and `use-weight.ts`: no restructuring of surrounding code.
- Deliberate deviation: SVG instead of the HR trace's `View` bars — a connected line over irregular timestamps is not expressible as flex bars.

## Acceptance Criteria

- [ ] With 0 entries Profile shows the empty-state line and no chart; with 1 entry it shows a single dot with its value and date and no line.
- [ ] With 2+ entries the chart renders one polyline and one dot per entry, positioned proportionally to `recordedAt`.
- [ ] Toggling Profile's weight unit between kg and lb re-labels the unit suffix and y ticks and re-scales the plot without altering stored data.
- [ ] Saving a new weight from `WeightSection` adds a point without a remount.
- [ ] The chart has a single descriptive accessibility label.
- [ ] No new colour, type, or spacing tokens; no hardcoded strings.
- [ ] `buildWeightChartScale` tests cover empty, single, identical-timestamp, flat, and imperial cases.
- [ ] No import from `heart-rate-trace.tsx` or shared chart code exists in either direction.
- [ ] The Extraction Notes section lists observed differences beyond the issue's table.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Constraints

- **Standalone, deliberately duplicated.** Do not import from or refactor `HeartRateTrace`, and do not generalise this chart (issue #69). Extraction is a follow-up ticket.
- Non-goals: tap/scrub tooltips, zoom or date-range filters, goal lines, editing/deleting entries, Health Connect read-back of historic weight, moving average, a chart on any other screen.
- Axis is auto-scaled to the person's own data (HR is fixed-range for cross-session comparison; weight has no such comparison). If a very long history later hurts legibility, windowing is a separate ticket — all entries are plotted for now.
- Unconfirmed: final placement on Profile (see Context); whether duplicate same-day entries should collapse (this spec plots every entry).
- Android only is built; the chart uses only `react-native-svg` primitives that also work on web.

## Extraction Notes

Seeded from reading `heart-rate-trace.tsx`; to be confirmed and extended during implementation (acceptance criterion).

- **Render primitive:** HR = flex-row of `View` bars; weight = `react-native-svg` line. No shared drawing layer.
- **Input shape:** HR takes a pre-bucketed `(number | null)[]` (bucketing lives in `workout-record.ts`); weight takes raw timestamped entries and derives positions (`buildWeightChartScale`).
- **Axis scaling:** HR fixed 80–180 bpm so sessions compare; weight auto-scaled with 10% padding, ±1 unit when flat.
- **X positioning:** HR index-equals-position (uniform buckets); weight proportional to timestamp.
- **Colour:** HR colours per bar by threshold; weight is single-colour `primary`.
- **Axes/labels:** HR has none (card header shows the unit only); weight has y ticks and first/last date labels.
- **Accessibility:** HR is `accessibilityElementsHidden`; weight exposes one summary label.
- **Empty states:** HR empty slots are 3px ghost bars; weight has dedicated text empty and single-point states.
- **Shared card chrome** (`SummaryCard`, `label` + `trailing`) is the one thing both already use unchanged.

Observed during the build (beyond the table above):

- **Width dependency:** HR bars are `flex: 1`, so layout is free; the SVG needs a measured pixel width (`onLayout`), so the chart renders nothing until first layout.
- **Text overlay:** y tick labels are `ThemedText` views absolutely positioned over the SVG rather than SVG `<Text>`, so they pick up theme typography and are queryable in tests.
- **Single-entry geometry:** the one-point state drops the y gutter and gridlines and centres the dot, so the plot box differs from the 2+ state.
- **Loading vs empty:** the chart itself has no loading state; `profile.tsx` omits the card while `entries` is `undefined` to avoid flashing the empty line.
- **Hook coupling:** `useWeight` now loads the full entry list; `latestKg` is derived from it, so every consumer of the hook (Home too) loads all entries.
- **Test mocks:** adding `entries` to `useWeight`'s return type required updating the Home screen test mocks as well as Profile's.
