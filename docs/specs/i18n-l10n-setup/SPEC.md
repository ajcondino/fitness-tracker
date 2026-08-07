# Feature: i18n / l10n Setup

## Intent

User-facing strings render through an i18next translation layer instead of English literals, the device's language is detected automatically via `expo-localization`, and adding a new language later means adding a JSON file — not touching component code.

## Context

- **Problem statement:** No i18n library is configured anywhere in the repo (confirmed: `i18next`, `react-i18next`, and `expo-localization` are absent from `package.json`). User-facing strings are hardcoded English literals directly in JSX, e.g. `"Edit src/app/index.tsx to edit this screen."` in [src/app/index.tsx](../../../src/app/index.tsx#L6) and `"Something went wrong"` / `"Try again"` in [src/components/error-fallback.tsx](../../../src/components/error-fallback.tsx#L11-L14). There is no locale-detection, no translation-file structure, and no established pattern for adding new strings.
- **Current code:** The app is a minimally-scaffolded Expo Router project (per `CLAUDE.md`, "no app-specific fitness-tracking features exist yet"). Only three components currently render user-facing text:
  - `src/app/index.tsx` — placeholder screen text.
  - `src/components/error-fallback.tsx` — error title, dynamic `error.message`, and a retry button label.
  - `src/components/error-boundary.tsx` — renders `ErrorFallback`, no strings of its own.
    There is no `src/app/explore.tsx`, `app-tabs`, `themed-text`, or `theme.ts` in the current tree, despite being referenced in `CLAUDE.md`'s Architecture section — that section is stale relative to the actual repo state and is not used as a basis for this spec.
- **User impact:** No visible change for English-speaking users (the base locale renders identical strings). Establishes the extraction pattern and infrastructure so future screens/components author strings in `en.json` from day one, and future locales can be added without a rewrite.
- **Dependencies:**
  - New runtime packages: `i18next`, `react-i18next`, `expo-localization` (must be added at the SDK 57–compatible version; `expo-localization@~57.0.1` is the current SDK 57–aligned release — verify against https://docs.expo.dev/versions/v57.0.0/sdk/localization/ during implementation per `AGENTS.md`).
  - No backend/service dependency — translations ship as static bundled JSON, no remote translation-management service.
  - `jest-expo`'s preset does not ship a mock for `expo-localization`, so a manual Jest mock is required for deterministic tests (see Files Created).

## Data Model

- `SupportedLocale` — union type of locale codes the app ships translations for. Initially `'en'` only (`type SupportedLocale = 'en'`), defined as `const supportedLocales = ['en'] as const`.
- `en.json` translation resource — a nested plain-JSON object, one top-level key per screen/component (camelCase, matching the owning file), leaf values are the translated strings for that key. No interpolation variables are needed yet (no dynamic user-facing strings besides `error.message`, which is not translated — it's the raw `Error` message and passes through unchanged).
- No persistence and no database changes. Locale selection is derived at runtime from the device and is not stored (no AsyncStorage/user-override — see Constraints).
- i18next's in-memory resource bundle is the only "data model" involved: `{ en: { translation: <en.json contents> } }`.

## Interfaces / API

- **`src/i18n/index.ts`** (default export: configured `i18next` instance; side-effecting on import — calling `i18n.use(initReactI18next).init(...)` runs once per process, subsequent imports reuse the module-cached instance):
  - `resolveDeviceLocale(): SupportedLocale` — named export, pure function. Reads `getLocales()` from `expo-localization`, takes the first entry's `languageCode`, and returns it if it's a member of `supportedLocales`; otherwise returns `defaultLocale`. Exported specifically so it's unit-testable without rendering a component.
  - `defaultLocale: 'en'` — named export constant, also used as i18next's `fallbackLng`.
  - `supportedLocales: readonly ['en']` — named export constant.
  - i18next `init()` config contract: `{ lng: resolveDeviceLocale(), fallbackLng: defaultLocale, defaultNS: 'translation', resources: { en: { translation: en } }, interpolation: { escapeValue: false } }`. `escapeValue: false` is set because React already escapes output — this is the standard react-i18next recommendation, not new escaping behavior.
- **Component usage contract:** any component rendering user-facing text calls `const { t } = useTranslation()` from `react-i18next` and replaces literals with `t('<namespace>.<key>')`, e.g. `t('errorFallback.title')`. Dynamic values (e.g. `error.message`) are passed through as-is, never routed through `t()`.
- **Failure/fallback behavior:** if `getLocales()` returns an empty array or an unsupported `languageCode` (e.g. device set to a language with no translation file yet), `resolveDeviceLocale()` falls back to `'en'`. If a lookup key is missing from the active locale's resource, i18next falls back to `fallbackLng` (`'en'`); if missing there too, i18next's default behavior returns the key string itself (no custom `missingKeyHandler` is introduced by this feature).
- No new commands, endpoints, or public app-facing APIs are introduced — this is internal application wiring.

## Files Created

| File                             | Purpose                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/index.ts`              | Configures and exports the `i18next` instance: device-locale detection via `expo-localization`, resource loading, `initReactI18next` wiring.                                |
| `src/i18n/locales/en.json`       | Base (and currently only) locale's translation strings, namespaced by owning screen/component.                                                                              |
| `src/i18n/i18next.d.ts`          | TypeScript module augmentation (`CustomTypeOptions`) so `t('...')` calls are typed/autocompleted against `en.json`'s shape.                                                 |
| `__mocks__/expo-localization.ts` | Jest manual mock for the `expo-localization` native module (returns a fixed English locale), auto-applied by Jest for all tests since `jest-expo` ships no mock of its own. |
| `jest.setup.ts`                  | Jest `setupFiles` entry that imports `@/i18n` before any test file's modules load, guaranteeing i18next is initialized before component tests render translated text.       |

## Files Modified

| File                                | Change                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                      | Add `i18next`, `react-i18next`, `expo-localization` dependencies; add `"setupFiles": ["<rootDir>/jest.setup.ts"]` under the existing `"jest"` config.               |
| `src/app/_layout.tsx`               | Add a side-effect import of `@/i18n` so i18next initializes once at app startup, before `RootLayout` renders.                                                       |
| `src/app/index.tsx`                 | Replace the hardcoded placeholder string with `useTranslation()` + `t('index.placeholder')`.                                                                        |
| `src/components/error-fallback.tsx` | Replace `"Something went wrong"` and `"Try again"` literals with `t('errorFallback.title')` / `t('errorFallback.retry')`; `error.message` stays untranslated.       |
| `CLAUDE.md`                         | Add a short bullet under Architecture documenting the `src/i18n/` setup and the convention that new user-facing strings go into `en.json`, not inline JSX literals. |
| `pnpm-lock.yaml`                    | Regenerated by `pnpm install` after the dependency additions — not hand-edited.                                                                                     |

Existing test files (`src/app/__tests__/index.test.tsx`, `src/components/__tests__/error-fallback.test.tsx`) are **not expected to need literal-text changes**, since `en.json`'s values match today's strings exactly — the `jest.setup.ts` addition is what keeps them passing (i18next initialized before render). They're listed under Implementation Steps for verification, not under Files Modified, since no edit is anticipated.

## Implementation Steps

1. Verify the SDK 57–compatible version of `expo-localization` against https://docs.expo.dev/versions/v57.0.0/sdk/localization/ (per `AGENTS.md`), then run `pnpm add i18next react-i18next expo-localization`.
2. Create `src/i18n/locales/en.json` with the initial namespaced keys: `index.placeholder` and `errorFallback.title` / `errorFallback.retry`, using today's exact English strings as values.
3. Create `src/i18n/index.ts`: implement `resolveDeviceLocale()`, `defaultLocale`, `supportedLocales`, and call `i18n.use(initReactI18next).init(...)` per the Interfaces/API contract above; export the configured instance as default.
4. Create `src/i18n/i18next.d.ts` augmenting `i18next`'s `CustomTypeOptions` with `defaultNS: 'translation'` and `resources: { translation: typeof en }` so `t()` keys are type-checked.
5. Add `import '@/i18n';` as the first import in `src/app/_layout.tsx` (before the `Sentry.init` call), so the instance is configured before any screen mounts.
6. Update `src/components/error-fallback.tsx` and `src/app/index.tsx` to call `useTranslation()` and use `t()` for the two literals identified above.
7. Create the root-level `__mocks__/expo-localization.ts` manual mock exporting `getLocales()` returning a single fixed English locale entry (e.g. `languageCode: 'en'`), so locale detection is deterministic under Jest regardless of the CI host's environment.
8. Create `jest.setup.ts` importing `@/i18n` for its side effect; wire it into `package.json`'s `"jest"` config via `"setupFiles"`.
9. Add a focused unit test (e.g. `src/i18n/__tests__/index.test.ts`) covering `resolveDeviceLocale()`: returns the device locale when it's in `supportedLocales`, and falls back to `defaultLocale` when the device reports an unsupported or missing `languageCode` (mock `expo-localization`'s `getLocales` per-test with `jest.spyOn`/`jest.mock` override for the unsupported case).
10. Run the existing test suite unmodified and confirm `src/app/__tests__/index.test.tsx` and `src/components/__tests__/error-fallback.test.tsx` still pass — they assert against the literal text, which now flows through `t()` but resolves to the same English string.
11. Add the CLAUDE.md Architecture bullet documenting the convention (new strings go into `src/i18n/locales/en.json`, referenced via `useTranslation()`/`t()`, not inline).
12. Verify with the repository's standard checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Style & Conventions

- Follow `tsconfig.json`'s `@/*` path alias — import as `@/i18n`, not a relative path (per `CLAUDE.md`'s Architecture guidance).
- Match existing component conventions: functional components, `StyleSheet.create` for styles (unchanged by this feature), named exports for components (as in `error-fallback.tsx`, `error-boundary.tsx`).
- Namespace translation keys by owning component/screen (camelCase matching the file's primary export, e.g. `errorFallback`, `index`) rather than a flat key list — keeps `en.json` scannable as the app grows and avoids key collisions across screens.
- Per `AGENTS.md` / `CLAUDE.md`'s Expo version notice, confirm `expo-localization`'s API (`getLocales`) against the versioned v57 docs before implementing, since the model's training data may predate SDK 57's exact surface.
- Keep the `reactCompiler` experiment's constraints in mind (`app.json`) — `useTranslation()` is a standard hook call and doesn't require manual memoization either way.
- Colocate the new unit test under `src/i18n/__tests__/`, consistent with the existing `__tests__` colocation pattern (`src/app/__tests__/`, `src/components/__tests__/`).

## Acceptance Criteria

- [ ] `i18next`, `react-i18next`, and `expo-localization` are installed at SDK 57–compatible versions and appear in `package.json`/`pnpm-lock.yaml`.
- [ ] `src/i18n/index.ts` initializes i18next with the device's detected locale, falling back to `en` when the device locale isn't in `supportedLocales`.
- [ ] `src/app/index.tsx` and `src/components/error-fallback.tsx` contain no hardcoded user-facing English string literals — all route through `t()` against keys defined in `src/i18n/locales/en.json`.
- [ ] `resolveDeviceLocale()` has a passing unit test covering both the supported-locale and fallback-to-default branches.
- [ ] `src/app/__tests__/index.test.tsx` and `src/components/__tests__/error-fallback.test.tsx` pass unmodified.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.
- [ ] CLAUDE.md documents the new `src/i18n/` convention for future contributors.

## Constraints

- **Scope**: this feature ships infrastructure plus a base `en.json` — it does not add a second language. Non-English translation files are explicit future work.
- **No manual language switcher**: locale is device-detected only; there is no in-app UI or persisted user override to pick a language. Adding one (and the AsyncStorage-backed persistence it implies) is a separate, future feature.
- **No RTL support**: right-to-left layout handling is out of scope until an RTL language is actually added.
- **No pluralization/date/number formatting work**: the app currently has no dynamic counts or dates in user-facing strings, so i18next's plural/interpolation features beyond simple key lookup aren't exercised or validated by this feature.
- **`CLAUDE.md`'s Architecture section is stale** relative to the current repo (references `app-tabs`, `themed-text`, `theme.ts`, `explore.tsx`, none of which currently exist) — this spec does not attempt to reconcile that drift beyond adding its own accurate bullet; a full doc audit is out of scope here.
- **Verify at implementation time**: whether `expo-localization` requires any `app.json` config-plugin entry under SDK 57 (recent SDK versions have not required one, but this must be confirmed against the v57 docs per `AGENTS.md` before considering the setup complete).
