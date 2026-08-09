# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

@AGENTS.md

## Read the versioned docs before writing Expo code

This project pins **Expo SDK ~57**, which is newer than your training data. Before touching any Expo API — `expo-router`, native tabs, splash screen, `expo-localization`, BLE — read https://docs.expo.dev/versions/v57.0.0/. Do not assume the API shape you remember is still current.

## How to work here

- **Spec before code.** Behaviour lives in `docs/` before it's implemented. If a ticket has no spec, write the spec and stop for review.
- **Plan before diff.** For anything touching more than one file, propose the plan — files added/changed, component boundaries, prop shapes — and stop. The plan is the review gate.
- **Don't invent cross-cutting structure.** Shared components, navigation structure, and theme tokens are decided by hand. Consume what exists; if something shared is missing, say so rather than creating it.
- **Additive diffs on working screens.** When adding to a screen that already works, don't restructure or tidy surrounding code in the same change.
- **Exemplars** — match the patterns in these files rather than inferring from the wider codebase:
  - Screen: `<TODO: path>`
  - Presentational component: `<TODO: path>`
  - Test: `<TODO: path>`

## Documentation layout

- `docs/*.md` — behaviour specs. Flat, one named file per feature area.
- `DESIGN.md` — the single source of truth for visual language (colour tokens, type scale, spacing, component specs). There is no `docs/design-system.md`.
- `README.md` — setup and tooling only.
- Don't create directories preemptively.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml`) — never `npm` or `yarn`.

- `pnpm start` — Metro dev server
- `pnpm android` / `pnpm ios` — `expo run:*` (dev client build, not Expo Go — native BLE modules require it)
- `pnpm web` — web build
- `pnpm lint` — lint
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Jest
- `pnpm reset-project` — **destructive.** Moves starter code to `app-example/` and blanks `src/app`. Never run without explicit instruction.

**CI** (`.github/workflows/ci.yml`): `lint`, `typecheck`, `test` on push/PR to `main` and `develop`, Node 22. Pre-commit is deliberately lint-only via `lint-staged` — tests are a CI-only gate and shouldn't be added to the hook.

## Theming

The app is **dark-only** (`userInterfaceStyle: "dark"` in `app.json`). Accent is `#F5C518`, which sits at ~1.6:1 on white — light mode is not a cheap addition and is not planned. Do not add light-mode branches, `useColorScheme` conditionals, or paired light/dark token sets.

- Tokens live in `src/constants/theme.ts`; resolve them via `src/hooks/use-theme.ts`.
- Consume through `themed-text.tsx` / `themed-view.tsx`. Never hardcode a colour or spacing value in a screen.
- Any new token must exist in `DESIGN.md` first.
- Styling is `StyleSheet.create` fed from `constants/theme.ts`. `src/global.css` only declares CSS custom properties for web font stacks — this is **not** Tailwind/NativeWind.

## Architecture

- **Routing** — `expo-router` file-based, `typedRoutes` on. Routes in `src/app/`; `src/app/_layout.tsx` is the root layout.
- **Tabs** — `src/app/(tabs)/_layout.tsx` uses `expo-router`'s JS `<Tabs>` with a custom `tabBar` render prop, not `expo-router/unstable-native-tabs`. NativeTabs was tried first and dropped: it can't render the DESIGN.md tab bar (mono uppercase labels with letter-spacing, floating rounded pill). `src/components/TabBar.tsx` is the presentational bar — it reads `state`/`descriptors` from the `<Tabs>` render prop and calls back into `navigation`; it holds no navigation logic of its own. Follow the `.web.tsx` platform-extension convention only if a web-specific bar becomes necessary — none exists yet.
- **Path aliases** — `@/*` → `src/*`, `@/assets/*` → `assets/*`. Use these, not relative paths across directories.
- **React Compiler** is enabled (`reactCompiler` experiment). Skip manual `useMemo`/`useCallback` the compiler handles, and respect its constraints: rules of hooks, no mutating props or state.
- **Native projects** — `android/` is generated and checked in. Change config via `app.json` and config plugins; hand-edit native files only as a last resort, and say why.

## i18n

`src/i18n/index.ts` wires `i18next` + `react-i18next`, resolving device locale via `expo-localization` and falling back to `en`. `src/i18n/locales/en.json` is the base locale, namespaced by owning screen/component.

**Every user-facing string goes in `en.json` and renders via `t('<namespace>.<key>')`.** Inline JSX string literals are a bug, not a shortcut.

## Testing

Per Expo's [Unit testing with Jest](https://docs.expo.dev/develop/unit-testing/) guide (SDK 57).

- **Preset**: `jest-expo`, configured under `"jest"` in `package.json`.
- **Components**: `@testing-library/react-native` v14+. Not `react-test-renderer` directly — it doesn't support React 19.
- **`render()` is async in v14+.** Always `await render(...)` inside an `async` test, or `screen` queries throw `` `render` function has not been called ``.
- Tests live in `__tests__/` colocated with the code under test (`src/app/__tests__/index.test.tsx`).
- `tsconfig.json` lists `"jest"` in `compilerOptions.types`, so globals type-check without imports.

## EAS Build & Updates

Android only; iOS isn't built or updated. Only a `preview` channel/profile exists — there's no `production` profile, and this being a training project, don't add one.

- **`eas.json`** — single `preview` profile: Android, `buildType: apk`, `distribution: internal`, `channel: preview`.
- **`app.json`** — `runtimeVersion` uses the **`fingerprint`** policy, not `appVersion`. This is load-bearing: it's what lets a build's native fingerprint match an OTA update's.
- **`.eas/workflows/deploy-preview.yml`** — on push to `main` or `develop`: fingerprint the native layer → `get-build` for that fingerprint → build if absent, else publish an OTA update to `preview`. Both branches feed the same channel.
- **One-time manual setup** (needs an interactive, authenticated `eas` CLI — you can't do this):
  - `eas env:create --environment preview` — the workflow's `fingerprint` job runs under an EAS Environment named `preview` (a secrets scope, distinct from the update channel). Missing it fails the run.
  - `eas channel:create preview` — must exist before `publish_android_update` targets it.
