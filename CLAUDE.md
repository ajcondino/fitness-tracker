# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Expo version notice

@AGENTS.md

This project pins Expo SDK ~57, which is newer than many models' training data. **Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code that touches Expo APIs** (router, splash screen, native tabs, etc.) — APIs may have changed from what you expect.

## Project state

This is a freshly scaffolded Expo app (`create-expo-app` tabs template, "fitness-tracker" package). No app-specific fitness-tracking features exist yet — `src/app/index.tsx` and `src/app/explore.tsx` are still the default template screens. Treat existing screens/components as starter scaffolding to be replaced, not established patterns to preserve.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml` present) — use `pnpm` not `npm`/`yarn` for installs.

- `pnpm start` — start the Metro dev server (Expo)
- `pnpm android` — build and run on Android (`expo run:android`)
- `pnpm ios` — build and run on iOS (`expo run:ios`)
- `pnpm web` — start the web build (`expo start --web`)
- `pnpm lint` — lint via `expo lint` (no ESLint config file exists yet in the repo; running it for the first time may prompt to create one)
- `pnpm reset-project` — moves the starter template code into `app-example/` and creates a blank `src/app`. Do not run this without explicit user instruction — it's a destructive scaffolding reset.
- `pnpm typecheck` — type-check via `tsc --noEmit`
- `pnpm test` — run the Jest test suite (`jest`)

## CI

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on push/PR to `main` and `develop` (Node 22, matching Expo SDK 57's documented minimum). Pre-commit (`.husky/pre-commit`) intentionally stays lint-only (`lint-staged`) — running the full test suite on every commit doesn't scale as it grows, so tests are a CI-only gate.

## Testing

Set up per Expo's [Unit testing with Jest](https://docs.expo.dev/develop/unit-testing/) guide (SDK 57).

- **Preset**: `jest-expo` (configured under `"jest"` in `package.json`), which mocks the native parts of the Expo SDK.
- **Component testing**: `@testing-library/react-native` (v14+) — not `react-test-renderer` directly, which doesn't support React 19. Import `render`/`screen` from `@testing-library/react-native`.
- **`render()` is async in `@testing-library/react-native` v14+** — always `await render(...)` inside an `async` test, or queries against `screen` will throw `` `render` function has not been called `` because the result hasn't been registered yet.
- Test files live in `__tests__` directories colocated with the code under test (e.g. `src/app/__tests__/index.test.tsx`).
- `tsconfig.json` includes `"jest"` in `compilerOptions.types` so Jest globals (`describe`, `it`, `expect`) type-check without imports.

## EAS Build & Updates

Android only — iOS is not built or updated (not planned soon). Only a `preview` channel/profile exists so far; there is no `production` profile yet.

- **`eas.json`**: single `preview` build profile — Android, `buildType: apk`, `distribution: internal`, `channel: preview`.
- **`app.json`**: `runtimeVersion` uses the `fingerprint` policy (not `appVersion`) and `updates.url` points at the EAS project (`extra.eas.projectId`). The `fingerprint` policy is required for the workflow below — it's what lets a build's native fingerprint be matched against an OTA update's fingerprint.
- **`.eas/workflows/deploy-preview.yml`**: runs on push to `main` or `develop`. Computes a fingerprint of the native layer → checks whether an Android build already exists for that fingerprint (`get-build`, profile `preview`) → if not, builds Android (`build`, profile `preview`); if one exists, publishes an OTA update to the `preview` channel/branch instead of rebuilding. Both branches feed the same `preview` channel — there's no `production` profile/channel (this is a training project, not headed to production), so no need to split them by branch.
- **One-time manual EAS setup** (not doable from a non-interactive session, needs an authenticated `eas` CLI):
  - `eas env:create --environment preview` — the workflow's `fingerprint` job runs under an EAS **Environment** named `preview` (env vars/secrets scope, distinct from the update channel); create it if missing or the workflow run fails at that step.
  - `eas channel:create preview` — ensures the `preview` update branch/channel exists before `publish_android_update` tries to publish to it.

## Architecture

- **Routing**: file-based routing via `expo-router`, with `typedRoutes` enabled in `app.json`. Route files live in `src/app/`; `src/app/_layout.tsx` is the root layout, wrapping the app in `ThemeProvider` (light/dark from `react-native`'s `useColorScheme`) and rendering `AppTabs`.
- **Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@/assets/*` → `assets/*`. Use these instead of relative imports across directories.
- **Tab navigation**: `src/components/app-tabs.tsx` uses `expo-router/unstable-native-tabs` (`NativeTabs`) — this is an unstable/experimental Expo Router API, distinct from the older `Tabs` API. There's a separate `app-tabs.web.tsx` for web, following Expo's platform-extension convention (`.web.tsx` overrides for web-only implementations, e.g. `use-color-scheme.web.ts`, `animated-icon.web.tsx`).
- **Theming**: `src/constants/theme.ts` defines `Colors` (light/dark), `Fonts`, `Spacing`, and layout constants (`BottomTabInset`, `MaxContentWidth`). `src/hooks/use-theme.ts` resolves the active theme's color object; components like `themed-text.tsx`/`themed-view.tsx` consume it. Prefer these over hardcoded colors/spacing.
- **Styling**: primarily `StyleSheet.create` with values from `constants/theme.ts`. `src/global.css` only defines CSS custom properties for font stacks (used on web via `Fonts.web`) — this is not a Tailwind/NativeWind setup, just plain CSS custom properties imported for the web target.
- **New Architecture / Expo features enabled**: `reactCompiler` experiment is on (`app.json`), so avoid manual memoization patterns the compiler already handles, and be aware compiler constraints (rules of hooks, no mutating props/state) apply.
- **Native projects**: `android/` directory is present (generated). Prefer changing config via `app.json`/plugins over hand-editing native project files where possible.
- **i18n/l10n**: `src/i18n/index.ts` configures `i18next` + `react-i18next`, detecting the device locale via `expo-localization` (`resolveDeviceLocale()`), falling back to `en` when unsupported. `src/i18n/locales/en.json` is the base (currently only) locale, namespaced by owning screen/component. New user-facing strings go into `en.json` and are rendered via `useTranslation()`/`t('<namespace>.<key>')` — never as inline JSX string literals.
