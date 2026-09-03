# Feature: Units Preference (Metric/Imperial)

## Intent

Profile has a Units section where a person independently chooses metric or imperial for distance and for weight, the choice survives a cold start, and every future feature that needs to display a distance or weight calls one shared conversion/formatting function instead of converting inline.

## Context

- **Problem statement:** Pulse has no units preference, no unit-conversion code, and nothing to convert — confirmed by repo-wide search (`grep -rni "unit" src`, `grep -rni "imperial\|metric" src`): the only "unit" in the app today is heart rate in bpm (unit-agnostic) and durations. `src/app/profile.tsx:15-19` already carries a comment naming this exact gap: _"per CLAUDE.md's 'don't invent cross-cutting structure,' a Units section isn't built yet, so it isn't listed here."_ This ticket builds it.
- **Current code:**
  - `src/app/profile.tsx` renders `<AccountSection>` then `<HealthConnectSection>` inside a `gap: spacing.xl` column — the established slot for a third settings section.
  - `src/components/health-connect-section.tsx` is the exemplar for a labeled settings section on this screen: a `label-caps`/`onSurfaceFaint` section header above a `surface`/`outline`/`md`-radius card (`health-connect-section.tsx:187-201`), with a title/caption/`Toggle` row for a live boolean setting (`:81-99`).
  - `src/components/ui/toggle.tsx` is the only switch primitive in the app — generic, theme-token-only, no animation. Two independent instances (one per quantity) reuse it as-is; no variant needed.
  - `src/health/health-connect-store.ts` and `src/ble/saved-device.ts` are the established local-persistence shape: a framework-free module wrapping `@react-native-async-storage/async-storage` directly, one key per concern, every read swallowing failure/corruption to a safe default and never throwing.
  - `src/hooks/use-health-connect-settings.ts` is the established "thin hook over a store" shape: loads on mount, exposes optimistic (fire-and-forget-persist, immediate-state-update) setters — `setWriteBackEnabled` (`:117-123`) is the direct precedent for this ticket's setters.
  - **A units-sync promise already exists in shipped copy.** `src/i18n/locales/en.json`'s `account.signedOut.body` (as of this branch's HEAD, `1fae87a`) reads _"Sign in to carry your units to another phone. Workouts stay on this device either way."_ — i.e. the sign-in pitch already tells the user units follow their account, but today there is no units preference for it to carry. This ticket makes the sentence describe a real (if not-yet-synced) preference; it does not yet make the sentence fully true, since Firestore sync is explicitly out of scope here (see Constraints). No code change to that string is proposed — it's forward-looking copy, and stays accurate in spirit once this ticket lands.
  - **No language picker exists.** Per `docs/specs/i18n-l10n-setup/SPEC.md`'s Constraints ("No manual language switcher... locale is device-detected only... Adding one... is a separate, future feature") and a repo-wide search (`grep -rni "language" src`) turning up nothing beyond the tab label "Home"/etc. resource keys — there is no language-picker UI, hook, or persistence anywhere in `src/`. The ticket that will sync this preference and language together to Firestore assumes both preferences already exist in the app; **that assumption is currently false for language**, so that follow-up ticket needs a language-picker ticket sequenced before or alongside it. This spec does not build one — out of scope here — but records the gap per this ticket's own request.
- **User impact:** A new "Units" section appears on Profile with two independent toggles (Distance: km/mi, Weight: kg/lb). No other screen changes behavior — there is no distance or weight data anywhere in the app yet for the choice to affect.
- **Dependencies:** None new. Reuses `@react-native-async-storage/async-storage` (already a dependency, used by `health-connect-store.ts` and `saved-device.ts`) and the existing `Toggle` primitive. No new package.

## Data Model

- `UnitSystem = 'metric' | 'imperial'` — the only two states either preference can hold.
- `UnitQuantity = 'distance' | 'weight'` — the two quantities this ticket's conversion layer knows about. **Not** an extensible/open union — adding a third quantity (pace, speed, elevation) is Milestone 3's job, per the ticket's "do not design ahead."
- `UnitsPreference = { distance: UnitSystem; weight: UnitSystem }` — the shape the hook and section exchange. Not persisted as a single JSON blob; see below.
- **Persistence:** two independent AsyncStorage string keys, `units.distance` and `units.weight`, each holding the literal string `'metric'` or `'imperial'` — mirrors `health-connect-store.ts`'s "one key per concern, not one JSON blob" choice, and keeps the two toggles storage-independent (matches their being independent UI controls).
- **Default:** `'metric'` for both, when nothing is persisted yet or a value fails to parse. No locale-based default (e.g. imperial for a US device locale) — not requested by the ticket, and inventing one would be exactly the speculative scope the ticket asks to avoid. Unlike `writeBackEnabled`'s `true` default (justified there by "granting access is itself the opt-in"), there's no equivalent asymmetry between metric and imperial, so the simpler literal default is used without a matching justification needed.
- **Relationship to existing models:** none — no existing type or persisted record represents distance or weight today, so there is nothing to migrate or reconcile.
- **Not synced to Firestore.** `src/auth/`, `src/health/`, and `src/workout/` have no Firestore write path for user preferences today (Health Connect's `writeBackEnabled` is also local-only). This preference follows the same local-only precedent; syncing it is the named follow-up ticket.

## Interfaces / API

**`src/units/units.ts`** — the single place any conversion happens; pure, no imports beyond none needed.

- `export type UnitSystem = 'metric' | 'imperial'`
- `export type UnitQuantity = 'distance' | 'weight'`
- `export function convertUnit(value: number, quantity: UnitQuantity, system: UnitSystem): number` — `value` is always expressed in the quantity's canonical base unit (**meters** for `'distance'`, **kilograms** for `'weight'`), so future callers (GPS distance in meters, a scale reading in kilograms) never need their own conversion step first. Returns `value` unchanged for `distance`+`metric` and `weight`+`metric` (base unit _is_ the metric display unit for both quantities chosen here); for `imperial` returns `value / 1609.344` (distance, → miles) or `value * 2.2046226218` (weight, → pounds).
- `export function formatUnit(value: number, quantity: UnitQuantity, system: UnitSystem): string` — calls `convertUnit`, rounds to a fixed decimal count per quantity (distance: 2 decimals; weight: 1 decimal — chosen for plausible display precision at the magnitudes each quantity is used at; not configurable, since no caller has asked for a different precision yet), and appends a space plus the unit abbreviation (`km` / `mi` / `kg` / `lb`), e.g. `formatUnit(5000, 'distance', 'metric') → "5.00 km"`, `formatUnit(5000, 'distance', 'imperial') → "3.11 mi"`, `formatUnit(70, 'weight', 'imperial') → "154.3 lb"`.
- **Compatibility/error behavior:** both functions assume a finite, non-negative `value` — the caller's responsibility, since no real caller exists yet to define what an invalid input should mean (a GPS glitch's negative distance and a scale's dropped reading are Milestone 3 problems). No `NaN`/`Infinity` guard is added; documented as a deliberate non-goal in Constraints, not an oversight.
- No pace/speed/elevation conversion, no unit other than the four above, no formatting locale-awareness (e.g. no comma thousands separator) — none requested, none added.

**`src/units/units-store.ts`** — framework-free, mirrors `health-connect-store.ts`'s shape exactly.

- `export async function loadUnitsPreference(): Promise<UnitsPreference>` — reads both keys; each independently falls back to `'metric'` on a missing key, an unparseable value, or a thrown read.
- `export async function saveDistanceUnit(system: UnitSystem): Promise<void>`
- `export async function saveWeightUnit(system: UnitSystem): Promise<void>` — both best-effort: a thrown write is swallowed, never surfaced, matching `saveWriteBackEnabled`'s contract ("a failed write is not a user-facing failure").

**`src/hooks/use-units-preference.ts`** — thin hook, no business logic beyond wiring.

- `export function useUnitsPreference(): { distance: UnitSystem; weight: UnitSystem; setDistanceUnit: (system: UnitSystem) => void; setWeightUnit: (system: UnitSystem) => void }`
- State initializes synchronously to `{ distance: 'metric', weight: 'metric' }` (the real default, not a sentinel "loading" value — unlike `useHealthConnectSettings`'s `'checking'` status, there is no misleading transient state to avoid here, since metric is a legitimate value even before the async load resolves) and is overwritten once `loadUnitsPreference()` resolves, on mount only — no `AppState` re-check, since nothing outside this app can change this value (unlike Health Connect's OS-level permission, which can be revoked from system settings).
- `setDistanceUnit`/`setWeightUnit` are optimistic: they update state immediately and call the corresponding store setter without awaiting it, mirroring `setWriteBackEnabled`'s "fire-and-forget" precedent.

**`src/components/units-section.tsx`** — presentational, feature-level (composed, not a `ui/` primitive — it owns Units-specific copy and layout, same tier as `health-connect-section.tsx`).

- `export type UnitsSectionProps = { distance: UnitSystem; weight: UnitSystem; onSetDistanceUnit: (system: UnitSystem) => void; onSetWeightUnit: (system: UnitSystem) => void }`
- Renders the `label-caps`/`onSurfaceFaint` "UNITS" header, then one `surface`/`outline`/`md`-radius card holding two rows (Distance, Weight), each: a `titleSm` label, a `dataSm`/`onSurfaceMuted` caption naming the current unit (e.g. "Kilometers (km)" / "Miles (mi)"), and a `Toggle` whose `value` is `system === 'imperial'` and whose `onValueChange` calls the matching `onSet*Unit` with `'imperial'`/`'metric'`. `testID`s: `units-distance-toggle`, `units-weight-toggle`.

## Files Created

| File                                               | Purpose                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/units/units.ts`                               | Pure conversion + formatting utility — the only place unit conversion happens.                                  |
| `src/units/units-store.ts`                         | AsyncStorage persistence for the two unit preferences, framework-free.                                          |
| `src/hooks/use-units-preference.ts`                | Thin hook: loads the preference on mount, exposes optimistic setters.                                           |
| `src/components/units-section.tsx`                 | Profile screen's Units settings section (two labeled toggle rows).                                              |
| `src/units/__tests__/units.test.ts`                | Unit tests for `convertUnit`/`formatUnit` — both quantities, both systems.                                      |
| `src/units/__tests__/units-store.test.ts`          | Persistence tests mirroring `health-connect-store.test.ts`'s default/corrupt/round-trip/error-swallowing cases. |
| `src/hooks/__tests__/use-units-preference.test.ts` | Hook tests: initial default, post-load values, optimistic setter behavior.                                      |
| `src/components/__tests__/units-section.test.tsx`  | Renders both rows, asserts toggle state and press → callback wiring.                                            |

## Files Modified

| File                                 | Change                                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/profile.tsx`                | Add `<UnitsSection>` wired to `useUnitsPreference()`, placed after `<HealthConnectSection>`; update the file's top comment (currently states a Units section "isn't built yet") to reflect that it now exists. |
| `src/app/__tests__/profile.test.tsx` | Mock `useUnitsPreference`; add tests that the section renders and that its toggle presses call the hook's setters, following the existing `mockHealthConnectSettings`/`mockAuth` pattern.                      |
| `src/i18n/locales/en.json`           | Add a `units` namespace: section header and, per quantity, a label, a toggle accessibility label, and metric/imperial captions.                                                                                |

## Implementation Steps

1. Create `src/units/units.ts`: `UnitSystem`, `UnitQuantity`, `convertUnit`, `formatUnit`, with the conversion factors and decimal/suffix rules from Interfaces/API.
2. Add `src/units/__tests__/units.test.ts` covering: metric passthrough for both quantities, imperial conversion for both quantities (assert exact expected numbers for at least one round value per quantity, e.g. 1609.344 m → 1.00 mi), and `formatUnit`'s decimal rounding and suffix for all four (quantity × system) combinations.
3. Create `src/units/units-store.ts`: `loadUnitsPreference`, `saveDistanceUnit`, `saveWeightUnit`, following `health-connect-store.ts`'s try/catch-to-default shape exactly.
4. Add `src/units/__tests__/units-store.test.ts` mirroring `health-connect-store.test.ts`'s structure: default-when-unset, corrupt-value-falls-back-to-default, save/load round-trip, and swallowed read/write errors — for both keys independently.
5. Create `src/hooks/use-units-preference.ts` per Interfaces/API; no `AppState` listener.
6. Add `src/hooks/__tests__/use-units-preference.test.ts`: asserts the synchronous `'metric'`/`'metric'` initial render, the post-`loadUnitsPreference`-resolution update, and that calling a setter both updates the returned state and calls the matching store function — mocking `@/units/units-store` the way `use-health-connect-settings.test.ts` mocks `@/health/health-connect-store`.
7. Create `src/components/units-section.tsx` per Interfaces/API, reusing `Toggle`, `ThemedText`, `ThemedView`, and `spacing`/`theme.rounded` tokens — no new token.
8. Add the `units` namespace to `src/i18n/locales/en.json` (section header, two labels, two toggle accessibility labels, four captions) and render every string in `units-section.tsx` through `t()` — no inline literal.
9. Add `src/components/__tests__/units-section.test.tsx`: both rows render with the right initial caption/toggle state for a metric/metric and an imperial/imperial props case, and pressing each toggle calls the matching `onSet*Unit` prop with the opposite system.
10. Wire `<UnitsSection>` into `src/app/profile.tsx` below `<HealthConnectSection>`, sourced from `useUnitsPreference()`; update the screen's existing "Units section isn't built yet" comment so it no longer describes stale scope.
11. Extend `src/app/__tests__/profile.test.tsx`: mock `useUnitsPreference` (default-return helper alongside the existing `mockHealthConnectSettings`/`mockAuth`), assert the Units section renders, and assert pressing `units-distance-toggle`/`units-weight-toggle` calls the mocked setters.
12. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` and fix any failures.

## Style & Conventions

- File naming: kebab-case filenames, PascalCase component name (`UnitsSection` in `units-section.tsx`) — per `CLAUDE.md`.
- `units-section.tsx` lives directly under `src/components/` (composed, feature-specific), not `src/components/ui/` — same tier as `health-connect-section.tsx`, per `CLAUDE.md`'s primitive/composed split.
- `src/units/` is a new top-level domain folder, matching the existing `src/auth/`, `src/ble/`, `src/health/`, `src/workout/` pattern of one folder per domain concern with its own store module.
- Every user-facing string goes through `t('units.<key>')` against `src/i18n/locales/en.json` — no inline JSX literal, per `CLAUDE.md`'s i18n section.
- No hardcoded color/spacing in `units-section.tsx` — resolve via `useTheme()` and `constants/theme.ts`, per `CLAUDE.md`'s Theming section. No new `DESIGN.md` token is introduced; the section reuses `label-caps`, `titleSm`, `dataSm`, existing surface/outline colors, and `rounded.md`, all already established by `health-connect-section.tsx`.
- Persistence follows the repo's established framework-free-store convention (`health-connect-store.ts`, `saved-device.ts`): no React/BLE/health import in `units-store.ts`, every read/write best-effort.
- `render()` is async under `@testing-library/react-native` v14+ — every new component test `await render(...)` inside an `async` test, per `CLAUDE.md`'s Testing section.
- Additive diff on `profile.tsx`: only the new section and its one wiring block are added; no restructuring of `AccountSection`/`HealthConnectSection`'s existing layout, per `CLAUDE.md`'s "additive diffs on working screens."

## Acceptance Criteria

- [ ] The Units section appears on Profile below Health Connect, with independent Distance (km/mi) and Weight (kg/lb) toggles.
- [ ] Toggling either unit persists it via AsyncStorage, and the chosen state is restored after a cold start (app reload) — verified by `use-units-preference.test.ts`'s load-then-render assertion and, at a smoke-test level, by re-mounting `<Profile>` in `profile.test.tsx` after a simulated persisted value.
- [ ] `convertUnit`/`formatUnit` in `src/units/units.ts` are covered by `units.test.ts` without rendering any component, and are usable standalone (no hook, no store import) by a future caller.
- [ ] No existing screen's rendered output or behavior changes — `pnpm test` passes for all pre-existing suites unmodified, since no other file reads `src/units/*`.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.

## Constraints

- **No Firestore sync.** The preference is local-only (AsyncStorage), exactly like `writeBackEnabled`. Syncing it — and reconciling it with the sign-in copy's existing "carry your units to another phone" promise — is an explicit follow-up ticket, not this one.
- **No distance, weight, pace, or speed feature.** Nothing in the app calls `convertUnit`/`formatUnit` yet; this ticket is infrastructure only, and that is deliberate (see Intent) — say so in the PR description, not just here, so it doesn't read as unfinished.
- **No speculative conversion surface.** `UnitQuantity` is exactly `'distance' | 'weight'`; no pace/speed/elevation quantity, no configurable decimal precision, no locale-aware number formatting (thousands separators, RTL digits) is added ahead of a real caller.
- **No language picker.** One doesn't exist anywhere in the app today (confirmed above). This ticket doesn't add one. The units+language Firestore-sync follow-up ticket currently assumes both preferences exist in-app — flag to whoever scopes that ticket that a language-picker ticket needs to land first (or be folded into it) for that assumption to hold.
- **No locale-based default.** Both units default to `'metric'` regardless of device region; a smarter default (e.g. imperial for a US locale) is not requested and not added.
- **No input validation in the conversion utility.** `convertUnit`/`formatUnit` assume finite, non-negative input and do not guard against `NaN`/`Infinity`/negative values — there is no real caller yet to define correct behavior for bad input, and guessing would be the speculative design the ticket explicitly warns against.
- **Two independent toggles, not one metric/imperial switch** — resolved per this spec's discussion with the requester in favor of matching the mock (distance and weight can be set independently), over the milestone brief's simpler single-switch framing.
