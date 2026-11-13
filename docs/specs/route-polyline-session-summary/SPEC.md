# Feature: Route Polyline on Session Summary

## Intent

A session summary (review and detail) whose record holds a usable GPS route shows, in the `course` slot, a fixed-height, non-interactive map card that draws the route as a polyline auto-fitted to the card, with a distinct start marker and end marker. Where the session lost GPS or was paused, the polyline is broken into separate segments rather than bridged with a straight line. A record with no usable route (every pre-M3 session, every indoor session, a denied/unavailable-GPS session, a one-point route) renders no route card, no empty container, and no gap.

## Context

- **Problem statement:** [GitHub issue #77](https://github.com/ajcondino/fitness-tracker/issues/77) (Milestone 3: Optional Stretch). `WorkoutRecord.route` is now recorded (#75, `7e7fb1f`) but nothing displays it. `react-native-maps` is installed (#73) but no committed component imports it (`maps-setup` shipped credentials only).
- **Current code:**
  - `src/workout/workout-record.ts` — `RoutePoint = { latitude, longitude, timestamp }` (finite WGS84 degrees, `Date.now()` at arrival); `WorkoutRecord.route: RoutePoint[]`, `[]` meaning "no location recorded", schema version 5. `WorkoutPause = { startedAt, endedAt }` (re-exported from `use-workout-session.ts`) is already persisted in `record.pauses`.
  - `src/hooks/use-location-route.ts` — appends a point only while `phase === 'running'`, every `LOCATION_SAMPLE_INTERVAL_MS` (5 s, `src/location/location-config.ts`), so **nothing in `route` marks a gap**: a pause or GPS outage shows up only as a larger timestamp delta between two consecutive points. Points carry no accuracy field, and the route is chronological by construction (append-only).
  - `src/components/session-summary.tsx` — has the `{/* course — route + altitude tickets insert here */}` marker between the stat row and the `sync` card, inside the `ScrollView`. Both modes already receive the full `record`, so `record.route` is available in `review` and `detail` with no caller change (`live-workout.tsx` builds the record with `location.route`; `session/[id].tsx` loads it).
  - `src/components/ui/summary-card.tsx` — shared card chrome (`label`, `trailing`, `children`, `testID`).
  - `docs/specs/session-summary-information-architecture/SPEC.md` (#65) — fixes the slot, the collapse rule (section returns `null`, gap closes), the "usable threshold is owned by the section's ticket, and the answer is boolean" rule, and that the route card is a **fixed-height, non-interactive card with map gestures disabled** so it doesn't fight the parent scroll. Contract for a new section: own file under `src/components/`, wrapped in `SummaryCard`, strings under `sessionSummary.<slot>.*`, a `session-summary.test.tsx` case for a record without the data, and no edits to ordering/footer/other sections.
  - `react-native-maps` 1.27.2 (`package.json`) exposes `MapView` (`region`/`initialRegion`, `scrollEnabled`, `zoomEnabled`, `rotateEnabled`, `pitchEnabled`, `toolbarEnabled`, `liteMode`, `customMapStyle`, `mapPadding`), `Polyline`, `Marker` (`node_modules/react-native-maps/src/MapView.tsx`). `__mocks__/` has no `react-native-maps` mock.
  - Theme: dark-only; `primary` `#F5C518` (~1.6:1 on white), `success` `#3ECF8E`. Tokens come from `src/constants/theme.ts` via `useTheme()`. `DESIGN.md` has no map component spec.
- **User impact:** A recorded outdoor session shows where the user went. Sessions without a route look exactly as they do today.
- **Dependencies:** `session-summary-information-architecture` (slot, `SummaryCard`), `foreground-location-gps-sampling` (`route`, `LOCATION_SAMPLE_INTERVAL_MS`), `maps-setup` (`react-native-maps`, key). **Unconfirmed:** the Maps Demo Key's coverage of Maps SDK for Android was never settled by a rendered tile (`maps-setup` Step 2/7), so this ticket's device check is also the first real proof tiles render. No new package, no `app.json`/`app.config.ts` change.

### Design decision: break the polyline at gaps, don't bridge

The polyline is drawn as **multiple segments**, split wherever two consecutive points are not a continuous stretch of movement. A bridge would assert the user travelled a straight line through territory the route never recorded (a pause at a café two blocks away, a tunnel, a GPS outage), and it would inflate any later distance figure. A visible break is the honest rendering: "no data here." Two split rules, either of which breaks:

1. **Pause rule (exact):** a `record.pauses` interval overlaps the open interval between the two points — `pause.startedAt < next.timestamp && pause.endedAt > prev.timestamp`. This catches pauses of any length, including ones shorter than the time threshold. (A pause that has no points on either side of it breaks nothing.)
2. **Time-gap rule (heuristic):** `next.timestamp - prev.timestamp > ROUTE_GAP_THRESHOLD_MS`, covering GPS loss with no pause. Threshold = `4 × LOCATION_SAMPLE_INTERVAL_MS` = 20 s, defined in `src/location/location-config.ts` next to the interval so retuning the interval retunes the gap. Rationale: nominal spacing is 5 s; one or two late fixes (a slow cold fix, `Balanced` accuracy duty-cycling) must not fragment a healthy route, while ≥20 s (≥ ~4 missed fixes) is real loss. The value is a judgement call, not a measurement — flagged under Constraints.

Segments with fewer than 2 points draw no line (they can't) but their points still count for bounds and can be the start/end marker.

### Design decision: presence threshold is `route.length >= 2`

`isRouteUsable(route)` is true for 2+ points. Zero or one point collapses the whole section per the #65 rule (a single fix draws no path and says nothing a map pin would add; it's also the case most likely to be a momentary lock before GPS dropped). Two points is the minimum that draws a line, and must not crash the bounds calculation (issue criterion) — including two identical points (see `deriveRouteRegion`).

### Design decision: controlled region, not imperative `fitToCoordinates`

The map is given a computed `region` (center + padded deltas, with a minimum span) instead of calling `mapRef.fitToCoordinates` after `onMapReady`. Reasons: fully deterministic and unit-testable as a pure function; no ref/ready-timing race inside a ScrollView; handles the degenerate (identical/near-identical points) case with an explicit minimum span rather than depending on native behaviour for a zero-area bound. The map is non-interactive, so a controlled region never fights the user.

## Data Model

No persisted change: `WorkoutRecord`, `RoutePoint`, `WORKOUT_RECORD_SCHEMA_VERSION` (5), and migrations are untouched. All geometry is derived at render time from `record.route` and `record.pauses`.

New framework-free types (in `src/workout/route-geometry.ts`):

```ts
export type RouteSegment = RoutePoint[]; // consecutive points with no gap between them; length >= 1

export type RouteRegion = {
  latitude: number; // centre
  longitude: number; // centre
  latitudeDelta: number; // > 0, >= MIN_REGION_DELTA
  longitudeDelta: number; // > 0, >= MIN_REGION_DELTA
};
```

Invariants: segments partition `route` in order (concatenating them yields the input array); the start marker is `segments[0][0]` and the end marker is the last point of the last segment, so they always coincide with the true first/last fix.

## Interfaces / API

### `src/workout/route-geometry.ts` (new, pure — no React/maps/i18n imports; mirrors `workout-record.ts`'s "framework-free" layer)

```ts
export const ROUTE_MIN_POINTS = 2;
export const MIN_REGION_DELTA = 0.002; // degrees ≈ 220 m latitude: floor so a stationary/2-identical-point route still frames a street, not a point
export const REGION_PADDING_FACTOR = 1.3; // route bbox × 1.3 so the line and markers never touch the card edge

export function isRouteUsable(route: RoutePoint[]): boolean;
// route.length >= ROUTE_MIN_POINTS.

export function splitRouteIntoSegments(
  route: RoutePoint[],
  pauses: WorkoutPause[],
  gapThresholdMs: number,
): RouteSegment[];
// [] for an empty route. Otherwise ≥1 segment. Splits between prev/next when
// either rule above fires. Does not sort or mutate its inputs. Never throws.

export function deriveRouteRegion(points: RoutePoint[]): RouteRegion | null;
// null for an empty array (caller never passes one past isRouteUsable).
// Centre = midpoint of the lat/lon bounding box. Delta = max((max-min) * REGION_PADDING_FACTOR, MIN_REGION_DELTA) per axis.
// 1 point, 2 identical points, or a perfectly straight N-S/E-W line (one axis has zero span) all resolve
// to a finite region with deltas ≥ MIN_REGION_DELTA — never 0, NaN or Infinity.
// Antimeridian crossing is not handled (see Constraints).
```

### `src/location/location-config.ts` (modified)

```ts
export const ROUTE_GAP_THRESHOLD_MS = 4 * LOCATION_SAMPLE_INTERVAL_MS;
```

### `src/components/route-map-card.tsx` (new)

```ts
export type RouteMapCardProps = {
  route: RoutePoint[];
  pauses: WorkoutPause[];
  testID?: string;
};
export function RouteMapCard(props: RouteMapCardProps): JSX.Element | null;
```

- Returns `null` when `!isRouteUsable(route)` — no `SummaryCard`, no `MapView` is created (so a pre-M3/indoor record never loads the native map view).
- Otherwise `<SummaryCard label={t('sessionSummary.course.route.label')} testID=…>` containing a fixed-height `MapView` (`height` a `StyleSheet` constant, 200; rounded to `theme.rounded.md`, `overflow: 'hidden'` so tiles clip to the card radius).
- `MapView` props: `region` from `deriveRouteRegion(route)`; `scrollEnabled`, `zoomEnabled`, `rotateEnabled`, `pitchEnabled` all `false`; `toolbarEnabled={false}`; map style per the dark-map decision in Constraints. The card exposes one `accessibilityLabel` (`sessionSummary.course.route.a11y`) — a map has no useful child a11y tree.
- One `Polyline` per segment with ≥ 2 points: `strokeColor={theme.colors.primary}`, `strokeWidth` 4, `lineJoin="round"`, `lineCap="round"`.
- Start marker: ring (hollow circle, `success` border, transparent fill). End marker: filled circle (`primary`, `onPrimary` border). Distinct by shape **and** colour, not colour alone. Rendered as `Marker` with a child `View`, `anchor={{ x: 0.5, y: 0.5 }}`, `tracksViewChanges={false}`. Sizes from existing `spacing`/numeric style constants in the file, colours from `useTheme()`.
- No state, no effects, no gesture handlers.

### `src/components/session-summary.tsx` (modified, additive)

Replace the `course` comment marker with `<RouteMapCard route={record.route} pauses={record.pauses} testID="session-summary-route" />`. `SessionSummaryProps` unchanged; callers unchanged. Nothing else in the file changes (#65 contract rule 3/4).

### Errors / compatibility

No throwing path: bad input degrades to "no card" or a minimum-span region. `route` absent on very old records is already normalised to `[]` by migrations (`workout-migrations.ts`, schema v5); this spec adds no migration. Non-finite coordinates are already rejected at ingestion (`use-location-route.ts`), so geometry does not re-validate.

## Files Created

| File                                                      | Purpose                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/specs/route-polyline-session-summary/SPEC.md`       | This spec.                                                                                                   |
| `src/workout/route-geometry.ts`                           | Pure presence check, gap segmentation, and bounds/region derivation.                                         |
| `src/workout/__tests__/route-geometry.test.ts`            | Unit tests for the above (edge cases below).                                                                 |
| `src/components/route-map-card.tsx`                       | The `course` route section: card, map, polylines, markers; collapses to `null`.                              |
| `src/components/__tests__/route-map-card.test.tsx`        | Component tests against the maps mock.                                                                       |
| `__mocks__/react-native-maps.tsx`                         | Jest mock rendering `MapView`/`Polyline`/`Marker` as plain `View`s that surface their props to queries.      |
| `src/constants/map-style.ts` _(only if approved — below)_ | Dark Google Maps style JSON built from theme tokens, so tiles sit on a dark app and `primary` stays legible. |

## Files Modified

| File                                                | Change                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/session-summary.tsx`                | Mount `RouteMapCard` in the `course` slot (replaces the marker comment only).                                                                              |
| `src/components/__tests__/session-summary.test.tsx` | Cases: usable route renders the card in both modes; empty / 1-point route renders nothing and leaves no empty container; card sits between stats and sync. |
| `src/location/location-config.ts`                   | Add `ROUTE_GAP_THRESHOLD_MS`.                                                                                                                              |
| `src/i18n/locales/en.json`                          | Add `sessionSummary.course.route.label` ("ROUTE") and `sessionSummary.course.route.a11y` (e.g. "Map of your route, starting and ending points marked").    |
| `DESIGN.md`                                         | Add a **Route map card** component spec (height, radius, polyline width/colour, start ring / end dot, gap-break rule, non-interactive). No new token.      |

## Implementation Steps

1. **Verify against the v57 docs** (per `AGENTS.md`): read `https://docs.expo.dev/versions/v57.0.0/sdk/map-view/` and record the supported `MapView`/`Polyline`/`Marker` props above, `customMapStyle` support on Android, and whether `liteMode` is worthwhile. If any prop differs, update this spec before coding.
2. **Settle the open decisions** under Constraints (dark map style; gap threshold) with the maintainer.
3. Add `ROUTE_GAP_THRESHOLD_MS` to `location-config.ts`.
4. Write `route-geometry.test.ts` first, then `route-geometry.ts`: empty route → `[]`/not usable; 1 point; 2 points; 2 identical points (finite region, deltas = `MIN_REGION_DELTA`); straight N-S line (zero longitude span); pause overlapping a gap between points splits; pause with no points around it does not split; short pause (<20 s) still splits; time gap > threshold splits; gap exactly equal to threshold does not; multiple gaps → N+1 segments; concatenated segments equal input; inputs not mutated.
5. Add the `__mocks__/react-native-maps.tsx` mock.
6. Add `en.json` keys, then `route-map-card.test.tsx` and `route-map-card.tsx`: null for `[]` and 1 point; two segments → two `Polyline`s; a segment of one point draws no `Polyline`; start and end markers present and distinct; map gesture props all `false`; region matches `deriveRouteRegion`.
7. Mount in `session-summary.tsx`; extend `session-summary.test.tsx` per Files Modified (assert no route testIDs and no extra `SummaryCard` for empty/1-point routes, in both modes).
8. Add the Route map card spec to `DESIGN.md`.
9. Validate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`.
10. **Manual (maintainer, device dev build; cannot be done by the agent):** record a real outdoor walk/run → recognisable path, start ring/end dot visible; pause mid-walk and move before resuming → visible break, no straight chord; switch GPS off for >20 s → break; a saved indoor session and a pre-M3 session → no map, no empty card; confirm tiles render with the demo key (closes the `maps-setup` coverage question).

## Style & Conventions

- `CLAUDE.md`: spec before code; additive diff on the working `session-summary.tsx` (one line replaced, nothing tidied); kebab-case component filenames, PascalCase names; composed section lives directly under `src/components/`; consume `SummaryCard`, don't re-declare card chrome (#65 contract).
- Styling is `StyleSheet.create` fed from `useTheme()`/`constants/theme.ts`; no hardcoded colour or spacing in the component. Dark-only: no `useColorScheme` branches.
- Every user-facing string, including the accessibility label, is in `en.json` under `sessionSummary.course.*`.
- Pure logic lives in a framework-free module (like `workout-record.ts`, `pairing-types.ts`); the component stays presentational. React Compiler is on: no manual `useMemo`; derive geometry inline.
- Tests: `@testing-library/react-native` with `await render(...)`, colocated `__tests__/`, `jest-expo` preset.
- **Deliberate deviations to approve:** (1) `__mocks__/react-native-maps.tsx` and (optionally) `src/constants/map-style.ts` are new shared structure — flagged rather than assumed per `CLAUDE.md`; (2) adding a `DESIGN.md` component spec, which `CLAUDE.md` requires before any new visual element.

## Acceptance Criteria

- [ ] A real outdoor session recorded on a device shows a recognisable path with the start ring and end dot, framed with margin inside the card (manual, Step 10).
- [ ] Records with `route: []` (pre-M3, indoor, denied/unavailable GPS) and with exactly 1 point render no route card, no `MapView`, and no extra gap, in both `review` and `detail` modes (`session-summary.test.tsx`).
- [ ] `deriveRouteRegion` returns finite, positive deltas ≥ `MIN_REGION_DELTA` for 1 point, 2 identical points, and a zero-span axis; `RouteMapCard` with 2 points renders without throwing (`route-geometry.test.ts`, `route-map-card.test.tsx`).
- [ ] A route with a pause between two points, and a route with a >20 s timestamp gap, each render as separate `Polyline`s with no segment spanning the gap; a gap exactly at the threshold does not split (`route-geometry.test.ts`, `route-map-card.test.tsx`; visual confirmation in Step 10).
- [ ] Map gestures are disabled and the card stays a fixed height inside the scroll; the pinned footer and existing `testID`s are unchanged.
- [ ] Section order and every other section are unchanged (existing `session-summary.test.tsx` cases pass unmodified).
- [ ] No hardcoded colour/string in `route-map-card.tsx`; `DESIGN.md` documents the card.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm format:check` pass.

## Constraints

- **Non-goals:** altitude profile / ascent / descent (separate `course` ticket); distance, pace or per-km splits; a fullscreen/interactive map or tap target; route simplification/smoothing/decimation (a 3 h session ≈ 2,200 points, fine for `Polyline`); filtering noisy fixes (points store no accuracy); a pause-marker or "GPS lost here" annotation on the map; antimeridian-crossing routes; iOS map key/verification (Android-only builds per `CLAUDE.md`); any change to the recording hook, record schema, or migrations.
- **Needs maintainer decision (blocks Step 6):** map tile style. The default light Google tiles put a `primary` (`#F5C518`, ~1.6:1 on white) polyline on a light surface inside a dark-only app, which is both ugly and low-contrast. Recommended: a dark `customMapStyle` built from theme tokens in `src/constants/map-style.ts` (+ a `DESIGN.md` note). Alternative: default tiles with a darker/outlined polyline, which needs a new colour token — and a token must exist in `DESIGN.md` first. This is theme-adjacent shared structure, so it is not assumed here.
- **Judgement call to confirm:** 20 s gap threshold (`4 ×` the sample interval). If real device recordings show healthy routes fragmenting or visible chords surviving, retune the one multiplier.
- **Unverified (Step 1):** v57 `react-native-maps` prop behaviour on Android, `customMapStyle` on Android with the demo key, `liteMode` (cheaper static map, but verify it still draws overlays and respects the dark style before adopting).
- **Unconfirmed external fact:** the Maps Demo Key may not cover Maps SDK for Android or may hit daily caps; a blank/watermarked map is then a key problem, not a bug in this feature (see `maps-setup`).
- `react-native-maps` is a native module: needs the dev-client/EAS build, not Expo Go; Jest uses the mock. Adding this import changes no native config, so it should not alter the `fingerprint` runtime version and can ship OTA — confirm with `@expo/fingerprint` if in doubt.
