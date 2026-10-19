# Feature: MET-Based Calorie Calculation

## Intent

Every saved or just-ended session whose activity type has a defined MET value and whose owner has a weight on record shows an estimated calorie figure — `MET × weight(kg) × active duration(hours)` — in the session summary's `effort` stat row and on its history row; every session where any input is missing, zero, or unknown shows no figure at all rather than a guessed one.

## Context

- **Problem statement:** [GitHub issue #71](https://github.com/ajcondino/fitness-tracker/issues/71) (milestone "Milestone 3: Optional Stretch"). The app records HR, duration and activity type, and stores body weight (`weight-capture-health-connect`), but nothing combines them. `weight-store.ts` already names calorie calculation as the downstream consumer of `getLatestWeightKg` ("The single read path for downstream consumers (calorie calculation)"), and `en.json` already tells users weight is "Used to estimate calories burned."
- **Current code (confirmed by inspection):**
  - `src/workout/workout-record.ts` — `WorkoutRecord.activityType: ActivityType | null` (`'run' | 'walk' | 'cycle' | 'strength' | 'other'`; `null` = recorded before the field existed). `deriveWorkoutSummary(record).durationMs` is **active duration**: last-sample time − `startedAt` − pauses (each clamped to that window), floored at 0, and `0` for a zero-sample record. This is the duration the summary hero and history rows already show, so calories reuse it rather than recomputing.
  - `src/weight/weight-store.ts` — `WeightEntry { id, recordedAt, kg, healthConnect }`; `loadWeightEntries()` returns entries sorted ascending by `recordedAt`; `kg` is canonical kilograms, validated `> 0` and finite on read. `src/hooks/use-weight.ts` exposes `entries: WeightEntry[] | undefined` (`undefined` = still loading) and `latestKg`.
  - `src/components/session-summary.tsx` — renders `SummaryCard`-based sections inside a `ScrollView`; the `effort` slot's stat row has two cards (Avg BPM, Max BPM, hand-written chrome in `styles.statCard`). `docs/specs/session-summary-information-architecture/SPEC.md` defines the slot: calories are **a third stat card in the `effort` stat row, with a method label, present only when the record has a calories value, absent (not `--`) otherwise**.
  - `src/components/session-row.tsx` — presentational row; every label arrives pre-formatted from the caller. Its meta line is `time · duration · avg`. Used by `src/app/(tabs)/index.tsx` and `src/app/(tabs)/history.tsx`, each deriving labels from `deriveWorkoutSummary(record)`.
  - No `calories` field exists on `WorkoutRecord`; `WORKOUT_RECORD_SCHEMA_VERSION` is `4`.
- **User impact:** Users with a weight on file see "~N KCAL (est.)" on new and old sessions of a known activity type, consistent with the duration shown beside it. Users with no weight, no activity type, or an `other` activity see no calorie UI at all — no empty card, no `--`. Maintainers get one pure module that the later HR-adjusted (Keytel) ticket can wrap or replace.
- **Dependencies:** `session-activity-type`, `weight-capture-health-connect`, `session-summary-information-architecture` (all landed). No new package, no permission, no migration.

### Design decisions

1. **Derive at render; do not persist.** Calories are computed from `activityType`, `deriveWorkoutSummary(...).durationMs` and a weight entry whenever a screen renders. No `calories` field on `WorkoutRecord`, no schema bump, no migration. The issue frames this as a "pure calculation module… same shape as the existing session stat derivations". Trade-off: if MET values are corrected later, old sessions update too — acceptable for an estimate.
2. **Which weight: the entry in effect at the session's start** — the latest `WeightEntry` with `recordedAt <= record.startedAt`. The issue says "the latest weight entry"; for a just-ended session the two are identical, but for history, "latest" would silently rewrite last month's calories every time the user logs a new weight. A session older than the user's first weight entry therefore gets **no estimate** (no earlier weight exists; using a later one would be a guess). **This departs from the issue's literal wording and needs maintainer confirmation** (fallback: use `entries.at(-1)` for every session — a one-line change in `pickWeightKg`).
3. **No weight ⇒ suppress, do not prompt.** The issue allows either. Suppression is the smaller change: the Home tab already hosts the weight prompt (`weight-prompt.tsx`) and Profile hosts `weight-section.tsx`; adding a third prompt surface inside a read-only summary is new cross-cutting UI.
4. **`other` activity ⇒ suppress.** There is no defensible single MET for "anything else"; picking one would be exactly the fabricated-looking number the issue forbids. `MET_BY_ACTIVITY.other = null`.
5. **`null` activity type (pre-`session-activity-type` records) ⇒ suppress.** Never infer a type.
6. **Zero active duration ⇒ suppress** (not "0 kcal"). A 0 would look like a real result.

## Data Model

No persisted change. `WorkoutRecord`, `WeightEntry`, schema version and storage keys are untouched.

New types, in `src/workout/calories.ts`:

```ts
export type MetTable = Record<ActivityType, number | null>;

export type CalorieInput = {
  activityType: ActivityType | null;
  weightKg: number | null;
  durationMs: number; // ACTIVE duration (pauses excluded), as from deriveWorkoutSummary
};
```

MET values (Compendium of Physical Activities, general/moderate-effort entries; **to be confirmed by the maintainer in review** because the app records no pace/speed to refine them):

| `ActivityType` | MET    | Basis                                             |
| -------------- | ------ | ------------------------------------------------- |
| `run`          | `9.8`  | Running, ~6 mph (10 min/mile)                     |
| `walk`         | `3.5`  | Walking, ~3.0 mph, firm surface                   |
| `cycle`        | `7.5`  | Bicycling, general / moderate                     |
| `strength`     | `3.5`  | Resistance (weight) training, light–moderate      |
| `other`        | `null` | No defensible single value → no estimate (see D4) |

**Invariants:** a MET is a finite number `> 0` or `null`; the module never returns `NaN`, `Infinity`, a negative, or `0`.

## Interfaces / API

All in `src/workout/calories.ts` — framework-free (no React, AsyncStorage, Zustand or BLE import; `WeightEntry`/`ActivityType`/`WorkoutRecord` are `import type` only), mirroring `workout-record.ts`'s "types and pure derivation only" layer.

```ts
export const MET_BY_ACTIVITY: MetTable;

/**
 * MET × kg × hours, rounded to the nearest whole kcal. Returns null — never 0,
 * NaN or a guess — when activityType is null or has a null MET, weightKg is
 * null/non-finite/<= 0, or durationMs is non-finite/<= 0.
 */
export function estimateCalories(input: CalorieInput): number | null;

/**
 * The most recent entry with recordedAt <= startedAt, else null.
 * `entries` is ascending by recordedAt (loadWeightEntries' contract); the
 * function does not re-sort. An entry recorded exactly at startedAt counts.
 */
export function pickWeightKg(entries: readonly WeightEntry[], startedAt: number): number | null;

/**
 * Composition used by the screens: active duration from deriveWorkoutSummary,
 * weight from pickWeightKg, then estimateCalories. Returns null while
 * `entries` is undefined (still loading) as well as for every suppress case.
 */
export function deriveSessionCalories(
  record: WorkoutRecord,
  entries: readonly WeightEntry[] | undefined,
): number | null;
```

- `estimateCalories` is the single seam the follow-up HR-adjusted ticket wraps or replaces; it takes plain inputs and has no optional parameters, flags or hooks for that future formula (per the issue's "do not build toward it").
- Rounding: `Math.round`. Hand-computed example: run, 70 kg, 1 h → 9.8 × 70 × 1 = **686**.
- Errors: none thrown; every invalid input yields `null`.

UI contracts:

- `SessionSummary` — props **unchanged**. It calls `useWeight()` itself and `deriveSessionCalories(record, entries)`; when the result is non-null, a third stat card is rendered after Max BPM in the existing `statRow` (`flex: 1`, equal width). When `null`, the row is exactly the current two cards. New `testID`: `session-summary-calories`.
- `SessionRow` — one new **optional** prop `caloriesLabel?: string` (pre-formatted by the caller, e.g. `"686 kcal"`). When provided, a fourth meta item (with the existing dot separator, `onSurfaceMuted`) follows avg BPM; when omitted the row is identical to today. Callers: `(tabs)/index.tsx` and `(tabs)/history.tsx` call `useWeight()` once per screen, then `deriveSessionCalories(record, entries)` per row, passing `caloriesLabel` only when non-null.
- Method label: the summary card's caption reads "EST." (i18n) beneath/next to the value so the number is read as an estimate; the history row uses "~" prefix via the same string family. Exact copy below.

i18n additions to `src/i18n/locales/en.json` (no inline literals):

| Key                                | Value              |
| ---------------------------------- | ------------------ |
| `sessionSummary.stats.calories`    | `"KCAL"`           |
| `sessionSummary.stats.caloriesEst` | `"EST."`           |
| `history.sessionRow.caloriesValue` | `"~{{kcal}} kcal"` |

## Files Created

| File                                     | Purpose                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/workout/calories.ts`                | MET table, `estimateCalories`, `pickWeightKg`, `deriveSessionCalories` — pure, no coupling.      |
| `src/workout/__tests__/calories.test.ts` | Unit tests: each MET against hand-computed values, edge cases, weight selection, pause handling. |

## Files Modified

| File                                                | Change                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/session-summary.tsx`                | Additive: `useWeight()` + `deriveSessionCalories`; conditional third stat card in the `effort` stat row. No restructure of surrounding code.                            |
| `src/components/session-row.tsx`                    | Additive: optional `caloriesLabel` prop and meta item.                                                                                                                  |
| `src/app/(tabs)/index.tsx`                          | Pass `caloriesLabel` to `SessionRow` (already imports `useWeight`; reuse its `entries`).                                                                                |
| `src/app/(tabs)/history.tsx`                        | Add `useWeight()`; pass `caloriesLabel` to `SessionRow`.                                                                                                                |
| `src/i18n/locales/en.json`                          | Add the three keys above.                                                                                                                                               |
| `src/components/__tests__/session-summary.test.tsx` | Add cases: calories card shown with weight+type; absent (and row is two cards) with no weight / `null` type / `other` / zero duration.                                  |
| `src/components/__tests__/session-row.test.tsx`     | Add cases: `caloriesLabel` rendered when given, nothing extra when omitted.                                                                                             |
| `DESIGN.md`                                         | Only if the third stat card needs a documented variant; it reuses `card-stat` tokens, so expected change is a one-line note under the summary slot table. No new token. |

## Implementation Steps

1. Write `src/workout/__tests__/calories.test.ts` first (hand-computed expectations, listed in Acceptance Criteria), then `src/workout/calories.ts` until green.
2. Add the three `en.json` keys.
3. Wire `SessionSummary`: call `useWeight()`, derive calories, render the third stat card only when non-null. Add summary tests; confirm the existing `session-summary.test.tsx` assertions pass unmodified (mock `@react-native-async-storage/async-storage` / `use-weight` as the Home tab tests already do).
4. Add `caloriesLabel` to `SessionRow` plus tests.
5. Pass `caloriesLabel` from `(tabs)/index.tsx` and `(tabs)/history.tsx`; re-run their existing screen tests unmodified, adding one case each (with and without weight).
6. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`.
7. Manual check on a dev-client build (`pnpm android`): (a) record a run with a weight on file → card + history figure agree; (b) pause mid-session → figure matches active duration, not wall-clock; (c) clear app data/weight → no card, no history figure, no layout gap; (d) an old record (`activityType: null`) shows none.

## Style & Conventions

- **Spec before code / plan before diff** (`CLAUDE.md`): this document is the review gate; nothing under `src/` changes until approved.
- **Don't invent cross-cutting structure:** no new shared component. The third stat card follows the contract in `session-summary-information-architecture` ("calories added as a third stat card"). The one deliberate extension of a shared component is the optional `SessionRow.caloriesLabel` prop — additive and backwards-compatible; flagged for review.
- **Additive diffs on working screens:** no restructuring or tidying of `session-summary.tsx`, `session-row.tsx` or the tab screens.
- **Pure-module convention:** same framework-free layer as `workout-record.ts`; `now`-style inputs are parameters, not read internally.
- **i18n:** every string via `t(...)`; keys namespaced by owning component per `en.json`.
- **Theming:** existing tokens only (`surface`, `outline`, `rounded.md`, `labelMicro`, `h3`); no hardcoded colour/spacing, no light-mode branches.
- **React Compiler:** no manual `useMemo`/`useCallback`.
- **Tests:** `@testing-library/react-native` v14+, `await render(...)`, colocated `__tests__/`; component file names kebab-case.
- **Deliberate deviation from the issue text:** weight-at-session-start instead of "latest weight" (Design decision 2).

## Acceptance Criteria

- [ ] `estimateCalories` returns the hand-computed value for each MET at 70 kg × 1 h: run `686`, walk `245`, cycle `525`, strength `245`; and for a non-integer case (e.g. run, 82.5 kg, 45 min = 9.8 × 82.5 × 0.75 = 606.375 → `606`).
- [ ] `estimateCalories` returns `null` for: `other`, `null` activity type, `weightKg` of `null`/`0`/negative/`NaN`, and `durationMs` of `0`/negative/`NaN`.
- [ ] A session with a pause yields calories from `deriveWorkoutSummary(...).durationMs` (e.g. 60 min wall-clock with a 15 min pause ⇒ computed on 0.75 h), asserted via `deriveSessionCalories`.
- [ ] `pickWeightKg` picks the latest entry at or before `startedAt`, returns `null` when all entries are later or the list is empty, and counts an entry recorded exactly at `startedAt`.
- [ ] `deriveSessionCalories` returns `null` when `entries` is `undefined` (loading), and for a zero-sample record.
- [ ] Session summary shows a `session-summary-calories` card with an "EST." label for a known type + weight + duration, and the stat row has exactly two cards otherwise (no weight, `null` type, `other`, zero duration) with no placeholder or `--`.
- [ ] A record with `activityType: null` never displays a calorie figure.
- [ ] History rows (Home and History tabs) show `~N kcal` only when the figure is non-null; otherwise the row renders identically to today.
- [ ] The figure on a session's summary equals the figure on its history row.
- [ ] `src/workout/calories.ts` imports no React, AsyncStorage or store module (type imports only).
- [ ] Existing `session-summary`, `session-row`, Home and History tests pass unmodified apart from added cases.
- [ ] No inline user-facing string literals in JSX.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Constraints

- **Out of scope:** the HR-adjusted (Keytel) correction — no hooks, flags or parameters for it; persisting calories on the record; schema/migration changes; weight prompts inside the summary; Health Connect calorie write-back; weekly/total calorie roll-ups; unit conversion (kcal only, independent of the units preference); Firestore sync of any calorie data.
- **Unresolved, needs maintainer sign-off:** (1) the MET values above, especially `strength` (3.5 vs 6.0 vigorous) and `run` (single pace-agnostic value); (2) weight-at-session-start vs literal "latest weight"; (3) suppressing `other` rather than assigning a generic MET; (4) final "EST."/"~" copy.
- **Known limitation:** MET × weight × time is a rough population-average estimate with no pace, grade or HR input; the "EST."/"~" labelling is the only accuracy signal shown.
- **Behavior note:** because calories are derived, editing the weight history can change which weight an older session resolves to (only if an entry is added dated before that session's start).
- Android only, per `CLAUDE.md`.
