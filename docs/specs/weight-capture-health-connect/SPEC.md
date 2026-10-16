# Feature: Weight Capture, Profile Field, and Health Connect Write

Issue: [#67](https://github.com/ajcondino/fitness-tracker/issues/67) (Milestone 3: Optional Stretch)

## Intent

A person can enter their body weight once (prompted on first launch after upgrade) and edit it any time from Profile in their chosen weight unit; every entry is stored locally in kilograms with a timestamp, written to Health Connect's body-weight record when permitted, and the latest entry is available to any future consumer (calorie calculation) through one function — all without disturbing the existing exercise/heart-rate write permission.

## Context

- **Problem statement:** The app stores no body weight. `src/units/units.ts` has a `'weight'` quantity (canonical kg) and Profile has a weight toggle (`UnitsSection`), but nothing consumes them — a grep of `src/` for `weight` outside `src/units/`, `src/sync/` and `src/hooks/use-units-preference.ts` finds nothing. Health Connect permission is limited to `ExerciseSession` and `HeartRate` writes (`REQUIRED_PERMISSIONS` in `src/health/health-connect-client.ts`; `WRITE_EXERCISE` / `WRITE_HEART_RATE` in `app.json` → `android.permissions`). No calorie code exists yet (`session-activity-type` SPEC explicitly defers it), so the "downstream consumer" is a future ticket.
- **Current code:**
  - `src/units/units.ts` — `convertUnit(value, quantity, system)` goes canonical → display only; there is **no inverse** (display → canonical), which this feature needs. `formatUnit` renders weight at 1 decimal (`154.3 lb`).
  - `src/units/units-store.ts` + `src/hooks/use-units-preference.ts` — `weight: UnitSystem` preference, optimistic setter. Synced to Firestore by `use-preferences-sync.ts` (units only).
  - `src/health/health-connect-client.ts` — `checkHealthConnectPermission()` returns true iff **every** entry of `REQUIRED_PERMISSIONS` is granted (`hasAllRequiredPermissions`); `requestHealthConnectPermission()` requests `REQUIRED_PERMISSIONS` and applies the same all-or-nothing test. **Consequence (the risk the issue names):** naïvely appending `{write, Weight}` to `REQUIRED_PERMISSIONS` would make every already-granted user read as "not granted" — `deriveStatus()` in `use-health-connect-settings.ts` would flip to `notGranted`, and `syncWorkoutSessionToHealthConnect` / `autoSyncWorkoutSessionToHealthConnect` (both gate on `checkHealthConnectPermission()`) would stop writing workouts. This spec avoids that by keeping workout and body-weight permissions separate (see Interfaces).
  - `src/health/health-connect-store.ts` — `loadDeclineCount` / `recordDeclinedAttempt` / `clearDeclineCount` implement the two-decline lockout; `use-health-connect-settings.ts` treats `DECLINE_COUNT_EXHAUSTED_THRESHOLD = 2` as exhausted. `loadWriteBackEnabled` is the user's write-back toggle.
  - `src/health/health-connect-writer.ts` — `insertRecords` wrapper; precedent: mixed record types must be separate calls; timestamps always from the record, never `Date.now()` at sync time.
  - `src/workout/workout-store.ts` — AsyncStorage persistence with schema-versioned records and parse-to-safe-default; the precedent for store shape.
  - `src/app/profile.tsx` — sections stack (`AccountSection`, `HealthConnectSection`, `UnitsSection`). `src/app/(tabs)/index.tsx` is the Home tab.
  - No `TextInput` is used anywhere in `src/`; `DESIGN.md` defines an `input-field` component token (surface bg, `on-surface` text, `body-md`, `rounded.md`, 16px padding) but no shared input primitive exists.
- **User impact:** Existing users see a one-time, dismissible weight prompt on Home after upgrading; Profile gains a Weight section. Entered weight shows up in Health Connect. No change to workout recording or sync.
- **Dependencies:**
  - Units preference (`units-preference`), cloud preference sync (unchanged), Health Connect permissions and workout sync specs.
  - `react-native-health-connect@^4.1.3` already installed — **verify at implementation** the exact `Weight` record shape in `node_modules/react-native-health-connect/lib/typescript/types/records.types.d.ts` (expected `recordType: 'Weight'`, `time` ISO string, `weight: { value, unit: 'kilograms' }`) and the permission record-type name `'Weight'`.
  - **Native change:** adding `android.permission.health.WRITE_WEIGHT` to `app.json` changes the native fingerprint. `android/` is gitignored (CNG), so it needs `expo prebuild --clean`, and under the `fingerprint` runtime policy the EAS workflow will build a new APK rather than publish an OTA update. Existing installs cannot receive the new permission via OTA.

## Data Model

- `WeightEntry`:
  - `id: string` — unique per entry (same id generator as workout records; confirm in `workout-store.ts` / `use-workout-session.ts` at implementation).
  - `recordedAt: number` — epoch ms, set when the entry is saved. Also the Health Connect `time`.
  - `kg: number` — canonical value, always kilograms regardless of display unit. Stored at full precision (no pre-rounding), so lb → kg → lb round-trips display identically at 1 decimal.
  - `healthConnect: { status: 'notWritten' | 'written' | 'failed'; recordId: string | null }` — reuses the vocabulary of `HealthConnectWriteStatus` in `workout-record.ts` (import the type; do not redeclare).
- **Persistence** (`@react-native-async-storage/async-storage`, framework-free store, best-effort reads/writes, corrupt data → safe default, never throws — mirrors `health-connect-store.ts`):
  - `weight.entries` — JSON array of `WeightEntry`. Parsing drops any element failing validation (non-finite/non-positive `kg`, non-finite `recordedAt`, bad status) rather than discarding the whole array.
  - `weight.promptDismissed` — `'true'` once the first-launch prompt was saved _or_ dismissed.
  - A single array key (not one key per entry) is chosen because the list is tiny (one entry per manual edit) and "latest" needs a scan anyway. Not versioned yet; a future schema change adds a version key.
- **Invariants:**
  - `kg` is within `[MIN_WEIGHT_KG, MAX_WEIGHT_KG]` = `[20, 500]` (a decision, not a platform limit — guards typos like `7` or `700`; revisit if the requester wants different bounds).
  - **Editing appends a new entry; it never mutates an old one.** History is preserved and each value is written to Health Connect as its own timestamped record (Health Connect weight is a time series, so an in-place overwrite would be wrong).
  - "Latest" = entry with greatest `recordedAt` (ties: later array position).
- **Relationship to existing models:** independent of `WorkoutRecord` — no field is added to workout records, no workout schema bump. Not synced to Firestore (see Constraints).

## Interfaces / API

### `src/units/units.ts` (modified, pure)

- `export function toCanonicalUnit(value: number, quantity: UnitQuantity, system: UnitSystem): number` — inverse of `convertUnit`: metric passthrough; imperial divides by the same `IMPERIAL_FACTOR` (so `toCanonicalUnit(convertUnit(x, q, s), q, s) ≈ x`). Same no-validation contract as `convertUnit` (callers validate).

### `src/weight/weight-store.ts` (framework-free)

- `export const MIN_WEIGHT_KG = 20; export const MAX_WEIGHT_KG = 500;`
- `loadWeightEntries(): Promise<WeightEntry[]>` — sorted ascending by `recordedAt`; `[]` on missing/corrupt/throw.
- `getLatestWeightKg(): Promise<number | null>` — **the single read path for downstream consumers** (calorie calculation); `null` when no entry exists.
- `addWeightEntry(kg: number, recordedAt?: number): Promise<WeightEntry>` — validates range (throws `RangeError` on out-of-range/non-finite — a programmer error, since the UI validates first), appends with status `'notWritten'`, returns the entry. A failed storage write is swallowed like the other stores, but the returned entry is still returned so the UI can proceed this session.
- `updateWeightEntryHealthConnect(id: string, info: WeightEntry['healthConnect']): Promise<void>` — rewrites one entry's sync info.
- `loadWeightPromptDismissed(): Promise<boolean>` / `saveWeightPromptDismissed(): Promise<void>`.

### `src/health/health-connect-client.ts` (modified)

- `REQUIRED_PERMISSIONS` — **unchanged** (`ExerciseSession`, `HeartRate`). `checkHealthConnectPermission()` semantics unchanged. This is what keeps existing workout writes and the Profile status chain unaffected.
- `export const BODY_WEIGHT_PERMISSION: Permission = { accessType: 'write', recordType: 'Weight' }`.
- `export async function checkBodyWeightPermission(): Promise<boolean>` — read-only, no dialog; true iff the granted list contains `BODY_WEIGHT_PERMISSION`.
- `requestHealthConnectPermission()` (existing, Profile "grant access") — now requests `[...REQUIRED_PERMISSIONS, BODY_WEIGHT_PERMISSION]` in one dialog so new grants cover everything, but its return value stays "all `REQUIRED_PERMISSIONS` granted" — declining only body weight is **not** a workout-permission decline and must not feed the workout decline count.
- `export async function requestBodyWeightPermission(): Promise<boolean>` — requests `[...REQUIRED_PERMISSIONS, BODY_WEIGHT_PERMISSION]` (re-requesting the already-granted pair is how Health Connect's dialog scopes — it only prompts for the missing one; **verify on a device** that already-granted permissions are not re-prompted and do not get revoked), returns true iff `BODY_WEIGHT_PERMISSION` ends up granted. Must only be called after `hasScreenLock()` is true and availability is `'available'`.

### `src/health/health-connect-writer.ts` (modified)

- `export async function writeWeightToHealthConnect(entry: WeightEntry): Promise<string>` — one `insertRecords([{ recordType: 'Weight', time: new Date(entry.recordedAt).toISOString(), weight: { value: entry.kg, unit: 'kilograms' } }])`, returns the first id. Throws on failure (caller owns translation to status), same contract as `writeWorkoutSessionToHealthConnect`. Uses the entry's own `recordedAt`, never `Date.now()`.

### `src/health/weight-sync.ts` (new, framework-free)

- `export type WeightSaveResult = 'written' | 'localOnly'`-style outcome via:
  `export type WeightSyncOutcome = { status: 'written' } | { status: 'skipped'; reason: 'writeBackOff' | 'unavailable' | 'noScreenLock' | 'permissionExhausted' | 'denied' | 'error' }`
- `export async function saveWeightAndSync(kg: number): Promise<{ entry: WeightEntry; outcome: WeightSyncOutcome }>`:
  1. `addWeightEntry(kg)` first — the local save is unconditional and never depends on Health Connect.
  2. If `loadWriteBackEnabled()` is false → `skipped/writeBackOff`.
  3. If availability is `'unavailable'` → `skipped/unavailable`; if `!hasScreenLock()` → `skipped/noScreenLock`.
  4. If `checkBodyWeightPermission()` is false: if `loadDeclineCount() >= 2` → `skipped/permissionExhausted` (**never prompts when locked out**); else the person just deliberately saved a weight, so call `requestBodyWeightPermission()` **once**; if still denied → `recordDeclinedAttempt()` (shared counter — the lockout is a platform-level rule for the app, not per type) and `skipped/denied`.
  5. Write every entry whose status is not `'written'`, oldest first (backfills earlier entries that were saved before permission existed), updating each via `updateWeightEntryHealthConnect`. A failure marks that entry `'failed'` and outcome `skipped/error` for the new entry only if it's the new one that failed.
  - Never throws; every failure becomes an outcome.
- On a successful grant, `clearDeclineCount()` is **not** called here (the workout flow owns that; weight grant shouldn't reset a workout lockout heuristic).

### `src/hooks/use-weight.ts`

```
useWeight(): {
  latestKg: number | null | undefined;  // undefined while loading
  save: (kg: number) => Promise<WeightSyncOutcome>;
}
```

Loads on mount; `save` calls `saveWeightAndSync`, updates `latestKg`, returns the outcome so the caller can show a notice. No AppState listener.

### UI

- `src/components/weight-input.tsx` — shared controlled field: `{ unit: UnitSystem; initialKg: number | null; onSubmit: (kg: number) => void; submitLabel: string; testIDPrefix: string }`. Parses the typed decimal (accepts `,` or `.`), converts via `toCanonicalUnit(value, 'weight', unit)`, validates against `[MIN_WEIGHT_KG, MAX_WEIGHT_KG]` **after conversion**, shows an inline error string on invalid input and does not call `onSubmit`. Initial text shows `convertUnit(initialKg, 'weight', unit)` at 1 decimal with the unit suffix as an adornment (kg/lb). Styled from the `input-field` token via `useTheme()`.
- `src/components/weight-section.tsx` — Profile section (header `label-caps` + `surface`/`outline`/`md` card, same shape as `UnitsSection`): shows current weight via `formatUnit`, a `WeightInput` to enter/edit, and a non-blocking notice line after a save whose outcome was `skipped` (not an error state; no modal, no blocking). Props: `{ latestKg: number | null | undefined; unit: UnitSystem; onSave: (kg: number) => Promise<WeightSyncOutcome> }`.
- `src/components/weight-prompt.tsx` — one-time first-launch prompt (RN `Modal`, transparent, dismissible): contains `WeightInput` + "Not now". Props: `{ visible: boolean; unit: UnitSystem; onSave: (kg: number) => Promise<WeightSyncOutcome>; onDismiss: () => void }`. Saving or dismissing persists `weight.promptDismissed`.
- Home (`src/app/(tabs)/index.tsx`) shows `WeightPrompt` when `latestKg === null` and the prompt was not dismissed. Chosen over a new route/screen so no navigation structure is added.
- **Notice copy** for outcomes comes from `en.json` (`weight.notice.*`) keyed by `reason`; `writeBackOff` shows no notice (it is the person's own setting).

### Errors & compatibility

- Invalid input never reaches the store (UI validation) and never touches Health Connect.
- Storage failure: entry exists in memory for the session; no user-facing error (matches repo convention).
- Existing installs with Health Connect already granted for exercise/HR keep working unchanged; they simply have no weight write grant until their first weight save triggers the one scoped request.

## Files Created

| File                                               | Purpose                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/weight/weight-store.ts`                       | Framework-free AsyncStorage store: entries, latest-weight read, prompt-dismissed flag.               |
| `src/health/weight-sync.ts`                        | `saveWeightAndSync`: local-first save, then gated Health Connect write with decline-lockout respect. |
| `src/hooks/use-weight.ts`                          | Thin hook over store + sync for screens.                                                             |
| `src/components/weight-input.tsx`                  | Shared validated, unit-aware weight field.                                                           |
| `src/components/weight-section.tsx`                | Profile Weight section.                                                                              |
| `src/components/weight-prompt.tsx`                 | One-time first-launch prompt modal.                                                                  |
| `src/weight/__tests__/weight-store.test.ts`        | Store: defaults, corrupt data, append, latest, range validation, error swallowing.                   |
| `src/health/__tests__/weight-sync.test.ts`         | Sync: local-first, each skip reason, lockout never prompts, backfill, no throw.                      |
| `src/hooks/__tests__/use-weight.test.ts`           | Hook: loading state, save updates latest, returns outcome.                                           |
| `src/components/__tests__/weight-input.test.tsx`   | Parsing, both-unit conversion, validation after conversion, error display.                           |
| `src/components/__tests__/weight-section.test.tsx` | Render, edit → save, non-blocking notice.                                                            |
| `src/components/__tests__/weight-prompt.test.tsx`  | Visible/hidden, save, "Not now".                                                                     |

## Files Modified

| File                                                         | Change                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.json`                                                   | Add `android.permission.health.WRITE_WEIGHT` to `android.permissions`.                                                                                                                                                                               |
| `src/units/units.ts`                                         | Add `toCanonicalUnit` (inverse conversion).                                                                                                                                                                                                          |
| `src/units/__tests__/units.test.ts`                          | Inverse conversion and round-trip tests in both directions.                                                                                                                                                                                          |
| `src/health/health-connect-client.ts`                        | Add `BODY_WEIGHT_PERMISSION`, `checkBodyWeightPermission`, `requestBodyWeightPermission`; widen the set `requestHealthConnectPermission` asks for while keeping its success test on `REQUIRED_PERMISSIONS`. `REQUIRED_PERMISSIONS` itself unchanged. |
| `src/health/__tests__/health-connect-client.test.ts`         | Regression: workout permission check ignores weight; weight-only decline doesn't fail the workout grant; new functions.                                                                                                                              |
| `src/health/health-connect-writer.ts`                        | Add `writeWeightToHealthConnect`.                                                                                                                                                                                                                    |
| `src/health/__tests__/health-connect-writer.test.ts`         | Weight record mapping (kilograms, ISO time from `recordedAt`).                                                                                                                                                                                       |
| `src/app/profile.tsx`                                        | Add `<WeightSection>` (after `UnitsSection`) wired to `useWeight()` + `useUnitsPreference().weight`. Additive only.                                                                                                                                  |
| `src/app/__tests__/profile.test.tsx`                         | Mock `useWeight`; section renders and saves.                                                                                                                                                                                                         |
| `src/app/(tabs)/index.tsx`                                   | Mount `WeightPrompt` with `useWeight()` / dismissed flag. Additive only.                                                                                                                                                                             |
| `src/app/(tabs)/__tests__/index.test.tsx`                    | Prompt shown only when no entry and not dismissed.                                                                                                                                                                                                   |
| `src/i18n/locales/en.json`                                   | Add `weight` namespace (section, labels, placeholder, validation error, prompt title/body/"Not now", notice per skip reason).                                                                                                                        |
| `docs/specs/health-connect-availability-permissions/SPEC.md` | One-line note that `REQUIRED_PERMISSIONS` stays workout-only and body weight is tracked separately (cross-reference to this spec).                                                                                                                   |

## Implementation Steps

1. Add `toCanonicalUnit` to `src/units/units.ts`; extend `units.test.ts` (kg↔lb both directions, metric passthrough, round-trip of a displayed lb value stays equal at 1 decimal).
2. Create `weight-store.ts` + `weight-store.test.ts` (range validation, latest-by-timestamp, per-element corruption drop).
3. Verify the `Weight` record and permission shape against the installed `react-native-health-connect` type declarations; update this spec if it differs.
4. Add `BODY_WEIGHT_PERMISSION`, `checkBodyWeightPermission`, `requestBodyWeightPermission` and the widened request in `health-connect-client.ts`; add regression tests proving `checkHealthConnectPermission()` is true for an exercise+HR-only grant and that a weight-only denial does not make `requestHealthConnectPermission()` resolve false.
5. Add `writeWeightToHealthConnect` + tests.
6. Create `weight-sync.ts` + tests covering: local save happens even when everything else fails; each `skipped` reason; **no `requestBodyWeightPermission` call when decline count ≥ 2**; one request max per save; decline increments the shared count; backfill of earlier non-written entries; never throws.
7. Create `use-weight.ts` + test.
8. Add `weight` strings to `en.json` (every user-facing string via `t()`).
9. Create `weight-input.tsx` + test, then `weight-section.tsx` + test, then `weight-prompt.tsx` + test.
10. Wire `WeightSection` into `profile.tsx` and `WeightPrompt` into the Home tab; extend both screens' tests.
11. Add `android.permission.health.WRITE_WEIGHT` to `app.json`; run `expo prebuild --clean` locally to regenerate `android/`.
12. Add the cross-reference note to the Health Connect permissions spec.
13. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`.
14. Manual device check (Android dev client build): fresh enter → value in Health Connect; edit → second record; toggle kg/lb and confirm conversion both ways; deny the weight permission → local save + notice; deny twice → no further dialog; existing exercise/HR grant still reads as granted and a workout still syncs.

## Style & Conventions

- Kebab-case component files, PascalCase names; composed components live directly in `src/components/` (`CLAUDE.md`).
- New domain folder `src/weight/` follows `src/units/` / `src/health/` (one folder per concern, framework-free store).
- Hooks are thin and optimistic like `use-units-preference.ts`; no manual `useMemo`/`useCallback` (React Compiler).
- All strings through `t('weight.*')`; no inline JSX literals.
- No hardcoded colors/spacing; styles via `StyleSheet.create` from `constants/theme.ts` and `useTheme()`. The text field uses the existing `input-field` token in `DESIGN.md`; **no new token is introduced**.
- **Deliberate flag — shared structure:** `CLAUDE.md` says shared primitives are decided by hand. There is no text-input primitive today, so `weight-input.tsx` is a feature-level component (not `ui/`), and a reusable `ui/text-field` is intentionally _not_ created. If the team wants a primitive, that is a separate decision.
- Additive diffs on `profile.tsx` and `(tabs)/index.tsx`; no restructuring.
- Tests: `@testing-library/react-native` v14 — `await render(...)` in async tests; colocated `__tests__/`.
- Package manager pnpm only.

## Acceptance Criteria

- [ ] A weight can be entered (Profile and first-launch prompt), edited (adds a new timestamped entry), and the latest value is shown after an app restart (`weight-store.test.ts`, `use-weight.test.ts`; device smoke test).
- [ ] The entered value appears in Health Connect as a body-weight record at the entry's `recordedAt` (`health-connect-writer.test.ts`; device check in Health Connect).
- [ ] Conversion is correct in both directions: entering `154.3` in lb stores ≈ `69.99` kg and displays `154.3 lb`; entering `70` in kg stores `70`; stored `kg` is canonical regardless of display unit; switching the unit toggle re-renders the same stored value (`units.test.ts`, `weight-input.test.tsx`).
- [ ] Out-of-range input (below 20 kg or above 500 kg _after_ conversion), empty, or non-numeric input shows an inline error and saves nothing.
- [ ] Declining the Health Connect permission (or write-back off, or Health Connect unavailable) still saves locally, and shows a non-blocking notice (except write-back off), with no modal and no blocked UI (`weight-sync.test.ts`, `weight-section.test.tsx`).
- [ ] Adding the body-weight scope does not break the existing permission: `checkHealthConnectPermission()` is still `true` for an exercise+HR-only grant, `deriveStatus()` still yields `grantedEnabled`, and `syncWorkoutSessionToHealthConnect` still writes (`health-connect-client.test.ts`, unmodified `health-connect-sync.test.ts` and `use-health-connect-settings.test.ts` pass).
- [ ] With decline count ≥ 2, saving a weight never calls `requestBodyWeightPermission` (`weight-sync.test.ts`).
- [ ] `getLatestWeightKg()` returns the newest entry's kg, or `null` when none exist.
- [ ] The first-launch prompt appears once when no weight exists, and not again after save or "Not now" (`index.test.tsx`, `weight-prompt.test.tsx`).
- [ ] `app.json` declares `android.permission.health.WRITE_WEIGHT` alongside the existing health permissions.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Constraints

- **Non-goals:** calorie calculation (only `getLatestWeightKg()` is provided for it); weight history/graph UI; deleting entries; importing weight _from_ Health Connect (this app never requests read permission); Firestore sync of weight (the existing units sync is unchanged; syncing weight is a follow-up); iOS.
- **Native build required.** The `app.json` permission change alters the native fingerprint → new APK via the EAS workflow, not OTA; local dev needs `expo prebuild --clean` (`android/` is generated and gitignored). Until a person installs the new build, the weight write simply reports `skipped/denied`-style and stays local.
- **Re-prompt / lockout:** weight permission is requested only as the direct result of the person saving a weight (never on launch, never in the background), at most once per save, and never when the shared decline count is ≥ 2. The decline counter is shared with the workout flow because the lockout is app-level; a consequence is that two weight denials will also move Profile's Health Connect section to `permissionExhausted` even though workout permissions are granted — **open question for the requester:** accept this, or track a separate weight counter (more code, but avoids mislabelling the workout state)? Default in this spec: shared.
- **Unverified on-device facts** (confirm during step 3/14): the `Weight` record/permission names in the library; that re-requesting already-granted permissions only prompts for the missing one; behaviour of Health Connect with identical timestamps for back-to-back edits (entries within the same millisecond are not expected from manual entry).
- **Weight bounds** `[20, 500]` kg are a product decision to be confirmed, not a platform constraint.
- **First-launch prompt placement** (Home tab modal) is chosen to avoid adding a route; the ticket's alternative trigger ("first entry into a flow that needs it") has no flow yet, so it is deferred to the calorie ticket, which can call `getLatestWeightKg()` and open the same `WeightPrompt` if it returns `null`.
- Entries are append-only; the list is unbounded but in practice tiny. No pruning in this ticket.
