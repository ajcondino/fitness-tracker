# Feature: Tablet layout — constrained content width

## Intent

On a tablet-width viewport, every screen's content constrains to a maximum
width and centres itself instead of stretching phone layouts edge to edge;
below that width, every screen renders exactly as it does today.

## Context

- **Problem statement:** Nothing in this codebase constrains content width.
  Every screen's outermost container is a `flex: 1` `ThemedView` with
  horizontal padding but no `maxWidth` (confirmed: no `maxWidth` anywhere in
  `src/app/**/*.tsx` or `src/components/**/*.tsx`, no `useWindowDimensions`
  reference anywhere in `src/`). Stretched to a tablet's width, this reads
  exactly as GitHub issue #59 describes: single-column content spanning the
  full display, cards wider than tall, long unbroken text lines.
- **Current code — the six screens and how each lays out its content today:**
  - **Home** (`src/app/(tabs)/index.tsx`) — a `ThemedView` (`styles.container`,
    `flex: 1, padding: spacing.xl`, :208-212) containing, in order, `<Glow>`
    (absolutely positioned, full width, no `zIndex`), then three direct
    children each carrying `zIndex: 1` to paint above `<Glow>` per its own
    stacking note (`topBar`, `greeting`, `content` — :97-203): see
    `glow.tsx`'s comment that an absolutely-positioned sibling with no
    `zIndex` wins the stacking tie against normal-flow siblings unless they
    opt in with `zIndex: 1`.
  - **Device Pairing** (`src/app/(tabs)/device.tsx`) — a `ThemedView`
    (`styles.container`, `flex: 1, paddingTop/paddingHorizontal, gap: 22`,
    :164-171) with no `<Glow>`. Its last child, `footerNote`, uses
    `marginTop: 'auto'` (:187-191) to sit at the bottom of the remaining
    flex space — this depends on an ancestor with `flex: 1` between it and
    the screen root.
  - **History** (`src/app/(tabs)/history.tsx`) — a `ThemedView`
    (`styles.container`, `flex: 1`, :200-207) with a header, an optional
    stats card, an empty-state message, and a `FlatList` inside a
    `flex: 1, overflow: 'hidden'` `listWrapper` (:244-247, :158-195).
  - **Profile** (`src/app/profile.tsx`) — a `ThemedView` (`styles.container`,
    `padding: spacing.xl, gap: spacing.xl`, :90-95) with a header row and
    three sections (`AccountSection`, `HealthConnectSection`, `UnitsSection`).
  - **Live Workout** (`src/app/live-workout.tsx`) — a `ThemedView`
    (`styles.container`, `flex: 1, padding: spacing.xl`, :529-533) containing
    `<Glow>` then several phase-conditional children, each independently
    carrying `zIndex: 1` for the same reason as Home (:546-654). Two
    `flex: 1` children (`readoutContainer`, `summaryContainer`) depend on an
    ancestor chain of `flex: 1` down to the screen root to size correctly.
    Also renders an early-return "no device" guard (:184-217) with its own
    `ThemedView` and no `<Glow>`.
  - **Session Summary** (`src/app/session/[id].tsx`) — a `ThemedView`
    (`styles.container`, `padding: spacing.xl, gap: spacing.md`, :107-112)
    with a loading (empty), not-found, or found (`<SessionSummary>`) body.
  - **None of the six currently wraps its content in a `ScrollView`** — each
    is a plain `View`/`ThemedView` tree, and History alone scrolls, via
    `FlatList`. The ticket's own Approach section says the wrapper "goes
    inside the ScrollView, around the content" — that assumes a `ScrollView`
    that doesn't exist on any of these screens today. This spec resolves the
    mismatch by making `<Screen>` a plain constrain-and-centre `View`
    wrapper with no opinion on scrolling: it wraps whatever content a
    screen already renders (a `View` tree, or a `FlatList` for History),
    unchanged. This preserves the two properties the ticket's own wording is
    actually after — scrolling behaviour and the full-bleed screen
    background are both untouched, because `<Screen>` sits inside each
    screen's existing `ThemedView`/background and controls width only.
  - **`src/components/tab-bar.tsx`** — the floating pill bar. `styles.bar`
    (:88-97) sets `left`/`right` to `theme.layout.tabBarHorizontalInset`
    (`spacing.xl`, 24px) on both edges, so today it always stretches to
    "window width − 48px" — exactly the "floating bar stretched edge to
    edge" look the ticket says looks wrong at tablet width. It is not nested
    inside any screen's content tree — it is `<Tabs>`'s own `tabBar` render
    prop (`src/app/(tabs)/_layout.tsx:10`), so it needs its own fix,
    independent of `<Screen>`.
  - **`src/app/_layout.tsx`** — root `SafeAreaView` → `ConnectivityBanner` →
    `Stack`. The connectivity banner is already full-width, above every
    screen's own container, and is untouched by this ticket — it matches the
    ticket's "the offline toast stays full-width" requirement as-is.
  - **`app.json:6`** sets `"orientation": "portrait"` at the top level —
    this locks the app to portrait on-device, native-side, regardless of any
    JS layout work. The ticket's acceptance criterion "Landscape orientation
    works on all screens without broken layout" cannot be met, or even
    tested on a real device, while this stays `"portrait"`. No
    `expo-screen-orientation` package or other orientation-related code
    exists anywhere in `src/` — this is the only place orientation is
    constrained.
  - **`DESIGN.md:694-695`** currently states: _"Portrait only, phone only
    (`supportsTablet: false`). There are no breakpoints; layouts flex within
    a single 24px-guttered column."_ This is now false once this ticket
    lands and needs updating — per `CLAUDE.md`, `DESIGN.md` is the single
    source of truth for visual language and any new token must exist there
    first, so the new `contentMaxWidth`/`tabBarMaxWidth` tokens and the
    breakpoint they imply are documented there as part of this change, not
    left only in `theme.ts`.
  - No component anywhere in `src/components/` uses a hardcoded pixel width
    or a percentage width tuned to a narrow viewport in a way that assumes
    phone width specifically: the two `width: '100%'` instances
    (`account-section.tsx:234`, `health-connect-section.tsx:235`) size a
    button to its own card's width, not the viewport, and stay correct
    inside a constrained `<Screen>`. `PulseRing` (`pulse-ring.tsx:140-146`)
    centres on its immediate parent's own centre point (`top: 50%, left:
50%` inside a `position: relative` parent), not the window — it stays
    correct once that parent sits inside a narrower, centred `<Screen>`.
    `Glow` measures its own parent's width via `onLayout` (`glow.tsx:34-37`)
    and is placed outside `<Screen>` (see Interfaces/API), so it keeps
    washing the full screen width, matching the ticket's "screen
    backgrounds stay full-bleed" rule for what is effectively background
    decoration, not content.
- **User impact:** On a tablet (or a phone rotated to a wide split-screen
  window) past 720px wide, every screen's content sits in a centred column
  up to 720px instead of stretching; the floating tab bar sits centred at a
  bounded width instead of stretching to the screen edges. Below 720px,
  including every phone in portrait, nothing changes. Rotating a tablet to
  landscape (currently impossible — the app is orientation-locked) now
  works and re-flows correctly.
- **Dependencies:** None new. Uses `useWindowDimensions` from `react-native`
  (already a direct dependency) — no new package. Depends on nothing landed
  since `feat/FIT-57-network-indicator` (the current branch tip).

## Data Model

N/A — this ticket adds no persisted state, store, or data type. The only
new "model" is two numeric layout tokens (see Interfaces/API's
`src/constants/theme.ts` entry) and a breakpoint boolean derived at render
time from `useWindowDimensions()`, held in no store.

## Interfaces / API

### `src/constants/theme.ts` (modified)

```ts
export const layout = {
  tabBarHeight: 64,
  tabBarHorizontalInset: spacing.xl,
  tabBarBottomOffset: spacing.lg,
  tabBarClearance: 104,
  contentMaxWidth: 720, // new
  tabBarMaxWidth: 400, // new — see Constraints' flagged design gap
} as const;
```

`contentMaxWidth` is the ticket's own stated `720px`. `tabBarMaxWidth` is
this spec's proposed value for "centre the tab bar at its natural width
rather than stretching it" (the ticket names no number) — **flagged for a
design pass**, per `CLAUDE.md`'s "shared components... are decided by hand;
if something shared is missing, say so rather than creating it," the same
posture `docs/specs/network-connectivity-indicator/SPEC.md` took for its own
unspecified banner treatment. 400px is derived from the bar's current
phone-width footprint (a ~390–430px-wide phone minus the existing 24px
insets on each side lands the bar around 340–380px today); 400px keeps it in
that same range rather than letting it grow toward `contentMaxWidth`, which
would badly over-space three tab items. Confirm or retune during
implementation.

### `src/components/ui/screen.tsx` (new, primitive)

```ts
export type ScreenProps = ViewProps;

export function Screen({ style, children, ...rest }: ScreenProps): React.JSX.Element;
```

- A presentation-only primitive under `src/components/ui/` (per `CLAUDE.md`'s
  `ui/` vs. feature-component split) — a plain `View`, not a `ThemedView`:
  it has no background of its own, so it never interferes with whatever
  `ThemedView` background a screen has already drawn around it.
- Reads `const { width } = useWindowDimensions()` — per the ticket's own
  "reads `useWindowDimensions()`, not a platform or device-type check"
  requirement — and derives `isConstrained = width > layout.contentMaxWidth`.
- Renders:
  ```tsx
  <View style={[styles.base, isConstrained && styles.constrained, style]} {...rest}>
    {children}
  </View>
  ```
  ```ts
  const styles = StyleSheet.create({
    base: { flex: 1, width: '100%' },
    constrained: { maxWidth: layout.contentMaxWidth, alignSelf: 'center' },
  });
  ```
- `flex: 1` on the base style is required, not incidental: Device Pairing's
  `footerNote` (`marginTop: 'auto'`) and Live Workout's `readoutContainer`/
  `summaryContainer` (both `flex: 1`) depend on an unbroken `flex: 1` chain
  from the screen root — inserting `<Screen>` as a new intermediate node
  without `flex: 1` would break that chain and collapse those layouts (see
  Context). `width: '100%'` combined with the conditional `maxWidth` is what
  makes the component a no-op below the breakpoint: at any window width at
  or below 720px, `isConstrained` is `false` and `<Screen>` renders exactly
  like the plain `View` each screen already has today.
- Note for implementation: `maxWidth: 720` alone (unconditionally, no branch)
  is CSS-equivalent here — Yoga already no-ops a `maxWidth` below the
  available width — but the explicit `useWindowDimensions()` branch is kept
  anyway because the ticket asks for it by name and because it makes the
  breakpoint a directly testable boolean rather than an implicit style
  computation (see Files Created's test).
- Accepts and forwards `style`/other `ViewProps` (merged after the base
  styles, matching `ThemedView`'s own `[baseStyle, style]` pattern) so a
  caller can still add e.g. `zIndex: 1` where needed (see below).

### Six screens (modified) — each wraps its existing content in `<Screen>`

In every case below, `<Screen>` is inserted as a new nesting level _inside_
the screen's existing outer `ThemedView` — the `ThemedView`'s own background
color, padding, and outer `flex: 1` are untouched, so the screen background
stays full-bleed and unaffected by the breakpoint, only the content nested
inside `<Screen>` constrains and centres.

- **`src/app/(tabs)/index.tsx`** — `<Glow>` stays a direct child of the
  outer `ThemedView`, unwrapped (full-bleed, per Context). `topBar`,
  `greeting`, and `content` (the three `zIndex: 1` siblings) move inside one
  `<Screen>`. `<Screen>` itself takes `zIndex: 1` (via its `style` prop) so
  the whole wrapped subtree — not each child individually — wins the
  stacking tie against `<Glow>`; the three children's own pre-existing
  `zIndex: 1` becomes redundant but is left as-is, since removing it is
  unrelated cleanup outside this ticket's diff per `CLAUDE.md`'s "additive
  diffs on working screens."
- **`src/app/(tabs)/device.tsx`** — the header block, `<ScanStatusBar>`, the
  nearby/previously-paired sections, and `footerNote` all move inside one
  `<Screen>` (no `<Glow>` on this screen, so no `zIndex` concern).
- **`src/app/(tabs)/history.tsx`** — the header row, the stats card, the
  empty-state message, and `listWrapper` (containing the `FlatList`) all
  move inside one `<Screen>`. The `FlatList` itself needs no change: it
  already renders at 100% of its parent's width, so once its parent
  (`listWrapper`, inside `<Screen>`) is capped at 720px and centred, every
  row centres with it.
- **`src/app/profile.tsx`** — the header row and the three sections
  (`AccountSection`, `HealthConnectSection`, `UnitsSection`) move inside one
  `<Screen>`.
- **`src/app/live-workout.tsx`** — `<Glow>` stays unwrapped (full-bleed,
  matching Home). Every other direct child of the main return — `titleRow`,
  the status line, `readoutContainer`, `traceContainer`, `statsRow`, every
  phase's `actionRow`, and `summaryContainer` — moves inside one `<Screen>`,
  which itself takes `zIndex: 1` (same reasoning as Home). The separate
  "no device" guard return (:184-217) also wraps its `guardContent` in
  `<Screen>` for consistency, even though its own `alignItems: 'center'`
  already centres its two lines of text — without a width cap, the
  `bodyMd` subtitle would still be free to run edge to edge on a tablet.
- **`src/app/session/[id].tsx`** — the not-found body (back button + text)
  and the found body (`<SessionSummary>`) both wrap in `<Screen>`. The
  loading (empty) return is left unwrapped — there is no content to
  constrain.

None of these six changes touches any prop, callback, or piece of state —
purely an added wrapping layer around already-rendered children, per
`CLAUDE.md`'s "additive diffs on working screens."

### `src/components/tab-bar.tsx` (modified)

```tsx
const { width } = useWindowDimensions();
const isWide = width > theme.layout.contentMaxWidth;
const barWidth = Math.min(width - theme.layout.tabBarHorizontalInset * 2, theme.layout.tabBarMaxWidth);

<ThemedView
  background="surfaceMuted"
  style={[
    styles.bar,
    isWide
      ? { width: barWidth, alignSelf: 'center', left: undefined, right: undefined }
      : { left: theme.layout.tabBarHorizontalInset, right: theme.layout.tabBarHorizontalInset },
    {
      bottom: insets.bottom + theme.layout.tabBarBottomOffset,
      height: theme.layout.tabBarHeight,
      borderRadius: theme.rounded.xl,
      borderColor: theme.colors.outline,
    },
  ]}
>
```

Below the breakpoint this is byte-for-byte the existing `left`/`right`
inset behaviour. At or above it, the bar switches from edge-pinned
(`left`/`right`) to a fixed, capped `width` centred via `alignSelf: 'center'`
— `position: 'absolute'` still applies (`styles.bar`, unchanged), so
`alignSelf: 'center'` centres it within its absolutely-positioned box per
Yoga's own handling of a centred absolute child with no `left`/`right` set.
`Math.min(...)` keeps the bar from ever exceeding the horizontal-inset
bound even on a viewport only slightly past 720px.

### `app.json` (modified)

```json
"orientation": "default"
```

Changed from `"portrait"`. Per Expo SDK 57's config schema, `"default"`
lets the OS/device rotate freely (respecting the device's own rotation
lock), which is what "landscape works" requires. This project builds
Android only (per `CLAUDE.md`) — no iOS-specific orientation override is
added or needed. Per this repo's own convention (`android/` is CNG-generated
and gitignored), this change alone does nothing until a `expo prebuild
--clean` regenerates the native project — see Implementation Steps.

### `DESIGN.md` (modified)

- **Layout** section: add a short "Content width" note stating the 720px
  breakpoint, that it's read via `useWindowDimensions()` (not a device-type
  check), and that it applies to all six screens via the shared `<Screen>`
  wrapper — mirroring how the existing Layout section already documents the
  tab bar's own insets as prose plus the YAML front matter.
- **Components > Tab bar** prose and its YAML front-matter block (:235-243):
  add the new `tabBarMaxWidth` value and a line describing the
  above-breakpoint centred-not-stretched behaviour.
- **Platform Notes** (:694-695): replace _"Portrait only, phone only
  (`supportsTablet: false`). There are no breakpoints; layouts flex within a
  single 24px-guttered column."_ with prose reflecting the new
  `orientation: "default"` / 720px-breakpoint reality (Android only, per
  `CLAUDE.md` — this doesn't claim iOS tablet support).

## Files Created

| File                                          | Purpose                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/screen.tsx`                | Shared constrain-and-centre content wrapper, per Interfaces/API.                                                                                                                                                                      |
| `src/components/ui/__tests__/screen.test.tsx` | Below/at/above-breakpoint style assertions; `style` prop passthrough.                                                                                                                                                                 |
| `src/components/__tests__/tab-bar.test.tsx`   | New — no test exists for this component today. Covers the width-capping/centring behaviour this ticket adds; does not attempt to backfill full coverage of pre-existing tab-switching behaviour, which is out of this ticket's scope. |

## Files Modified

| File                         | Change                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/constants/theme.ts`     | Add `layout.contentMaxWidth` and `layout.tabBarMaxWidth`, per Interfaces/API.                                           |
| `DESIGN.md`                  | Document the new tokens/breakpoint; update the now-false "no breakpoints, phone only" line, per Interfaces/API.         |
| `app.json`                   | `orientation`: `"portrait"` → `"default"`, per Interfaces/API.                                                          |
| `src/app/(tabs)/index.tsx`   | Wrap `topBar`/`greeting`/`content` in `<Screen>`, per Interfaces/API.                                                   |
| `src/app/(tabs)/device.tsx`  | Wrap the header block through `footerNote` in `<Screen>`, per Interfaces/API.                                           |
| `src/app/(tabs)/history.tsx` | Wrap the header through `listWrapper` in `<Screen>`, per Interfaces/API.                                                |
| `src/app/profile.tsx`        | Wrap the header and three sections in `<Screen>`, per Interfaces/API.                                                   |
| `src/app/live-workout.tsx`   | Wrap all non-`<Glow>` content (both the main return and the no-device guard) in `<Screen>`, per Interfaces/API.         |
| `src/app/session/[id].tsx`   | Wrap the not-found and found bodies in `<Screen>`, per Interfaces/API.                                                  |
| `src/components/tab-bar.tsx` | Cap and centre the bar's width above the breakpoint instead of stretching to the horizontal insets, per Interfaces/API. |

No existing test file requires a change: every screen/component test in
this repo queries by `testID`, never by structural position or snapshot
(confirmed — no `toMatchSnapshot`/`.parent` usage anywhere in
`src/**/__tests__`), so wrapping already-rendered children in a new,
otherwise-transparent `<Screen>` node doesn't move or rename anything a
test looks up.

## Implementation Steps

1. Add `contentMaxWidth`/`tabBarMaxWidth` to `src/constants/theme.ts`.
2. Create `src/components/ui/screen.tsx` and its test
   (`src/components/ui/__tests__/screen.test.tsx`): assert `isConstrained`
   is `false` (no `maxWidth`/`alignSelf` in the rendered `style`) at e.g.
   `width: 400` and `width: 720`, and `true` (both present) at e.g.
   `width: 721` and `width: 1024`; assert a passed-in `style` prop still
   applies. Mock `useWindowDimensions` per test case, e.g.
   `jest.mock('react-native', () => ({ ...jest.requireActual('react-native'), useWindowDimensions: jest.fn() }))`
   with `jest.mocked(useWindowDimensions).mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 })`
   — this repo's existing precedent for mocking a single hook out of an
   otherwise-real module is `live-workout.test.tsx`'s
   `jest.mock('react-native-safe-area-context', () => ({...}))`.
3. Wrap each of the six screens' content in `<Screen>`, per Interfaces/API —
   one screen at a time, running that screen's own existing test file after
   each to confirm it still passes unchanged.
4. Update `src/components/tab-bar.tsx` per Interfaces/API; add
   `src/components/__tests__/tab-bar.test.tsx` covering the width-capping
   behaviour (render at a sub-breakpoint width and assert `left`/`right`
   insets; render above the breakpoint and assert the capped, centred
   `width`).
5. Change `app.json`'s `orientation` to `"default"`; run
   `npx expo prebuild --clean` to regenerate `android/` with the change
   (per this repo's CNG convention — `android/` is gitignored and must be
   regenerated, not hand-edited).
6. Update `DESIGN.md` per Interfaces/API.
7. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` and fix any failures.
8. Manual, on-device verification (not automatable from this spec, per
   `AGENTS.md`'s "read the versioned docs" caution and this ticket's own
   "judge it on a real tablet" notes):
   - Each of the six screens on a phone-width emulator/device: pixel-identical
     to before this change.
   - Each of the six screens on a tablet-width emulator/device (or a phone
     window resized past 720px in split-screen): content constrained and
     centred; no screen requires horizontal scrolling; no card reads
     abnormally wide or short.
   - Tab bar at tablet width: capped and centred, not stretched edge to edge.
   - Rotate a tablet to landscape on every one of the six screens: no
     broken layout, no unwanted scroll, `<Screen>`'s constraint still
     applies at the (now wider) landscape width.
   - Live Workout's BPM number at tablet width: per the ticket's own "judge
     it on a real tablet" note, decide whether `displayXl` (fixed 132px,
     per `src/constants/theme.ts`) should scale up — this is **not** a
     required deliverable of this ticket (absent from the issue's own
     Acceptance checklist); if a change is made, it needs a `DESIGN.md`
     token addition first, per `CLAUDE.md`, and should be scoped as a
     follow-up rather than folded into this diff unless trivial.

## Style & Conventions

- `screen.tsx` is kebab-case, exports `Screen` (PascalCase), lives under
  `src/components/ui/` as a presentation-only primitive — matches
  `themed-view.tsx`'s placement and its `[baseStyle, style]` prop-merging
  pattern, per `CLAUDE.md`.
- No hardcoded color or spacing literal — `Screen` introduces exactly two
  new numeric layout tokens, both added to `theme.ts` and documented in
  `DESIGN.md` first, per `CLAUDE.md`.
- Breakpoint logic reads `useWindowDimensions()`, never `Platform.OS` or a
  device-type heuristic, per the ticket's own explicit requirement.
- Every screen change is additive nesting only — no restructuring of
  existing styles, props, or logic, per `CLAUDE.md`'s "additive diffs on
  working screens."
- `render()` is async under `@testing-library/react-native` v14+; the new
  `screen.test.tsx` and `tab-bar.test.tsx` follow that pattern, per
  `CLAUDE.md`.
- Filed at `docs/specs/tablet-layout/SPEC.md`, matching this repo's
  established `docs/specs/<feature>/SPEC.md` convention (the same
  already-noted deviation from `CLAUDE.md`'s literal flat `docs/*.md` text).

## Acceptance Criteria

- [ ] Every one of the six screens (Home, Device Pairing, Live Workout,
      Session Summary, History, Profile) constrains its content to 720px
      and centres it once the viewport exceeds 720px wide — verified by
      `screen.test.tsx`'s breakpoint assertions plus manual on-device
      verification per Implementation Steps.
- [ ] Below 720px, every screen is visually and behaviourally unchanged —
      no existing screen test's assertions change, and manual phone-width
      verification shows no visible difference.
- [ ] Landscape orientation works on all six screens without broken layout
      or unwanted scrolling — requires `app.json`'s `orientation: "default"`
      change and a `expo prebuild --clean`; verified manually on a real or
      emulated tablet, per Implementation Steps (not automatable in Jest,
      which has no native rotation to simulate).
- [ ] The tab bar sits centred at a bounded width at tablet width, rather
      than stretching to the screen edges — verified by
      `tab-bar.test.tsx`'s above-breakpoint case plus manual verification.
- [ ] The 720px max width is defined in exactly one place
      (`theme.ts`'s `layout.contentMaxWidth`), consumed by `<Screen>` and
      `tab-bar.tsx` — not re-declared as a literal in any of the six screen
      files or elsewhere.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.

## Constraints

- **No multi-column layouts, split views, or tablet-specific navigation** —
  out of scope per the ticket; `<Screen>` only ever centres a single
  column, never reflows children into rows.
- **No change to any phone-width layout, prop, or behaviour** — every
  screen change is purely an added wrapping layer; enforced by every
  existing screen test continuing to pass unmodified.
- **No new content or feature on any screen** — out of scope per the ticket.
- **Web is out of scope**, per the ticket — `<Screen>`'s `useWindowDimensions`
  approach happens to work under `expo-router`'s web build too, but this
  ticket makes no claim about and does no verification of web behaviour,
  matching `CLAUDE.md`'s "web build exists, but Bluetooth requires the dev
  client" posture generally.
- **`layout.tabBarMaxWidth`'s numeric value (400) is this spec's proposal,
  not a confirmed design decision** — flagged in Interfaces/API for
  confirmation during implementation, the same posture
  `network-connectivity-indicator/SPEC.md` took for its own unspecified
  arrangement.
- **The Live Workout BPM readout's tablet-width sizing is a judgment call
  the ticket explicitly defers to a real device, not a required deliverable
  of this ticket** — see Implementation Steps.
- **`app.json`'s `orientation: "default"` change requires `expo prebuild
--clean`** to take effect in the gitignored `android/` project — this is
  a necessary, in-scope step of this ticket (the landscape acceptance
  criterion cannot be met without it), not an optional follow-up.
- Android only, per `CLAUDE.md` — this ticket does not attempt or verify iOS
  tablet/orientation behaviour (iOS isn't built in this project at all).
