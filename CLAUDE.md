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
- `pnpm test` — run the Jest test suite (`jest`)

## Testing

Set up per Expo's [Unit testing with Jest](https://docs.expo.dev/develop/unit-testing/) guide (SDK 57).

- **Preset**: `jest-expo` (configured under `"jest"` in `package.json`), which mocks the native parts of the Expo SDK.
- **Component testing**: `@testing-library/react-native` (v14+) — not `react-test-renderer` directly, which doesn't support React 19. Import `render`/`screen` from `@testing-library/react-native`.
- **`render()` is async in `@testing-library/react-native` v14+** — always `await render(...)` inside an `async` test, or queries against `screen` will throw `` `render` function has not been called `` because the result hasn't been registered yet.
- Test files live in `__tests__` directories colocated with the code under test (e.g. `src/app/__tests__/index.test.tsx`).
- `tsconfig.json` includes `"jest"` in `compilerOptions.types` so Jest globals (`describe`, `it`, `expect`) type-check without imports.

## Architecture

- **Routing**: file-based routing via `expo-router`, with `typedRoutes` enabled in `app.json`. Route files live in `src/app/`; `src/app/_layout.tsx` is the root layout, wrapping the app in `ThemeProvider` (light/dark from `react-native`'s `useColorScheme`) and rendering `AppTabs`.
- **Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@/assets/*` → `assets/*`. Use these instead of relative imports across directories.
- **Tab navigation**: `src/components/app-tabs.tsx` uses `expo-router/unstable-native-tabs` (`NativeTabs`) — this is an unstable/experimental Expo Router API, distinct from the older `Tabs` API. There's a separate `app-tabs.web.tsx` for web, following Expo's platform-extension convention (`.web.tsx` overrides for web-only implementations, e.g. `use-color-scheme.web.ts`, `animated-icon.web.tsx`).
- **Theming**: `src/constants/theme.ts` defines `Colors` (light/dark), `Fonts`, `Spacing`, and layout constants (`BottomTabInset`, `MaxContentWidth`). `src/hooks/use-theme.ts` resolves the active theme's color object; components like `themed-text.tsx`/`themed-view.tsx` consume it. Prefer these over hardcoded colors/spacing.
- **Styling**: primarily `StyleSheet.create` with values from `constants/theme.ts`. `src/global.css` only defines CSS custom properties for font stacks (used on web via `Fonts.web`) — this is not a Tailwind/NativeWind setup, just plain CSS custom properties imported for the web target.
- **New Architecture / Expo features enabled**: `reactCompiler` experiment is on (`app.json`), so avoid manual memoization patterns the compiler already handles, and be aware compiler constraints (rules of hooks, no mutating props/state) apply.
- **Native projects**: `android/` directory is present (generated). Prefer changing config via `app.json`/plugins over hand-editing native project files where possible.
