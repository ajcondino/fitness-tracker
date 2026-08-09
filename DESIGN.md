---
version: alpha
name: Pulse
description: >
  Dark-only heart-rate training app. Instrument-panel restraint with a single
  high-voltage yellow reserved for live data and the one action that matters.

colors:
  # Accent — the only chromatic color in the product
  primary: '#F5C518'
  on-primary: '#141414'
  primary-dim: '#8A7A20'
  primary-wash: '#4A4326'

  # Ground
  background: '#0F0F10'
  background-deep: '#0A0A0B'
  surface: '#141415'
  surface-raised: '#191919'
  surface-muted: '#151516'
  surface-track: '#1B1B1C'
  surface-track-idle: '#262627'

  # Outlines — the primary tool for separating surfaces
  outline: '#242424'
  outline-soft: '#282828'
  outline-strong: '#333333'
  outline-emphasis: '#3E3E40'

  # Ink ramp
  on-surface: '#F2F3F5'
  on-surface-soft: '#E4E7EA'
  on-surface-chip: '#BCBCBE'
  on-surface-muted: '#8A9099'
  on-surface-faint: '#6E747D'
  on-surface-dim: '#5C626B'
  on-surface-ghost: '#4A5057'

  # Status
  success: '#3ECF8E'
  success-outline: '#2E5C45'
  danger: '#FF5A52'

typography:
  display-xl: # live BPM readout — one per app
    fontFamily: Archivo
    fontSize: 132px
    fontWeight: 800
    lineHeight: 138px
    letterSpacing: -6px
  display-lg: # session duration on Summary
    fontFamily: Archivo
    fontSize: 56px
    fontWeight: 800
    lineHeight: 60px
    letterSpacing: -2px
  h1:
    fontFamily: Archivo
    fontSize: 34px
    fontWeight: 800
    lineHeight: 38px
    letterSpacing: -0.8px
  h2:
    fontFamily: Archivo
    fontSize: 32px
    fontWeight: 800
    lineHeight: 36px
    letterSpacing: -0.7px
  h3:
    fontFamily: Archivo
    fontSize: 26px
    fontWeight: 800
    letterSpacing: -0.6px
  stat-md: # History summary figures
    fontFamily: Archivo
    fontSize: 22px
    fontWeight: 800
    letterSpacing: -0.5px
  stat-sm: # day number in a session row
    fontFamily: Archivo
    fontSize: 20px
    fontWeight: 800
  title-md:
    fontFamily: Archivo
    fontSize: 17px
    fontWeight: 700
  title-sm:
    fontFamily: Archivo
    fontSize: 15px
    fontWeight: 700
  body-md:
    fontFamily: Archivo
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
  body-sm:
    fontFamily: Archivo
    fontSize: 14px
    fontWeight: 400
  caption:
    fontFamily: Archivo
    fontSize: 12px
    fontWeight: 400
    lineHeight: 19px
  action-lg: # primary button / hero CTA
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: 700
    letterSpacing: 2.4px
  action-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 700
    letterSpacing: 2.2px
  action-sm: # ghost / secondary button
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 700
    letterSpacing: 1.4px
  data-md: # durations, bpm, RSSI — anything numeric inline
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 400
  label-caps: # section headers: RECENT, SEE ALL
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 400
    letterSpacing: 2px
  label-micro: # stat card captions
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: 400
    letterSpacing: 1.6px
  wordmark:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    letterSpacing: 3.4px
  tab-label:
    fontFamily: JetBrains Mono
    fontSize: 9px
    fontWeight: 400
    letterSpacing: 1px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px

rounded:
  sm: 12px
  md: 16px
  lg: 18px
  xl: 22px
  full: 999px

components:
  screen:
    backgroundColor: '{colors.background}'
    padding: 24px
    tabBarClearance: 104px # bottom padding scrollable content on tabbed screens reserves, on top of the device's own safe-area bottom inset — see tab-bar
  wordmark:
    textColor: '{colors.primary}'
    typography: '{typography.wordmark}'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.action-md}'
    rounded: '{rounded.xl}'
    height: 60px
  button-primary-disabled:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.on-surface-muted}'
    typography: '{typography.action-md}'
    rounded: '{rounded.xl}'
    height: 60px
  button-hero: # full-width START WORKOUT on Home
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.action-lg}'
    rounded: '{rounded.xl}'
    height: 66px
  button-ghost:
    backgroundColor: '{colors.background}'
    textColor: '{colors.on-surface-muted}'
    typography: '{typography.action-sm}'
    rounded: '{rounded.lg}'
    height: 56px
    padding: 18px
  card-device: # connected-monitor card, Home
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.on-surface}'
    typography: '{typography.title-sm}'
    rounded: '{rounded.lg}'
    padding: 18px
  card-stat:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.h3}'
    rounded: '{rounded.md}'
    padding: 14px
  card-stat-emphasis:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.on-surface}'
    typography: '{typography.h3}'
    rounded: '{rounded.md}'
    padding: 14px
  row-session:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.title-sm}'
    rounded: '{rounded.md}'
    padding: 16px
  row-session-meta:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface-muted}'
    typography: '{typography.data-md}'
  chip-device: # device pill on Live, filter chips on History
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.on-surface-chip}'
    typography: '{typography.data-sm}'
    rounded: '{rounded.full}'
    padding: 12px
  tab-bar: # floating, JS-rendered — not a native tab bar; see Components > Tab bar
    backgroundColor: '{colors.surface-muted}'
    textColor: '{colors.on-surface-faint}'
    typography: '{typography.tab-label}'
    rounded: '{rounded.xl}'
    height: 64px
    horizontalInset: 24px # from each screen edge, matching the grid gutter
    bottomOffset: 16px # above the device's safe-area bottom inset — additive, not a replacement for it
    padding: 12px
  tab-bar-active:
    backgroundColor: '{colors.surface-muted}'
    textColor: '{colors.primary}'
    typography: '{typography.tab-label}'
  readout-bpm:
    backgroundColor: '{colors.background}'
    textColor: '{colors.primary}'
    typography: '{typography.display-xl}'
  readout-duration:
    backgroundColor: '{colors.background}'
    textColor: '{colors.primary}'
    typography: '{typography.display-lg}'
  toast:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.on-surface-soft}'
    typography: '{typography.body-sm}'
    rounded: 14px
    padding: 14px
  status-connected:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.success}'
    typography: '{typography.data-sm}'
  status-disconnected:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.danger}'
    typography: '{typography.data-sm}'
  trace-bar-peak: # HR trace, Z4+
    backgroundColor: '{colors.primary}'
    rounded: 2px
  trace-bar-mid: # HR trace, Z3
    backgroundColor: '{colors.primary-dim}'
    rounded: 2px
  trace-bar-low:
    backgroundColor: '{colors.on-surface-ghost}'
    rounded: 2px
  progress-track:
    backgroundColor: '{colors.surface-track}'
    rounded: '{rounded.full}'
  progress-track-idle:
    backgroundColor: '{colors.surface-track-idle}'
    rounded: '{rounded.full}'
  divider:
    backgroundColor: '{colors.outline}'
  divider-strong:
    backgroundColor: '{colors.outline-strong}'
  focus-ring:
    backgroundColor: '{colors.primary-wash}'
    rounded: '{rounded.lg}'
  input-field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 16px
  caption-legal:
    backgroundColor: '{colors.background}'
    textColor: '{colors.on-surface-muted}'
    typography: '{typography.caption}'
  section-header:
    backgroundColor: '{colors.background}'
    textColor: '{colors.on-surface-dim}'
    typography: '{typography.label-caps}'
  surface-deep: # status bar / edge-to-edge scrim
    backgroundColor: '{colors.background-deep}'
  outline-hairline:
    backgroundColor: '{colors.outline-soft}'
  outline-focus:
    backgroundColor: '{colors.outline-emphasis}'
  divider-success:
    backgroundColor: '{colors.success-outline}'
---

## Overview

Pulse is a **dark-only** heart-rate training app. The visual language is
an instrument panel, not a wellness app: near-black ground, hairline
outlines instead of shadows, and a single high-voltage yellow
(`#F5C518`) reserved for live data and the one action that matters on
each screen.

Three rules drive everything else:

1. **Yellow means "now" or "go."** The live BPM number, the session
   duration on Summary, the START/STOP button, the active tab, and
   high-intensity zones in a trace. Nothing else is yellow. When a
   screen has two yellow things on it, one of them is wrong.
2. **Data is monospaced. Prose is not.** Archivo carries headings and
   sentences; JetBrains Mono carries every number, timestamp, unit,
   signal reading, and all-caps label. The reader should be able to tell
   which is which without reading the content.
3. **Density is calm, not cramped.** A screen holds one dominant
   element, one secondary group, and a list. Whitespace is generous
   between groups (24–34px) and tight inside them (4–14px).

The intended feel is the moment before a hard interval: quiet, dark,
one bright number.

## Colors

The palette is a near-black ground, a seven-step grey ink ramp, and one
accent. There is no light theme — `app.json` sets
`userInterfaceStyle: "dark"` and the accent scores 1.63:1 on white,
which makes a light mode a re-palette rather than an inversion.

**Accent**

- **primary `#F5C518`** — live values and the primary action. 11.75:1 on
  `background`. Never used for a decorative fill larger than a button.
- **on-primary `#141414`** — the only ink that goes on top of yellow.
  Not `background`; the near-black reads slightly warmer against the
  accent.
- **primary-dim `#8A7A20`** — mid-intensity zones in a trace. A muted
  yellow, not a tint of it.
- **primary-wash `#4A4326`** — pressed-state border on tappable cards.
  Signals a touch without lighting anything up.

**Ground** — four steps, each a hair lighter than the last, used to
express elevation without shadow: `background #0F0F10` →
`surface #141415` → `surface-muted #151516` → `surface-raised #191919`.
`background-deep #0A0A0B` sits underneath for edge-to-edge scrims.
`surface-track` / `surface-track-idle` are reserved for progress and
zone bars.

**Outlines** carry the structural work: `outline #242424` for resting
cards, `outline-soft #282828` for hairlines, `outline-strong #333333`
for raised or emphasized cards, `outline-emphasis #3E3E40` for
interactive borders like ghost buttons.

**Ink ramp** — each step is a deliberate contrast tier, not a shade:

| Token              | Hex       | On `background` | Use                                          |
| ------------------ | --------- | --------------- | -------------------------------------------- |
| `on-surface`       | `#F2F3F5` | 17.26:1         | Headings, session titles, primary values     |
| `on-surface-soft`  | `#E4E7EA` | 15.4:1          | Toast copy, body on raised surfaces          |
| `on-surface-chip`  | `#BCBCBE` | 10.5:1          | Chip and pill text                           |
| `on-surface-muted` | `#8A9099` | 5.96:1          | Subtitles, metadata, legal copy — AA floor   |
| `on-surface-faint` | `#6E747D` | 4.07:1          | Inactive tab labels, secondary counts        |
| `on-surface-dim`   | `#5C626B` | 3.12:1          | Section headers, axis labels                 |
| `on-surface-ghost` | `#4A5057` | 2.35:1          | Chevrons, empty trace bars — decorative only |

**Status** — `success #3ECF8E` for a live connection, `danger #FF5A52`
for a dropped one. Both appear as a 7–9px dot plus a word, never as a
fill.

## Typography

Two families, sharply divided:

- **Archivo** (800/700/400) — headings, titles, sentences. Tight
  negative tracking at display sizes; the big numerals are the point.
- **JetBrains Mono** (700/400) — every number, unit, timestamp, RSSI
  reading, button label, and all-caps section header. Positive tracking
  from `1px` at 9px up to `3.4px` on the wordmark.

The scale is deliberately gapped rather than continuous. `display-xl`
at 132px exists for exactly one element — the live BPM — and
`display-lg` at 56px for exactly one more. Everything else lives
between 9px and 34px.

**Hierarchy**

| Token         | Family         | Size / line | Weight | Where                          |
| ------------- | -------------- | ----------- | ------ | ------------------------------ |
| `display-xl`  | Archivo        | 132 / 138   | 800    | Live BPM                       |
| `display-lg`  | Archivo        | 56 / 60     | 800    | Session duration (Summary)     |
| `h1`          | Archivo        | 34 / 38     | 800    | Home greeting                  |
| `h2`          | Archivo        | 32 / 36     | 800    | Pairing, History               |
| `h3`          | Archivo        | 26          | 800    | Summary title, stat values     |
| `stat-md`     | Archivo        | 22          | 800    | History summary figures        |
| `stat-sm`     | Archivo        | 20          | 800    | Day number in a session row    |
| `title-md`    | Archivo        | 17          | 700    | Live session title             |
| `title-sm`    | Archivo        | 15          | 700    | Row and card titles            |
| `body-md`     | Archivo        | 15 / 22     | 400    | Subtitles, descriptions        |
| `body-sm`     | Archivo        | 14          | 400    | Toast, auth prompts            |
| `caption`     | Archivo        | 12 / 19     | 400    | Legal copy                     |
| `action-lg`   | JetBrains Mono | 15          | 700    | Hero CTA                       |
| `action-md`   | JetBrains Mono | 14          | 700    | Primary buttons                |
| `action-sm`   | JetBrains Mono | 12          | 700    | Ghost buttons                  |
| `data-md`     | JetBrains Mono | 12          | 400    | Inline durations, avg bpm      |
| `data-sm`     | JetBrains Mono | 11          | 400    | Zone labels, trend, RSSI       |
| `label-caps`  | JetBrains Mono | 11          | 400    | Section headers (uppercase)    |
| `label-micro` | JetBrains Mono | 10          | 400    | Stat card captions (uppercase) |
| `wordmark`    | JetBrains Mono | 12          | 400    | `PULSE`                        |
| `tab-label`   | JetBrains Mono | 9           | 400    | Tab bar                        |

All-caps applies to `label-caps`, `label-micro`, `wordmark`,
`tab-label`, and every button label. It never applies to body copy or
titles.

Until the Google Fonts packages are loaded, `fontFamily` falls back to
the platform system face and the platform monospace face. The tracking
values assume Archivo and JetBrains Mono; re-check the wordmark and tab
labels after the real fonts land.

## Layout

**Grid.** Single column, 24px horizontal gutters on every screen. No
multi-column layout anywhere; stat cards sit in a flex row with a 10px
gap and split the gutter width evenly.

**Spacing scale** — `4 / 8 / 12 / 16 / 24 / 32`. Values off the scale
are permitted only for optical adjustments already in the design
(26px above the device card, 30px above a section header, 34px under
the greeting).

**Rhythm.** Inside a group, 4–14px. Between groups, 24–34px. This gap
ratio is what makes the screens read as calm at a glance — do not
compress the between-group space to fit more content. Add a scroll
instead.

**Screen skeleton**, top to bottom:

1. Header row — wordmark left, avatar or back control right, 16px from
   the safe area
2. Title block — `h1`/`h2` plus a `body-md` subtitle, 8px apart
3. Primary object — device card, BPM readout, or duration
4. Primary action — full-width button, 56–66px tall
5. Section header — `label-caps` left, an optional `SEE ALL` in yellow
   right
6. List — rows at 10px gaps
7. Tab bar — floating, inset from the gutters and the safe area (see
   Components > Tab bar)

**Touch targets.** Buttons are 56–66px. Rows are ~64px tall. Chips and
the avatar are 34–42px, at the floor of what is acceptable; do not go
below 34px.

## Elevation & Depth

**There are no shadows.** On a `#0F0F10` ground a drop shadow is
invisible, so depth is expressed with three other tools, in this order
of preference:

1. **Surface step.** `background` → `surface` → `surface-muted` →
   `surface-raised`. Each step is a 4–10 point lift in value. A card
   one step up from its parent reads as raised; two steps reads as
   floating and should be rare.
2. **Outline weight.** A 1px border in `outline` is resting;
   `outline-strong` is raised; `outline-emphasis` is interactive. The
   border does more perceptual work here than the fill does.
3. **Radial glow.** A single `react-native-svg` radial gradient behind
   the top of Home and Live, in `primary` at very low alpha, 340px tall
   and offset -60px. It is atmosphere, not a component — never place
   readable text on the glow's brightest region.

Elevation combinations in use:

| Level       | Fill             | Border             | Example                |
| ----------- | ---------------- | ------------------ | ---------------------- |
| Ground      | `background`     | none               | Screen                 |
| Resting     | `surface`        | `outline`          | Session row, stat card |
| Raised      | `surface-raised` | `outline-strong`   | Device card, toast     |
| Inset       | `surface-track`  | none               | Zone bar, progress     |
| Interactive | transparent      | `outline-emphasis` | Ghost button           |

Use `gradientUnits="userSpaceOnUse"` with a circular gradient and a
multi-stop power curve for the glow. Two-stop linear falloff bands
badly on Android.

## Shapes

Corners are generous and consistent — nothing in Pulse is sharp.

| Token  | Radius | Applied to                                |
| ------ | ------ | ----------------------------------------- |
| `sm`   | 12px   | Small tiles, icon containers              |
| `md`   | 16px   | Stat cards, session rows, inputs          |
| `lg`   | 18px   | Device card, ghost buttons                |
| `xl`   | 22px   | Primary buttons, hero CTA, tab bar        |
| `full` | 999px  | Chips, dots, signal bars, progress tracks |

Radius tracks size: the larger the element, the larger the corner. A
60px-tall button gets `xl`; a 44px row gets `md`.

Ancillary shapes: status dots are 7–9px circles; signal bars are 3px
wide at 5/8/11/14px heights with a 1px radius and a 2px gap; trace bars
are 2px-radius columns with a 3px minimum height so an empty slot still
reads as a slot.

## Components

**Primary button** — `primary` fill, `on-primary` label in `action-md`,
`xl` radius, 60px tall, full width. Pressed state drops opacity to
0.82. Disabled swaps the fill to `surface-raised` and the label to
`on-surface-muted` — never a faded yellow. On Home the hero variant is
66px with `action-lg` and a leading play triangle, and its _label
changes with state_: `START WORKOUT` when connected, `CONNECT A
MONITOR` when not.

**Ghost button** — transparent fill, 1px `outline-emphasis` border,
`on-surface-muted` label in `action-sm`, `lg` radius, 56px. The
secondary action in any pair; never two primaries side by side.

**Device card** — `surface-raised` on `outline-strong`, `lg` radius,
18px padding, 14px gap. Leading 42px rounded tile holding a status dot
(`success` connected, `danger` not), title in `title-sm`, subtitle in
`data-md`, trailing `›` chevron in `on-surface-ghost`. Pressed state
shifts the border to `primary-wash`.

**Session row** — `surface` on `outline`, `md` radius. A 44px date
column (`label-micro` month over `stat-sm` day), a 1px × 34px divider,
then title in `title-sm` above a meta line of `data-md` where the
duration is muted and the average bpm is yellow, separated by a 3px
dot. Trailing chevron.

**Stat card** — `surface` on `outline`, `md` radius, 14px padding.
`label-micro` uppercase caption above an `h3` value. The emphasis
variant steps to `surface-raised` / `outline-strong`. Cards live in
rows of two or three with a 10px gap.

**BPM readout** — `display-xl` in `primary`, centered, with a `data-sm`
`BPM` unit at `4.4px` tracking below it and a zone line under that
(`Zone 4 · Threshold` in yellow, the range in `on-surface-dim`). The
number is the only thing on screen at that scale.

**Zone bar** — a horizontal `surface-track` bar segmented into
exclusive buckets Z2–Z5, colored `on-surface-ghost` → `primary-dim` →
`primary` as intensity climbs. Widths are percentages of session time.

**Trace chart** — flex row of bars, each `flex: 1` with 1.5px
horizontal margin, height a 0–1 fraction of the container with a 3px
floor. Color by threshold: ≥152bpm `primary`, ≥130 `primary-dim`, below
that a near-ground grey. Empty slots render at 0.03 height so the axis
stays legible.

**Signal bars** — four 3px columns at rising heights; filled bars use
`primary`, empty use `outline-emphasis`.

**Tab bar** — a JS-rendered floating pill, not a native tab bar (native
tab bars can't express mono uppercase labels or this shape). `64px`
tall, `xl` radius, `24px` inset from each screen edge, floating `16px`
above the device's safe-area bottom inset. `surface-muted` on
`outline`, three items (HOME, HISTORY, DEVICE), 18px glyph over a
`tab-label` (mono, uppercase, `1px` tracking). Active is `primary`,
inactive `on-surface-faint`. The device tab's glyph is a circle; the
others are squares. Screens with scrollable content reserve
`tabBarClearance` (104px) of bottom padding, in addition to the
device's safe-area bottom inset, so content never sits under the bar.

**Toast** — absolutely positioned 24px from each gutter, 110px from the
bottom so it clears the tab bar. `surface-raised` on `outline-strong`,
14px radius, a `success` dot plus `body-sm` copy.

**Live dot** — a 7px `success` circle looping opacity 1 → 0.35 → 1 over
1400ms. The only ambient animation in the app.

## Do's and Don'ts

**Do**

- Reserve `primary` for live values and the one primary action per
  screen.
- Use a monospaced token for anything numeric, including numbers inside
  an otherwise-prose sentence.
- Express elevation with a surface step plus a border weight, in that
  combination.
- Keep one dominant element per screen and let it be genuinely large.
- Change a button's _label_ to communicate state before changing its
  color.
- Keep `on-surface-muted` (`#8A9099`) as the floor for any text a user
  is expected to read; it is the last step that clears WCAG AA at 5.96:1.

**Don't**

- Don't add a second accent color. Status green and red are dots and
  words, not fills, and they are not accents.
- Don't add shadows, blurs, or glassmorphism. The ground is too dark
  for shadows to read and the aesthetic is flat-plus-outline.
- Don't tint yellow to show a disabled state — swap to
  `surface-raised` / `on-surface-muted` instead.
- Don't put `on-surface-dim` or `on-surface-ghost` on text a user must
  read. At 3.12:1 and 2.35:1 they are structural, not legible.
  `on-surface-faint` (4.07:1) clears AA Large only — acceptable for the
  9–12px uppercase labels it is used on today, but it is a known
  compromise, not a pattern to extend.
- Don't compress the 24–34px between-group spacing to fit more content.
- Don't introduce a light theme by inverting the ramp. `primary` is
  1.63:1 on white; a light mode needs a different accent, which is a
  brand decision and not in scope.
- Don't use white (`#FFFFFF`) or pure black (`#000000`) anywhere. The
  ramp tops out at `#F2F3F5` and bottoms at `#0A0A0B`.
- Don't animate anything except the live dot and the BPM ring. This is
  an app people look at mid-effort.

## Motion

Minimal and slow. Two loops only:

- **Live dot** — opacity 1 → 0.35 → 1, 1400ms, `ease-in-out`, native
  driver.
- **BPM ring** — the same easing at 1200ms.

Pressed states are instant opacity changes (0.82), not transitions.
Screen transitions use the platform default. Anything faster than
1000ms or more elaborate than opacity is out of character.

## Platform Notes

Written for React Native / Expo, dark-only:

- `app.json` sets `userInterfaceStyle: "dark"` and
  `backgroundColor: "#0F0F10"` on both platforms. There is no light
  variant to keep in sync.
- Dimensions are density-independent pixels; `px` in this file maps 1:1
  to a React Native unitless style value.
- All styling is `StyleSheet` against these tokens — no UI kit, no
  Tailwind. A new component consumes `colors` / `fonts` / `space` /
  `radius` rather than declaring literals.
- Portrait only, phone only (`supportsTablet: false`). There are no
  breakpoints; layouts flex within a single 24px-guttered column.

## Agent Prompt Guide

Quick reference for generation:

```
Dark-only. Ground #0F0F10, cards #141415 with 1px #242424 borders,
raised #191919 with #333333. Text #F2F3F5, muted #8A9099. One accent:
#F5C518, on black ink #141414 — live numbers and the single primary
action only. Archivo 800 for headings with negative tracking; JetBrains
Mono for all numbers, units, and uppercase labels with positive
tracking. Radii 12/16/18/22, pills at 999. Spacing 4/8/12/16/24/32,
24px gutters. No shadows, no second accent, no light mode.
```

When adding a screen, state which element is the dominant one and which
single control is primary before writing any styles. If the answer is
"two things," the screen needs splitting.

---

_Format: [DESIGN.md](https://github.com/google-labs-code/design.md)
(Google Labs, alpha). Validate with
`npx @google/design.md lint DESIGN.md`._
