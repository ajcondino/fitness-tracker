# Feature: Session Summary Information Architecture

## Intent

The session summary screen has one fixed, documented section order — header,
hero, effort, course, sync, footer — scrolling as a single column with its
Save/Discard or Back/Done controls pinned below the scroll, where every
section owns its own container and renders nothing when its data is absent,
so that a pre-M3 session, an indoor session, and a fully-populated M3 session
each read as a complete screen, and each later M3 ticket (calories, route,
altitude) drops its block into a named slot instead of renegotiating the
layout.

## Context

- **Problem statement:** [GitHub issue #65](https://github.com/ajcondino/fitness-tracker/issues/65)
  (milestone "Milestone 3: Optional Stretch"). By the end of M3 the summary
  holds activity type, duration, avg/max HR, the HR trace, calories with a
  method label, a route map, an altitude profile, ascent/descent, and the
  Health Connect sync status. Each arrives in its own ticket and none owns
  the whole, so without a decision the screen grows by appending blocks to
  the bottom. Two things in today's code make that worse than a taste issue:
  - `SessionSummary` (`src/components/session-summary.tsx`) is a plain
    `flex: 1` `View` column (`styles.container`, `gap: spacing.lg`) with **no
    `ScrollView`**, and the action row uses `marginTop: 'auto'`
    (`styles.actionRow`) to sit at the bottom of the remaining space. Today's
    five blocks (status row, hero, trace card, stat row, optional write-status
    card) fit a phone. Adding calories, a map and an altitude profile will
    push the Save/Discard row off-screen, and nothing in the file can scroll
    to recover it.
  - Section chrome is copy-pasted per block: `traceCard` and `writeStatusCard`
    each hand-write the same `surface`/`outline`/`rounded.lg`/`padding: lg`
    card, and each future block would write a third and fourth copy.
- **Current code:**
  - `src/components/session-summary.tsx` — the one component rendering both
    `mode="review"` (just-ended, unsaved; Save/Discard) and `mode="detail"`
    (saved; Back/Done, Health Connect write-status card + sync action). Its
    current top-to-bottom order is: status row (`SESSION COMPLETE`/`SAVED
SESSION` flag + date/time) → hero (`deriveSessionTitle` title +
    `displayLg` duration) → heart-rate trace card → avg/max BPM stat row →
    [detail only] write-status card → action row. Per-record derivation
    (`deriveWorkoutSummary`, `bucketHeartRateSamples`, `describeSessionTime`)
    happens inside the component.
  - `src/workout/session-title.ts` — `deriveSessionTitle(timeOfDay,
activityType, t)` already handles `activityType === null` by falling back
    to the word "session" (`sessionSummary.title.activityFallback`), so a
    pre-M3 record's _title_ already reads as complete. Activity type is
    therefore folded into the hero title and has **no separate section** — it
    needs no slot.
  - `src/app/live-workout.tsx` (`:545-549`) mounts `<SessionSummary
mode="review" …/>` inside `styles.summaryContainer` (`flex: 1, zIndex: 1`)
    inside `<Screen>`; `src/app/session/[id].tsx` mounts `mode="detail"` inside
    `<Screen>` with `paddingBottom: spacing.xl + insets.bottom` on its
    container. In both, the ancestor chain is `flex: 1` down to
    `SessionSummary`, so a `ScrollView` filling the space above a pinned
    footer will get a bounded height with no change to either caller.
  - `src/components/ui/screen.tsx` — constrain-and-centre wrapper
    (`layout.contentMaxWidth`, 720px) — a plain `View` with no opinion on
    scrolling, per `docs/specs/tablet-layout/SPEC.md`. A `ScrollView` nested
    inside it is compatible.
  - `src/workout/workout-record.ts` — `WorkoutRecord` has `activityType`,
    `healthConnect`, `source`, `samples`, `pauses`, `device` but **no**
    `calories`, `route`, or `altitude` field yet (confirmed: only
    `activityType` landed from `session-activity-type`). The data shape for
    each is owned by its own ticket; this spec fixes only where its _view_
    goes and when it disappears.
  - `DESIGN.md` — Layout section: "Between groups, 24–34px… do not compress
    the between-group space to fit more content. **Add a scroll instead.**"
    This is the repo's own answer to the one-scroll-or-split question.
    Existing relevant tokens: `card-stat`, `card-stat-emphasis`,
    `readout-duration`, `rounded.lg`/`md`, `spacing.lg`/`md`/`sm`. No
    chart-card or section-card component spec exists.
  - Other M3 tickets (calories, route, altitude/ascent/descent) are **not
    open GitHub issues** at the time of writing (`list_issues` returns only
    #65 and an unrelated #2), so this spec names them by feature, not number.
- **User impact:** Today: none visible beyond (a) the Save/Discard or
  Back/Done row staying pinned at the bottom while the content above it
  scrolls when it overflows, and (b) no visual change on a phone where
  everything already fits. For maintainers: a written placement table and
  collapse rules mean each M3 ticket is "add one section component in slot
  N," not a layout negotiation.
- **Dependencies:** Builds on `session-summary`, `heart-rate-trace-graph`,
  `session-activity-type`, `health-connect-workout-sync` (all landed) and
  `tablet-layout` (`<Screen>`). Forward-compatible with, but not blocked on,
  the unwritten calories, route and altitude tickets. No new package.

### Design decision: one scroll, not a split

Everything stays on **one vertical scroll**. A route/altitude section that
expands into its own screen or sheet was considered and rejected for M3:

- `DESIGN.md` states the repo's rule directly: when content grows, "add a
  scroll instead." The app has no modal, sheet, or nested-route precedent for
  drill-in detail screens, and adding one is cross-cutting structure
  (`CLAUDE.md`: shared navigation structure is decided by hand).
- Splitting would turn the summary into a hub, hiding the HR trace — the
  screen's primary object — behind navigation. The summary is a read-once
  recap, not a place users return to explore.
- The route map is a **fixed-height, non-interactive card** (map gestures
  disabled so they don't fight the parent scroll). If M3 route work later
  needs a fullscreen map, that is a _separate_ ticket that adds a tap target
  on the card — it does not change this layout, because the card's slot,
  height and collapse rule stay as specified here.

### Design decision: pinned footer, scrolling body

The footer (review: Discard/Save + disabled hint; detail: Back/Done) is
pinned **outside** the `ScrollView`; everything else scrolls. Without this,
Save — the one action that matters in review mode, and the one action whose
loss is data loss — is below the fold on a fully-populated screen. In detail
mode the same pinning is applied for consistency rather than leaving two
different footer behaviors in one component. This is a (small) behavior change
for detail mode's footer on screens tall enough to scroll; on screens where
everything fits, the pinned footer sits exactly where `marginTop: 'auto'`
put it before.

### Target layout (fully-populated M3 session)

Top to bottom. "Slot" is the stable name later tickets cite.

| #   | Slot     | Contents                                                                                    | Owner / status                                                                   | Present when                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `header` | Status flag (`SESSION COMPLETE` / `SAVED SESSION`) + date/time                              | existing                                                                         | always                                                                                          |
| 2   | `hero`   | Title (time-of-day + activity type, or "session" fallback) + duration readout               | existing; activity type folded in by `session-activity-type`                     | always                                                                                          |
| 3   | `effort` | HR trace card, then the stat row: Avg BPM, Max BPM, **+ Calories card (with method label)** | trace + BPM existing; calories added by the calories ticket as a third stat card | trace + BPM: always. Calories card: only when the record has a calories value                   |
| 4   | `course` | **Route map card**, then **Altitude profile card + ascent/descent stat row**                | added by the route ticket and the altitude ticket respectively                   | Route card: only when the record has a usable route. Altitude: only when it has usable altitude |
| 5   | `sync`   | Health Connect write-status card (+ sync action)                                            | existing (`detail` mode only)                                                    | `mode === 'detail'`                                                                             |
| —   | `footer` | Review: Discard/Save (+ disabled hint). Detail: Back/Done                                   | existing; pinned outside the scroll                                              | always (mode-specific)                                                                          |

Ordering rationale: `effort` (what your body did) precedes `course` (where
you went) because HR is the one datum every session has; `course` is the
optional layer. `sync` is administrative, not workout content, so it sits
last before the footer. The stat row is a single row of 2–3 equal-width cards
(`flex: 1`, 10px gap, per `DESIGN.md`), so adding Calories makes the row
three-up rather than adding a row.

The sketch below is illustrative of structure, not a pixel spec:

```
┌──────────────────────────────┐
│ SAVED SESSION      AUG 19 · 6│   header
│ Evening run                  │   hero
│ 42:10  TOTAL TIME            │
│ ┌──────────────────────────┐ │
│ │ HEART RATE           bpm │ │   effort
│ │ ▁▂▃▅▆▇▇▆▅▃               │ │
│ └──────────────────────────┘ │
│ [AVG 148] [MAX 171] [KCAL ·  │
│                      est.]   │
│ ┌──────────────────────────┐ │
│ │        route map         │ │   course  (absent: indoor / pre-M3)
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │   altitude profile       │ │
│ └──────────────────────────┘ │
│ [ASCENT 120m] [DESCENT 118m] │
│ ┌──────────────────────────┐ │
│ │ ● Saved to Health Connect│ │   sync (detail only)
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ [‹ BACK]        [   DONE   ] │   footer (pinned)
└──────────────────────────────┘
```

### Collapse rules for absent data

One mechanism, applied uniformly: **a section renders `null` — not an empty
card, not a placeholder — when its data is absent, and the column's `gap`
closes over it** (a `null` child produces no flex item, so no extra gap).
Concretely:

- **Pre-M3 session** (`activityType: null`, no calories/route/altitude,
  `healthConnect` any status): `header`, `hero` (title reads "Evening
  session" via the existing fallback), `effort` with its two stat cards,
  [`sync` if detail]. No calories card, no `course`. Reads as the screen it
  is today.
- **Indoor session** (has `activityType`, has calories, no route/altitude):
  as above plus a third stat card in `effort`. `course` absent in full.
- **Outdoor, fully populated:** every slot present.
- **Calories absent** ⇒ the stat row is two cards, each `flex: 1`. The row
  never contains a placeholder or `--` card for a missing _optional_ metric.
  (Avg/Max BPM's existing `--` for a zero-sample **review** session is
  unchanged: it is a defined state of a mandatory metric, and that session
  cannot be saved.)
- **Route and altitude are independent.** Route-only (altitude absent) and
  altitude-only (route absent) are both valid. Ascent/descent live _inside_
  the altitude block and vanish with it: they are never shown without a
  profile.
- **A section whose data is present but below its own ticket's "usable"
  threshold** (e.g. a one-point route, an altitude series too short to
  compute ascent) is _absent_ for this purpose. The threshold itself is owned
  by that section's ticket; this spec fixes only that the answer is
  boolean — present, or absent in full — never "present but empty."
- **Detail vs review:** `sync` is `detail`-only today and stays so. Review
  mode never shows sync status because nothing has been written yet.

### Contract for later tickets

A later M3 ticket adding a section must:

1. Add **one** section component (its own file, `src/components/`, kebab-case),
   taking the `WorkoutRecord` field(s) it needs or already-derived props, and
   returning `null` when its data is absent.
2. Wrap its content in `SummaryCard` (introduced here) rather than
   re-declaring card chrome.
3. Be inserted in its slot's position in `SessionSummary`'s body, per the
   table above, behind its own presence check — no other file in
   `session-summary.tsx` changes.
4. Add its own strings under `sessionSummary.<slot>.*` in `en.json` and its
   own tests; it must **not** edit the section order, the footer, or another
   section.
5. Add a case to `session-summary.test.tsx` proving a record _without_ its
   data still renders with no empty container.

If a ticket needs something the table doesn't cover (a ninth data type, a
reorder), that is a change to _this_ spec, not a local decision.

## Data Model

N/A — no new or changed persisted type. `WorkoutRecord`, `WorkoutSummary`,
`deriveWorkoutSummary`, and the stored schema (`WORKOUT_RECORD_SCHEMA_VERSION`)
are untouched. `calories`, `route`, `altitude` fields and any migration
belong to their own tickets.

The one new _UI-level_ contract:

```ts
// src/components/ui/summary-card.tsx
export type SummaryCardProps = {
  label?: string; // label-caps / onSurfaceDim header, left. Omitted = no header row.
  trailing?: string; // label-caps / onSurfaceDim, right of the header (e.g. "bpm"). Ignored when label is omitted.
  children: ReactNode;
  testID?: string;
};
```

**Invariants:**

- `SessionSummary` never renders a `SummaryCard` whose children are
  absent — the _section_ decides presence before the card is created.
  `SummaryCard` itself has no empty-state logic.
- Section order in `SessionSummary` is the table above; it is fixed in code
  order, not data-driven.

## Interfaces / API

### `src/components/ui/summary-card.tsx` (new)

```ts
export function SummaryCard(props: SummaryCardProps): JSX.Element;
```

Presentational only (no `useTranslation`, no data). Renders a `View` with
the card chrome currently duplicated in `traceCard`/`writeStatusCard`:
`backgroundColor: theme.colors.surface`, `borderColor: theme.colors.outline`,
`borderWidth: 1`, `borderRadius: theme.rounded.lg`, `padding: spacing.lg`,
`gap: spacing.sm`; an optional header row (`labelCaps`/`onSurfaceDim`, label
left, `trailing` right) when `label` is provided; then `children`. All values
resolve via `useTheme()` / `constants/theme.ts`; no new token.

### `src/components/session-summary.tsx` (modified)

`SessionSummaryProps` is **unchanged** — same `mode: 'review' | 'detail'`
union, same callbacks. Callers (`live-workout.tsx`, `session/[id].tsx`) do not
change.

Structure becomes:

```
<View style={container}>                 // flex: 1, unchanged
  <ScrollView style={flex 1} contentContainerStyle={gap: spacing.lg}>
    header        // existing statusRow
    hero          // existing heroBlock
    effort        // trace SummaryCard + stat row (existing blocks)
    {/* course  — route ticket + altitude ticket insert here */}
    sync          // existing write-status card, detail only
  </ScrollView>
  footer          // review: action row + hint. detail: action row. Outside the scroll.
</View>
```

- The trace card's existing hand-written chrome is replaced by
  `<SummaryCard label=… trailing=…>`; the write-status card's chrome likewise,
  with its own row layout preserved as `SummaryCard` children (no `label`).
  This is the only refactor of existing markup, justified under Style &
  Conventions.
- `testID`s are preserved exactly: `session-summary-hero-duration`,
  `session-summary-trace`, `session-summary-sync`, `session-summary-back`,
  `session-summary-done`, `live-workout-discard`, `live-workout-save`. New
  `testID`s for scroll (`session-summary-scroll`) and footer
  (`session-summary-footer`) are added for the tests below.
- A short comment block above the scroll body records the slot table's order
  and the "insert here" markers for `course`, pointing at this SPEC.
- `StyleSheet`: `actionRow` loses `marginTop: 'auto'` (the footer is no
  longer a flex-fill sibling); the footer wrapper gets `gap: spacing.md` and
  top padding equal to the scroll's `gap` so spacing is unchanged on short
  content. Existing values only.
- `ScrollView`: `showsVerticalScrollIndicator={false}` (matches dark, minimal
  chrome elsewhere), `contentContainerStyle` bottom padding `spacing.lg` so
  the last card never touches the footer.

### Compatibility behavior

- Short screens (everything fits): visually identical to today.
- Tall screens: content scrolls; footer stays visible.
- `deriveWorkoutSummary`, formatting helpers, and every prop of
  `SessionSummary`/`SessionRow` unchanged.

## Files Created

| File                                                | Purpose                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/components/ui/summary-card.tsx`                | Presentational card chrome (optional header row + children) shared by every summary section. |
| `src/components/ui/__tests__/summary-card.test.tsx` | Render tests: with/without `label`, `trailing` only shown with `label`, themed styling.      |

## Files Modified

| File                                                | Change                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/session-summary.tsx`                | Wrap body in `ScrollView`; pin footer outside it; reuse `SummaryCard` for trace + write-status; add the slot-order comment and `course` insertion marker. Props, `testID`s, derivation and copy unchanged.                                                    |
| `src/components/__tests__/session-summary.test.tsx` | Add: scroll container + pinned footer exist in both modes; pre-M3 fixture renders complete with no optional sections; stat row is exactly two cards without calories; existing assertions pass unmodified.                                                    |
| `DESIGN.md`                                         | Add a `card-summary` entry under Components (tokens it already uses) and a "Session summary" subsection under Layout recording the slot order and collapse rule, so the visual language's single source of truth carries it. No new color/type/spacing token. |

## Implementation Steps

1. Add the `card-summary` component entry and the "Session summary" slot-order /
   collapse-rule note to `DESIGN.md` (token additions must land there first;
   this adds none, only documents reuse).
2. Create `src/components/ui/summary-card.tsx` and its test, per
   Interfaces/API.
3. In `src/components/session-summary.tsx`, replace the trace card's and the
   write-status card's inline chrome with `SummaryCard`; run the existing
   `session-summary.test.tsx` — it must pass unmodified before continuing.
4. Wrap the header, hero, effort and sync blocks in a `ScrollView`; move the
   action row and disabled hint into a footer outside it; remove
   `marginTop: 'auto'`; add `session-summary-scroll` / `session-summary-footer`
   `testID`s and the slot-order comment with the `course` marker.
5. Extend `src/components/__tests__/session-summary.test.tsx` per Files
   Modified: pre-M3 completeness, scroll + pinned footer in both modes,
   two-card stat row.
6. Re-run `src/app/__tests__/live-workout.test.tsx` and
   `src/app/session/__tests__/[id].test.tsx` unmodified — neither caller
   changes, so both should pass as-is; fix `SessionSummary`, not the tests,
   if they don't.
7. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
8. Manually verify on a dev-client build (`pnpm android`): (a) an existing
   saved session opens from History as before; (b) stop a short workout and
   confirm Save/Discard are in the same place as before; (c) temporarily force
   a tall layout (e.g. device font scale at max) and confirm the body scrolls
   while the footer stays pinned; (d) a tablet-width window still centres via
   `<Screen>`.

## Style & Conventions

- **Spec before code, plan before diff** (`CLAUDE.md`): this document is the
  review gate; nothing under `src/` changes until it's approved.
- **Don't invent cross-cutting structure — deliberate, flagged exception.**
  `SummaryCard` is a new shared primitive. It's justified because this ticket
  _is_ the decision to share section chrome (the issue's "later tickets can
  add their section without renegotiating"), and two existing blocks already
  duplicate it. It lives in `src/components/ui/` per `CLAUDE.md`
  (primitive, presentation-only, kebab-case file, PascalCase name), mirrors
  `themed-view.tsx`'s thinness, and adds no theme token. Reviewer should
  confirm this is the shape wanted before implementation; the fallback is to
  skip the extraction and leave per-block chrome, at the cost of the
  placement contract in "Contract for later tickets" step 2.
- **Additive diffs on working screens** — the one departure: the trace and
  write-status cards' markup is replaced by `SummaryCard`, and the footer
  moves out of the scroll flow. Both are the _minimum_ needed to make the
  screen scrollable with a pinned footer, which is the ticket's explicit
  scope ("implement the structure now with the sections that already
  exist"); no copy, derivation, testID, prop or caller changes.
- **Theming**: `StyleSheet.create` fed from `constants/theme.ts` via
  `useTheme()`; no hardcoded color or spacing; no light-mode branches.
- **i18n**: no new user-facing string in this ticket. Future sections add
  `sessionSummary.<slot>.*` keys per the contract.
- **React Compiler**: no manual `useMemo`/`useCallback`.
- **Test conventions**: `@testing-library/react-native` v14+, `await
render(...)`, tests under `__tests__/` colocated with the code.
- **`SessionSummary` keeps its private formatters** (`formatDuration`,
  `formatDateTime`) per `session-summary`'s own convention — not touched.

## Acceptance Criteria

- [ ] `docs/specs/session-summary-information-architecture/SPEC.md` (this
      file) contains the fully-populated layout table, the collapse rules and
      the contract for later tickets, and the maintainer has approved it
      before route and altitude work starts.
- [ ] `SessionSummary` renders its body inside a `ScrollView`
      (`testID="session-summary-scroll"`) and its footer outside it
      (`testID="session-summary-footer"`), in both `review` and `detail`
      modes.
- [ ] In review mode, `live-workout-save` and `live-workout-discard` are
      descendants of the footer, not of the scroll; in detail mode,
      `session-summary-back` and `session-summary-done` are.
- [ ] A pre-M3 record (`activityType: null`, no calories/route/altitude)
      renders: the header, a hero title containing the "session" fallback, the
      trace card, exactly two stat cards (Avg BPM, Max BPM), and — in detail
      mode — the write-status card; and **no** other card or placeholder.
- [ ] No direct child of the scroll content is an empty container: every
      rendered section has visible text or a rendered trace/child (asserted in
      the pre-M3 test).
- [ ] The existing `session-summary.test.tsx`,
      `src/app/__tests__/live-workout.test.tsx` and
      `src/app/session/__tests__/[id].test.tsx` assertions pass without
      modification, except for added cases.
- [ ] `SummaryCard` renders a header row only when `label` is provided, and
      shows `trailing` only alongside `label`.
- [ ] `DESIGN.md` documents the `card-summary` component and the slot order /
      collapse rule, and introduces no new color, type or spacing token.
- [ ] `SessionSummaryProps`, `SessionRowProps`, and every caller of
      `SessionSummary` are unchanged.
- [ ] No new inline user-facing string in JSX.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Constraints

- **Scope**: structure and rules only. This ticket does **not** build the
  calories card, route map, altitude profile, or ascent/descent stats; does
  not add `calories`/`route`/`altitude` to `WorkoutRecord`; does not change
  the schema version; does not add any permission, map package, or chart
  dependency. The `course` slot is a comment marker, not a stub component —
  an empty placeholder would violate the collapse rule this spec sets.
- **No expand / drill-in.** The route map is a fixed-height, non-interactive
  card in M3. A fullscreen map is a separate future ticket (see the one-scroll
  decision).
- **Activity type has no slot of its own.** It is part of the hero title
  (existing `deriveSessionTitle` behavior).
- **Thresholds for "usable" route/altitude data** (minimum points, minimum
  ascent) are **unresolved here** and owned by the route and altitude tickets;
  this spec only requires the result be a boolean.
- **Method-label wording and placement inside the calories card**, ascent/
  descent unit formatting (metric/imperial via `units-preference`), and map
  provider are decided in their own tickets; the slot order, single stat row
  and collapse rule above are not.
- **Scroll + map gestures:** the route card must disable its own pan/zoom so
  it doesn't capture the parent scroll; to be verified when that ticket
  lands, not testable now.
- **Fixed-height chart/map cards and the `ScrollView`'s measured behavior at
  extreme font scales** are verified manually (step 8c), not by unit tests.
- Android only, per `CLAUDE.md` — no iOS-specific handling considered.
